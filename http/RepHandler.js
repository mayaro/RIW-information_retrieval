/**
 * Library 'robots' is used for easy parsing and checking of robots.txt file.
 */
const Robots = require('robots-parser');
const HttpClient = require('./Client');

let instance = null;

module.exports = exports = class RepHandler {
  /**
   * Singleton class used for checking whether crawling a endpoint is allowed for the given UserAgent.
   * Only keeps records for the current User Agent.
   * @argument {string} userAgent
   */
  constructor(userAgent) {
    if (instance !== null) {
      return instance;
    }

    instance = this;

    this.userAgent = userAgent;
    this.domains = { };
  }

  /**
   * Checks whether crawling a given endpoint of the host is allowed.
   * @param {string} host
   * @param {string} route
   * @returns {boolean}
   */
  async isEndpointAllowed(host, route) {
    /**
     * If robots.txt file has already been retrieved for this domain
     * only check if the given route is allowed.
     */
    if (this.domains[host]) {
      // console.log('Using cached REP rules');

      if (typeof this.domains[host] === 'boolean') {
        return this.domains[host];
      }

      return Boolean(
        this.domains[host].isAllowed(`http://${host}${route}`, this.userAgent)
      );
    }

    let response = null;

    /**
     * Otherwise, create a httpclient for getting the file,
     * and only after that fetch it and check if route is allowed.
     */
    try {
      response = await new HttpClient(host, '/robots.txt').get();

      if (response.header && parseInt(response.header.statusCode, 10) === 200 && response.body) {
        this.domains[host] = Robots(`http://${host}/robots.txt`, response.body);
        console.log('Using requested REP rules');

        return this.domains[host].isAllowed(`http://${host}${route}`, this.userAgent);
      }
    } catch (e) {
      console.error(e);
      this.domains[host] = true;

      return true;
    }

    return true;
  }
};
