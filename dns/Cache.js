const fs = require('fs');

let DnsCache = null;
try {
  DnsCache = require('../cache.json');
}
catch (e) {
  DnsCache = {};
}

module.exports = exports = {
  /**
   * Get a dns record from cache if it exists and has not expired.
   * @argument {string} hostname
   * @returns {string}
   */
  get: function get(hostname) {
    const entry = DnsCache[hostname.toLowerCase()];

    if (!entry) {
      return null;
    }

    if (entry.timestamp + entry.ttl < Date.now()) {
      console.error('DNS time expired for name ', hostname);

      delete DnsCache[hostname.toLowerCase()];
      return null;
    }

    return entry.address;
  },

  /**
   * Insert a new entry into the DNS cache.
   * @argument {string} hostname
   * @argument {string} address
   * @argument {number} timestamp
   * @argument {number} ttl
   */
  put: function put(hostname, address, timestamp, ttl) {
    DnsCache[hostname.toLowerCase()] = {
      address: address,
      timestamp: timestamp,
      ttl: ttl,
    };

    fs.writeFile('./cache.json', JSON.stringify(DnsCache, null, 4), () => {});
  },
};
