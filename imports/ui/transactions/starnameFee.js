export default starnameFee = tx => {
   return tx.logs && tx.logs.length ? tx.logs.reduce( ( fee, msg ) => {
      const events = msg.events;
      if ( events[0].type == "message" && events[0].attributes.find( attribute => attribute.key == "module" && attribute.value == "starname" ) ) {
         if ( events[1].type == "transfer" ) {
            const amount = events[1].attributes.find( attribute => attribute.key == "amount" );
            fee += parseInt( amount.value );
         }
      }
      return fee;
   }, 0 ) : 0;
}
