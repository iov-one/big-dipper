// https://github.com/zondax/cosmos-delegation-js/
// https://github.com/cosmos/ledger-cosmos-js/blob/master/src/index.js
import 'babel-polyfill';
import TransportWebUSB from "@ledgerhq/hw-transport-webusb";
import { IovLedgerApp } from "@iov/ledger-iovns"
import { signatureImport } from "secp256k1"
import semver from "semver"
import bech32 from "bech32";

// TODO: discuss TIMEOUT value
const INTERACTION_TIMEOUT = 10000
const REQUIRED_COSMOS_APP_VERSION = "2.16.1"
const CHAIN_ID = Meteor.settings.public.chainId;
const DEFAULT_DENOM = CHAIN_ID.toLowerCase().indexOf( "mainnet" ) != -1 ? "uiov" : "uvoi";
const DEFAULT_GAS = 200000;
export const DEFAULT_GAS_PRICE = Meteor.settings.public.gasPrice;
export const DEFAULT_MEMO = 'Sent via Big Dipper'

/*
HD wallet derivation path (BIP44)
DerivationPath{44, 234, account, 0, index}
*/

const HDPATH = [44, 234, 0, 0, 0]
const BECH32PREFIX = Meteor.settings.public.bech32PrefixAccAddr
const ADDRESS_INDEX = 0;

export const toPubKey = (address) => {
    return bech32.decode(Meteor.settings.public.bech32PrefixAccAddr, address);
}

const ERROR_DESCRIPTION = {
    1: "U2F: Unknown",
    2: "U2F: Bad request",
    3: "U2F: Configuration unsupported",
    4: "U2F: Device Ineligible",
    5: "U2F: Timeout",
    14: "Timeout",
    0x9000: "No errors",
    0x9001: "Device is busy",
    0x6802: "Error deriving keys",
    0x6400: "Execution Error",
    0x6700: "Wrong Length",
    0x6982: "Empty Buffer",
    0x6983: "Output buffer too small",
    0x6984: "Data is invalid",
    0x6985: "Conditions not satisfied",
    0x6986: "Transaction rejected",
    0x6a80: "Bad key handle",
    0x6b00: "Invalid P1/P2",
    0x6d00: "Instruction not supported",
    0x6e00: "IOV app does not seem to be open",
    0x6f00: "Unknown error",
    0x6f01: "Sign/verify error",
};

export function errorCodeToString(statusCode) {
    if (statusCode in ERROR_DESCRIPTION) return ERROR_DESCRIPTION[statusCode];
    return `Unknown Status Code: ${statusCode}`;
}

/**
 * Replace the ledger-cosmos-js app with @iov/ledger-iovns.
 */
class CosmosApp extends IovLedgerApp {
    constructor(transport) {
        super(transport);

        this.superGetVersion = super.getVersion;
        this.superSign = super.sign;
    }


    async appInfo() {
        const response = await this.transport.send(0xb0, 0x01, 0, 0).catch( e => { throw e } );

        const errorCodeData = response.slice(-2);
        const returnCode = errorCodeData[0] * 256 + errorCodeData[1];

        const result = {};

        let appName = "err";
        let appVersion = "err";
        let flagLen = 0;
        let flagsValue = 0;

        if (response[0] !== 1) {
            // Ledger responds with format ID 1. There is no spec for any format != 1
            result.error_message = "response format ID not recognized";
            result.return_code = 0x9001;
        } else {
            const appNameLen = response[1];
            appName = response.slice(2, 2 + appNameLen).toString("ascii");
            let idx = 2 + appNameLen;
            const appVersionLen = response[idx];
            idx += 1;
            appVersion = response.slice(idx, idx + appVersionLen).toString("ascii");
            idx += appVersionLen;
            const appFlagsLen = response[idx];
            idx += 1;
            flagLen = appFlagsLen;
            flagsValue = response[idx];
        }

        return {
            return_code: returnCode,
            error_message: errorCodeToString(returnCode),
            // //
            appName,
            appVersion,
            flagLen,
            flagsValue,
            // eslint-disable-next-line no-bitwise
            flag_recovery: (flagsValue & 1) !== 0,
            // eslint-disable-next-line no-bitwise
            flag_signed_mcu_code: (flagsValue & 2) !== 0,
            // eslint-disable-next-line no-bitwise
            flag_onboarded: (flagsValue & 4) !== 0,
            // eslint-disable-next-line no-bitwise
            flag_pin_validated: (flagsValue & 128) !== 0,
        };
    }


