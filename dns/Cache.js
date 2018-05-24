const fs = require('fs');

let DnsCache = null;
/**
 * On module load try to load the cache from file if it odes exist.
 * Otherwise initialize the cache as an empty object.
 */
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
    /**
     * Each entry in the DNS cache will be as key-value pair where
     * the key is the hostname, lowercased, and the value is an object containing
     * the address that was found, it's ttl and the timestamp
     * when the DNS request was sent.
     */
    DnsCache[hostname.toLowerCase()] = {
      address: address,
      timestamp: timestamp,
      ttl: ttl,
    };

    /**
     * Write he DNS cache object as a file to the disk.
     */
    fs.writeFile(
      './cache.json',
      JSON.stringify(DnsCache, null, 4), () => {}
    );
  },
};
