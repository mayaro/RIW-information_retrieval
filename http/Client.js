const net = require('net');
const DnsClient = require('../dns/Client');
const DnsCache = require('../dns/Cache');

module.exports = exports = class HttpClient {
  /**
   * @param {string} host
   * @param {string} route
   * @param {string} userAgent
   */
  constructor(host, route, userAgent) {
    this.address = '';
    this.host = host;
    this.route = route;
    this.userAgent = userAgent;
    this.port = 80;

    /**
     * Create the TCP socket used for communications
     */
    this.socket = new net.Socket();
  }

  /**
   * @returns {Promise}
   */
  get() {
    return new Promise(async(resolve, reject) => {
      let address = null;

      try {
        /**
         * Create the timeout callback.
         * If 5000ms are passed, destroy the socket and reject the request.
         */
        setTimeout(() => {
          this.socket.destroy();
          return reject('Timeout');
        }, 5000);

        /**
         * Try to retrieve the DNS record from cache.
         * If it has not been explored yet, create a DNS client and retrieve the address (also add it to the cache).
         */
        const cachedAddress = DnsCache.get(this.host);
        if (cachedAddress !== null) {
          address = cachedAddress;
        }
        else {
          const dnsResponse = await (new DnsClient(this.host, true)
            .getAddresses());

          if (!dnsResponse[0]) {
            return reject(`No IP addresses have been found for name ${this.host}`);
          }

          DnsCache.put(this.host, dnsResponse[0].value, dnsResponse[0].timestamp, dnsResponse[0].ttl);
          address = dnsResponse[0].value;
        }

        let data = '';

        /**
         * Bind the TCP's socket 'connect', 'error', 'data' and 'end' events.
         */
        this.socket.once('connect', () => {
          this.socket.write(this.createRequest());
        });

        this.socket.once('error', (err) => {
          this.socket.destroy();

          return reject(err.message);
        });

        this.socket.on('data', (message, info) => {
          data = data + message;
        });

        this.socket.once('end', () => {
          this.socket.destroy();

          return resolve(parseResponse(data));
        });

        /**
         * Try to connect to the server. Once a connection is established the request will be sent
         * from the handled event.
         */
        this.socket.connect(this.port, `${address}`);
      } catch (e) {
        return reject(e);
      }
    });
  }

  /**
   * Create the HTTP request body
   * @private
   * @returns {string}
   */
  createRequest() {
    const request =
      `GET ${this.route} HTTP/1.1\r\n` +
      `Host: ${this.host}\r\n` +
      'Connection: close\r\n' +
      `User-Agent: ${this.userAgent}\r\n` +
      '\r\n';

    return request;
  }
};

/**
 * Split the response in header and body.
 * Also parse the header and create a dictionary with it's entries.
 * @argument {string} response
 * @returns {{header: {statusCode: string}, body: string}}
 */
function parseResponse(response) {
  const firstNewlineIndex = response.indexOf('\r\n\r\n') + 4;

  const rawHeader = response.slice(0, firstNewlineIndex);
  const body = response.slice(firstNewlineIndex);

  let header = null;

  if (rawHeader && rawHeader.length) {
    header = parseHeader(rawHeader);
  }

  return {
    header: header || rawHeader,
    body: body,
  };
}

/**
 * Parse the header of a response.
 * The header property of the returned object will contain all the fields
 * that were present in the response and, at all times, the status code of
 * the request (statusCode).
 * @param {string} header
 * @returns {{header: {statusCode: string}}}
 */
function parseHeader(header) {
  const headerObject = {};

  let headerParams = header.split('\r\n');
  headerObject.statusCode = headerParams[0]
    .split(' ')[1];

  headerParams = headerParams.slice(1).map((param) => {
    const [ name, value ] = param.split(/:\s*/);

    if (!name || !name.length || !value) {
      return;
    }

    headerObject[name.toLowerCase()] = value;
  });

  return headerObject;
}