    async getAddressAndPubKey() {
        const response = await this.getAddress( ADDRESS_INDEX );

        return {
            bech32_address: response.address,
            compressed_pk: response.pubkey,
            return_code: response.returnCode,
            error_message: response.errorMessage,
        };
    }


    async getVersion() {
        const response = await this.superGetVersion();
        const version = response.version;
        const [ major, minor, patch ] = version.split(".");

        return {
            return_code: response.returnCode,
            error_message: response.errorMessage,
            test_mode: response.testMode,
            major: major,
            minor: minor,
            patch: patch,
            device_locked: response.deviceLocked,
            // ? target_id: targetId.toString(16),
        };
    }


    async publicKey() {
        const response = await this.getAddressAndPubKey();

        delete response.bech32_address;
        response.pk = "OBSOLETE PROPERTY";

        return response;
    }


    async sign( path, message ) {
        const response = await this.superSign( ADDRESS_INDEX, message );

        return {
            return_code: response.returnCode,
            error_message: response.errorMessage,
            signature: Buffer.from(response.signature.toDer()),
        };
    }
}

export class Ledger {
    constructor({ testModeAllowed }) {
        this.testModeAllowed = testModeAllowed
    }

    // test connection and compatibility
    async testDevice() {
        // poll device with low timeout to check if the device is connected
        const secondsTimeout = 3 // a lower value always timeouts
        await this.connect(secondsTimeout)
    }
    async isSendingData() {
        // check if the device is connected or on screensaver mode
        const response = await this.cosmosApp.publicKey(HDPATH)
        this.checkLedgerErrors(response, {
            timeoutMessage: "Could not find a connected and unlocked Ledger device"
        })
    }
    async isReady() {
    // check if the version is supported
        const version = await this.getCosmosAppVersion()

        if (!semver.gte(version, REQUIRED_COSMOS_APP_VERSION)) {
            const msg = `Outdated version: Please update Ledger IOV App to the latest version.`
            throw new Error(msg)
        }

        // throws if not open
        await this.isCosmosAppOpen()
    }
    // connects to the device and checks for compatibility
    async connect(timeout = INTERACTION_TIMEOUT) {
        // assume well connection if connected once
        if (this.cosmosApp) return

        const transport = await TransportWebUSB.create(timeout)
        const cosmosLedgerApp = new CosmosApp(transport)

        this.cosmosApp = cosmosLedgerApp

        await this.isSendingData()
        await this.isReady()
    }
    async getCosmosAppVersion() {
        await this.connect()

        const response = await this.cosmosApp.getVersion()
        this.checkLedgerErrors(response)
        // eslint-disable-next-line camelcase
        const { major, minor, patch, test_mode } = response
        checkAppMode(this.testModeAllowed, test_mode)
        const version = versionString({ major, minor, patch })

        return version
    }
    async isCosmosAppOpen() {
        await this.connect()

        const response = await this.cosmosApp.appInfo()
        this.checkLedgerErrors(response)
        const { appName } = response

        if (appName.toLowerCase() !== `iov`) {
            throw new Error(`Close ${appName} and open the IOV${CHAIN_ID.toLowerCase().indexOf( "mainnet" ) != -1 ? "" : "TEST"} app`)
        }
    }
    async getPubKey() {
        await this.connect()

        const response = await this.cosmosApp.publicKey(HDPATH)
        this.checkLedgerErrors(response)
        return response.compressed_pk
    }
    async getCosmosAddress() {
        await this.connect()

        const response = await this.cosmosApp.getAddressAndPubKey(this.cosmosApp);

        return {
            pubKey: response.compressed_pk,
            address:response.bech32_address,
        };
    }
    async confirmLedgerAddress() {
        await this.connect()
        const cosmosAppVersion = await this.getCosmosAppVersion()

        if (semver.lt(cosmosAppVersion, REQUIRED_COSMOS_APP_VERSION)) {
            // we can't check the address on an old cosmos app
            return
        }

        const response = await this.cosmosApp.getAddressAndPubKey(
            HDPATH,
            BECH32PREFIX,
        )
        this.checkLedgerErrors(response, {
            rejectionMessage: "Displayed address was rejected"
        })
    }

    async sign(signMessage) {
        await this.connect()

        const response = await this.cosmosApp.sign(HDPATH, signMessage)
        this.checkLedgerErrors(response)
        // we have to parse the signature from Ledger as it's in DER format
        const parsedSignature = signatureImport(response.signature)
        return parsedSignature
    }

