import { withTracker } from 'meteor/react-meteor-data';
import Starname from './Starname.jsx';

export default StarnameContainer = withTracker(props => {
    console.log("container", props); // dmjp
    let starname = props.match.params.starname;

    return {
        starname,
    };
})(Starname);
