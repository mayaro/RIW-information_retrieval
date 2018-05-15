const Client = require('./dns/Client.js');

const dnsClient = new Client('dc.ac.tuiasi.ro', true);
dnsClient.getAddresses()
  .then((addresses) => {
    return console.log(addresses);
  });