    /* istanbul ignore next: maps a bunch of errors */
    checkLedgerErrors(
        // eslint-disable-next-line camelcase
        { error_message, device_locked },
        {
            timeoutMessage = "Connection timed out. Please try again.",
            rejectionMessage = "User rejected the transaction"
        } = {}
    ) {
        // eslint-disable-next-line camelcase
        if (device_locked) {
            throw new Error(`Ledger's screensaver mode is on`)
        }
        // eslint-disable-next-line camelcase
        switch (error_message) {
        case `U2F: Timeout`:
            throw new Error(timeoutMessage)
        case `IOV app does not seem to be open`:
            // hack:
            // It seems that when switching app in Ledger, WebUSB will disconnect, disabling further action.
            // So we clean up here, and re-initialize this.cosmosApp next time when calling `connect`
            this.cosmosApp.transport.close()
            this.cosmosApp = undefined
            throw new Error(`IOV app is not open`)
        case `Command not allowed`:
            throw new Error(`Transaction rejected`)
        case `Transaction rejected`:
            throw new Error(rejectionMessage)
        case `Unknown error code`:
            throw new Error(`Ledger's screensaver mode is on`)
        case `Instruction not supported`:
            throw new Error(
                `Your IOV Ledger App is not up to date. ` +
                `Please update to version ${REQUIRED_COSMOS_APP_VERSION}.`
            )
        case `No errors`:
            // do nothing
            break
        default:
            throw new Error(error_message)
        }
    }

    static getBytesToSign(tx, txContext) {
        if (typeof txContext === 'undefined') {
            throw new Error('txContext is not defined');
        }
        if (typeof txContext.chainId === 'undefined') {
            throw new Error('txContext does not contain the chainId');
        }
        if (typeof txContext.accountNumber === 'undefined') {
            throw new Error('txContext does not contain the accountNumber');
        }
        if (typeof txContext.sequence === 'undefined') {
            throw new Error('txContext does not contain the sequence value');
        }

        const txFieldsToSign = {
            account_number: txContext.accountNumber.toString(),
            chain_id: txContext.chainId,
            fee: tx.value.fee,
            memo: tx.value.memo,
            msgs: tx.value.msg,
            sequence: txContext.sequence.toString(),
        };

        return JSON.stringify(canonicalizeJson(txFieldsToSign));
    }

    static applyGas(unsignedTx, gas, gasPrice=DEFAULT_GAS_PRICE, denom=DEFAULT_DENOM) {
        if (typeof unsignedTx === 'undefined') {
            throw new Error('undefined unsignedTx');
        }
        if (typeof gas === 'undefined') {
            throw new Error('undefined gas');
        }

        // eslint-disable-next-line no-param-reassign
        unsignedTx.value.fee = {
            amount: [{
                amount: Math.round(gas * gasPrice).toString(),
                denom: denom,
            }],
            gas: gas.toString(),
        };

        return unsignedTx;
    }

    static applySignature(unsignedTx, txContext, secp256k1Sig) {
        if (typeof unsignedTx === 'undefined') {
            throw new Error('undefined unsignedTx');
        }
        if (typeof txContext === 'undefined') {
            throw new Error('undefined txContext');
        }
        if (typeof txContext.pk === 'undefined') {
            throw new Error('txContext does not contain the public key (pk)');
        }
        if (typeof txContext.accountNumber === 'undefined') {
            throw new Error('txContext does not contain the accountNumber');
        }
        if (typeof txContext.sequence === 'undefined') {
            throw new Error('txContext does not contain the sequence value');
        }

        const tmpCopy = Object.assign({}, unsignedTx, {});

        tmpCopy.value.signatures = [
            {
                signature: secp256k1Sig.toString('base64'),
                account_number: txContext.accountNumber.toString(),
                sequence: txContext.sequence.toString(),
                pub_key: {
                    type: 'tendermint/PubKeySecp256k1',
                    value: txContext.pk//Buffer.from(txContext.pk, 'hex').toString('base64'),
                },
            },
        ];
        return tmpCopy;
    }

    // Creates a new tx skeleton
    static createSkeleton(txContext, msgs=[]) {
        if (typeof txContext === 'undefined') {
            throw new Error('undefined txContext');
        }
        if (typeof txContext.accountNumber === 'undefined') {
            throw new Error('txContext does not contain the accountNumber');
        }
        if (typeof txContext.sequence === 'undefined') {
            throw new Error('txContext does not contain the sequence value');
        }
        const txSkeleton = {
            type: 'auth/StdTx',
            value: {
                msg: msgs,
                fee: '',
                memo: txContext.memo || DEFAULT_MEMO,
                signatures: [{
                    signature: 'N/A',
                    account_number: txContext.accountNumber.toString(),
                    sequence: txContext.sequence.toString(),
                    pub_key: {
                        type: 'tendermint/PubKeySecp256k1',
                        value: txContext.pk || 'PK',
                    },
                }],
            },
        };
        //return Ledger.applyGas(txSkeleton, DEFAULT_GAS);
        return txSkeleton
    }

