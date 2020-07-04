import React, { Component } from 'react';
import { Container, Spinner, UncontrolledTooltip, Row, Col, Card, CardHeader, CardBody, Progress, UncontrolledDropdown, DropdownMenu, DropdownToggle, DropdownItem } from 'reactstrap';
import LinkIcon from '../components/LinkIcon.jsx';
import { Helmet } from 'react-helmet';
import i18n from 'meteor/universe:i18n';


const T = i18n.createComponent();


export default class Starname extends Component {
    constructor(props){
        super(props);
        this.state = {
            loading: true,
            response: null,
            starname: props.starname,
        }
        console.log("starname", this.state); // dmjp
    }


    async fetchDetails(){
        console.error( "use config for rpc url root" ); // TODO: dmjp
        const fetched = await fetch( `https://iovnscli-rest-api.cluster-galaxynet.iov.one/starname/query/resolve`, { method: "POST", body: JSON.stringify( { starname: this.state.starname } ) } ).catch( e => { throw e } );
        const o = await fetched.json();

        this.setState({
            loading: false,
            response: o.result || o.error,
        });
    }


    componentDidMount(){
        this.fetchDetails();
    }


    componentDidUpdate(prevProps){
        if (this.props.match.params.starname !== prevProps.match.params.starname){
            this.setState({
                loading: true,
                response: null,
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
            const response = this.state.response;

            if ( response && response.account ) {
                const data = response.account;

                return <Container id="starname">
                    <Helmet>
                        <title>Starname {this.props.starname} On The IOV Name Service</title>
                        <meta name="description" content={"Details of starname " + this.props.starname} />
                    </Helmet>
                    <h4><T>transactions.transaction</T></h4>
                    <Card>
                        <div className="card-header"><T>common.information</T></div>
                        <CardBody>
                            <Row>
                                <Col md={4} className="label"><T>common.hash</T></Col>
                                <Col md={8} className="value text-nowrap overflow-auto">{this.props.starname}</Col>
                                <Col md={4} className="label"><T>common.height</T></Col>
                                <Col md={8} className="value text-nowrap overflow-auto address">{data.owner}</Col>
                                <Col md={4} className="label"><T>transactions.fee</T></Col>
                                <Col md={8} className="value text-nowrap overflow-auto">{new Date(1000 * data.valid_until).toLocaleString()}</Col>
                                <Col md={4} className="label"><T>transactions.gasUsedWanted</T></Col>
                                <Col md={4} className="label"><T>transactions.memo</T></Col>
                            </Row>
                        </CardBody>
                    </Card>
                    <Card>
                        <div className="card-header"><T>transactions.activities</T></div>
                    </Card>
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
