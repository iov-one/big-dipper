import { Meteor } from 'meteor/meteor';
import { withTracker } from 'meteor/react-meteor-data';
import { Blockscon } from '/imports/api/blocks/blocks.js';
import { Transactions } from '/imports/api/transactions/transactions.js';
import Block from './Block.jsx';

export default BlockContainer = withTracker((props) => {
    let blockHandle, transactionHandle;
    let loading = true;

    if (Meteor.isClient){
        blockHandle = Meteor.subscribe('blocks.findOne', parseInt(props.match.params.blockId));
        transactionHandle = Meteor.subscribe('transactions.height', parseInt(props.match.params.blockId));
        loading = !blockHandle.ready() && !transactionHandle.ready();
    }

    let block, txs, transactionsExist, blockExist;

    if (Meteor.isServer || !loading){
        block = Blockscon.findOne({height: parseInt(props.match.params.blockId)});
        txs = Transactions.find({height:parseInt(props.match.params.blockId)});

        if (Meteor.isServer){
            loading = false;
            transactionsExist = !!txs;
            blockExist = !!block;
        }
        else{
            transactionsExist = !loading && !!txs;
            blockExist = !loading && !!block;
        }
    }

    return {
        loading,
        blockExist,
        transactionsExist,
        block: blockExist ? block : {},
        transferTxs: transactionsExist ? Transactions.find({
            $or: [
                {"tx.value.msg.type":"cosmos-sdk/MsgSend"},
                {"tx.value.msg.type":"cosmos-sdk/MsgMultiSend"}
            ]
        }).fetch() : {},
        stakingTxs: transactionsExist ? Transactions.find({
            $or: [
                {"tx.value.msg.type":"cosmos-sdk/MsgCreateValidator"},
                {"tx.value.msg.type":"cosmos-sdk/MsgEditValidator"},
                {"tx.value.msg.type":"cosmos-sdk/MsgDelegate"},
                {"tx.value.msg.type":"cosmos-sdk/MsgUndelegate"},
                {"tx.value.msg.type":"cosmos-sdk/MsgBeginRedelegate"}
            ]
        }).fetch() : {},
        distributionTxs: transactionsExist ? Transactions.find({
            $or: [
                {"tx.value.msg.type":"cosmos-sdk/MsgWithdrawValidatorCommission"},
                {"tx.value.msg.type":"cosmos-sdk/MsgWithdrawDelegationReward"},
                {"tx.value.msg.type":"cosmos-sdk/MsgModifyWithdrawAddress"}
            ]
        }).fetch() : {},
        governanceTxs: transactionsExist ? Transactions.find({
            $or: [
                {"tx.value.msg.type":"cosmos-sdk/MsgSubmitProposal"},
                {"tx.value.msg.type":"cosmos-sdk/MsgDeposit"},
                {"tx.value.msg.type":"cosmos-sdk/MsgVote"}
            ]
        }).fetch() : {},
        slashingTxs: transactionsExist ? Transactions.find({
            $or: [
                {"tx.value.msg.type":"cosmos-sdk/MsgUnjail"}
            ]
        }).fetch() : {},
        IBCTxs: transactionsExist ? Transactions.find({
            $or: [
                {"tx.value.msg.type":"cosmos-sdk/IBCTransferMsg"},
                {"tx.value.msg.type":"cosmos-sdk/IBCReceiveMsg"}
            ]
        }).fetch() : {},
        starnameTxs: transactionsExist ? Transactions.find({
            $or: [
                {"tx.value.msg.type":"starname/AddAccountCertificates"},
                {"tx.value.msg.type":"starname/DeleteAccount"},
                {"tx.value.msg.type":"starname/DeleteAccountCertificates"},
                {"tx.value.msg.type":"starname/DeleteDomain"},
                {"tx.value.msg.type":"starname/RegisterAccount"},
                {"tx.value.msg.type":"starname/RegisterDomain"},
                {"tx.value.msg.type":"starname/RenewAccount"},
                {"tx.value.msg.type":"starname/RenewDomain"},
                {"tx.value.msg.type":"starname/ReplaceAccountResources"},
                {"tx.value.msg.type":"starname/SetAccountMetadata"},
                {"tx.value.msg.type":"starname/TransferAccount"},
                {"tx.value.msg.type":"starname/TransferDomainAll"},
            ]
        }).fetch() : {}
    };
})(Block);