    // Creates a new delegation tx based on the input parameters
    // the function expects a complete txContext
    static createDelegate(
        txContext,
        validatorBech32,
        uatomAmount
    ) {
        const txMsg = {
            type: 'cosmos-sdk/MsgDelegate',
            value: {
                amount: {
                    amount: uatomAmount.toString(),
                    denom: txContext.denom,
                },
                delegator_address: txContext.bech32,
                validator_address: validatorBech32,
            },
        };

        return Ledger.createSkeleton(txContext, [txMsg]);
    }

    // Creates a new undelegation tx based on the input parameters
    // the function expects a complete txContext
    static createUndelegate(
        txContext,
        validatorBech32,
        uatomAmount
    ) {
        const txMsg = {
            type: 'cosmos-sdk/MsgUndelegate',
            value: {
                amount: {
                    amount: uatomAmount.toString(),
                    denom: txContext.denom,
                },
                delegator_address: txContext.bech32,
                validator_address: validatorBech32,
            },
        };

        return Ledger.createSkeleton(txContext, [txMsg]);
    }

    // Creates a new redelegation tx based on the input parameters
    // the function expects a complete txContext
    static createRedelegate(
        txContext,
        validatorSourceBech32,
        validatorDestBech32,
        uatomAmount
    ) {
        const txMsg = {
            type: 'cosmos-sdk/MsgBeginRedelegate',
            value: {
                amount: {
                    amount: uatomAmount.toString(),
                    denom: txContext.denom,
                },
                delegator_address: txContext.bech32,
                validator_dst_address: validatorDestBech32,
                validator_src_address: validatorSourceBech32,
            },
        };

        return Ledger.createSkeleton(txContext, [txMsg]);
    }

    // Creates a new transfer tx based on the input parameters
    // the function expects a complete txContext
    static createTransfer(
        txContext,
        toAddress,
        amount
    ) {
        const txMsg = {
            type: 'cosmos-sdk/MsgSend',
            value: {
                amount: [{
                    amount: amount.toString(),
                    denom: txContext.denom
                }],
                from_address: txContext.bech32,
                to_address: toAddress
            }
        };

        return Ledger.createSkeleton(txContext, [txMsg]);
    }

    static createSubmitProposal(
        txContext,
        title,
        description,
        deposit
    ) {
        const txMsg = {
            type: 'cosmos-sdk/MsgSubmitProposal',
            value: {
                content: {
                    type: "cosmos-sdk/TextProposal",
                    value: {
                        description: description,
                        title: title
                    }
                },
                initial_deposit: [{
                    amount: deposit.toString(),
                    denom: txContext.denom
                }],
                proposer: txContext.bech32
            }
        };

        return Ledger.createSkeleton(txContext, [txMsg]);
    }

    static createVote(
        txContext,
        proposalId,
        option,
    ) {
        const txMsg = {
            type: 'cosmos-sdk/MsgVote',
            value: {
                option,
                proposal_id: proposalId.toString(),
                voter: txContext.bech32
            }
        };

        return Ledger.createSkeleton(txContext, [txMsg]);
    }

    static createDeposit(
        txContext,
        proposalId,
        amount,
    ) {
        const txMsg = {
            type: 'cosmos-sdk/MsgDeposit',
            value: {
                amount: [{
                    amount: amount.toString(),
                    denom: txContext.denom
                }],
                depositor: txContext.bech32,
                proposal_id: proposalId.toString()
            }
        };

        return Ledger.createSkeleton(txContext, [txMsg]);
    }

}

function versionString({ major, minor, patch }) {
    return `${major}.${minor}.${patch}`
}

export const checkAppMode = (testModeAllowed, testMode) => {
    if (testMode && !testModeAllowed) {
        throw new Error(
            `DANGER: The IOV Ledger app is in test mode and shouldn't be used on mainnet!`
        )
    }
}

function canonicalizeJson(jsonTx) {
    if (Array.isArray(jsonTx)) {
        return jsonTx.map(canonicalizeJson);
    }
    if (typeof jsonTx !== 'object') {
        return jsonTx;
    }
    const tmp = {};
    Object.keys(jsonTx).sort().forEach((key) => {
        // eslint-disable-next-line no-unused-expressions
        jsonTx[key] != null && (tmp[key] = jsonTx[key]);
    });

    return tmp;
}
