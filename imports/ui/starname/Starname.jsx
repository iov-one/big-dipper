import React, { Component, Fragment } from 'react';
import { Container, Spinner, Row, Col, Card, CardBody } from 'reactstrap';
import { Helmet } from 'react-helmet';
import i18n from 'meteor/universe:i18n';
import Account from '../components/Account.jsx';


const T = i18n.createComponent();


export default class Starname extends Component {
    constructor(props){
        super(props);
        this.state = {
            infoed: null, // domainInfo object
            loading: props.loading,
            resolved: null, // resolved starname object
            starname: props.starname,
        }
    }


    async fetchDetails(){
        const domain = this.state.starname.split( "*" );
        const rpc = Meteor.settings.public.urlRest;
        const responses = await Promise.all( [
            fetch( `${rpc}/starname/query/resolve`, { method: "POST", body: JSON.stringify( { starname: this.state.starname } ) } ).catch( e => { throw e } ),
            fetch( `${rpc}/starname/query/domainInfo`, { method: "POST", body: JSON.stringify( { name: domain.length == 1 ? domain[0] : domain[1] } ) } ).catch( e => { throw e } ),
        ] );
        const resolved = await responses[0].json();
        const infoed = await responses[1].json();

        this.setState({
            infoed: infoed.result || infoed.error,
            loading: false,
            resolved: resolved.result || resolved.error,
        });
    }


    componentDidMount(){
        this.fetchDetails();
    }


    componentDidUpdate(prevProps){
        if (this.props.match.params.starname !== prevProps.match.params.starname){
            this.setState({
                infoed: null,
                loading: true,
                resolved: null,
                starname: this.props.match.params.starname,
            }, () => {
                this.fetchDetails();
            })
        }
    }


    renderShareLink() { // dmjp
        let primaryLink = `/account/${this.state.starname}`
        let otherLinks = [
            {label: 'Transfer', url: `${primaryLink}/send`}
        ]
        return <LinkIcon link={primaryLink} otherLinks={otherLinks} />
    }


    render(){
        if (this.state.loading) {
            return <Container id="starname">
                <Spinner type="grow" color="primary" />
            </Container>
        } else {
            const resolved = this.state.resolved;
            const infoed = this.state.infoed;

            if ( resolved && resolved.account ) {
                const data = resolved.account;
                const info = infoed.domain;

                return <Container id="starname">
                    <Helmet>
                        <title>Starname {this.props.starname} On The IOV Name Service</title>
                        <meta name="description" content={"Details of starname " + this.props.starname} />
                    </Helmet>
                    <h4><T>starname.starname</T></h4>
                    <Card>
                        <div className="card-header"><T>starname.starname</T></div>
                        <CardBody>
                            <Row>
                                <Col md={4} className="label"><T>starname.starname</T></Col>
                                <Col md={8} className="value text-nowrap overflow-auto">{this.props.starname}</Col>
                                <Col md={4} className="label"><T>starname.owner</T></Col>
                                <Col md={8} className="value text-nowrap overflow-auto address"><Account address={data.owner} /></Col>
                                <Col md={4} className="label"><T>starname.broker</T></Col>
                                <Col md={8} className="value text-nowrap overflow-auto address">{info.broker.length > 0 ? <Account address={info.broker} /> : ""}</Col>
                                <Col md={4} className="label"><T>starname.validUntil</T></Col>
                                <Col md={8} className="value text-nowrap overflow-auto">{new Date(1000 * data.valid_until).toLocaleString()}</Col>
                                <Col md={4} className="label"><T>starname.certificates</T></Col>
                                <Col md={8} className="value text-nowrap overflow-auto">{data.certificates ? data.certificates.length : 0}</Col>
                                <Col md={4} className="label"><T>starname.metadata</T></Col>
                                <Col md={8} className="value text-nowrap overflow-auto">{data.metadata_uri}</Col>
                                <Col md={12} className="label"><T>starname.resources</T></Col>
                                {data.resources && data.resources.sort((a,b) => a.uri < b.uri).map((resource, i) => {
                                    return <Fragment key={i}><Col md={4} className="label">{resource.uri}</Col><Col md={8} className="value text-nowrap overflow-auto">{resource.resource}</Col></Fragment>
                                })}
                            </Row>
                        </CardBody>
                    </Card>
                    {info &&
                    <Card>
                        <div className="card-header"><T>starname.domain</T></div>
                        <CardBody>
                            <Row>
                                <Col md={4} className="label"><T>starname.domain</T></Col>
                                <Col md={8} className="value text-nowrap overflow-auto">{info.name}</Col>
                                <Col md={4} className="label"><T>starname.type</T></Col>
                                <Col md={8} className="value text-nowrap overflow-auto">{info.type}</Col>
                                <Col md={4} className="label"><T>starname.admin</T></Col>
                                <Col md={8} className="value text-nowrap overflow-auto address"><Account address={info.admin} /></Col>
                                <Col md={4} className="label"><T>starname.broker</T></Col>
                                <Col md={8} className="value text-nowrap overflow-auto address">{info.broker.length > 0 ? <Account address={info.broker} /> : ""}</Col>
                                <Col md={4} className="label"><T>starname.validUntil</T></Col>
                                <Col md={8} className="value text-nowrap overflow-auto">{new Date(1000 * info.valid_until).toLocaleString()}</Col>
                            </Row>
                        </CardBody>
                    </Card>
            }
                    {/* dmjp(tx.tx.value.msg && tx.tx.value.msg.length >0)?tx.tx.value.msg.map((msg,i) => {
                        return <Card body key={i}><Activities msg={msg} invalid={(!!tx.code)} events={(tx.logs&&tx.logs[i])?tx.logs[i].events:null} denom={this.denom}/></Card>
                    }):''*/}
                </Container>
            } else {
                return <Container id="starname"><div><T>transactions.noTxFound</T></div></Container>
            }
        }
    }
}
