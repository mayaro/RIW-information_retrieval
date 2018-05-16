const net = require('net');

const UserAgent = 'RIWEB_CRAWLER';

module.exports = exports = class HttpClient {
  /**
   *
   * @param {string} address
   * @param {string} host
   * @param {string} route
   */
  constructor(address, host, route) {
    this.address = address;
    this.host = host;
    this.route = route;

    // Comunication related variables
    this.socket = new net.Socket();
  }

  /**
   * @returns {Promise}
   */
  get() {
    return new Promise((resolve, reject) => {
      let data = '';

      this.socket.once('connect', () => {
        this.socket.write(this.createRequest());
      });

      this.socket.once('error', (err) => {
        console.error(err);

        return reject(err.message);
      });

      this.socket.on('data', (message, info) => {
        data = data + message;
      });

      this.socket.once('end', () => {
        this.socket.destroy();

        return resolve(parseResponse(data));
      });

      this.socket.connect(80, `${this.address}`);
    });
  }

  /**
   * @private
   * @returns {string}
   */
  createRequest() {
    const request =
      `GET ${this.route} HTTP/1.1\r\n` +
      `Host: ${this.host}\r\n` +
      'Connection: close\r\n' +
      `User-Agent: ${UserAgent}\r\n` +
      '\r\n';

    return request;
  }
};

/**
 * Split the response in header and body.
 * @argument {string} response
 * @returns {{header: string, body: string}}
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
 * @returns {{header: {statusCode: string}, body: string}}
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
