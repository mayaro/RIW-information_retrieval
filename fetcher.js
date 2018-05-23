const HttpClient = require('./http/Client');
const RepHandler = require('./http/RepHandler');
const { splitUrl } = require('./http/Parser');
const { extract } = require('./http/Parser');

const shell = require('shelljs');
const fs = require('fs');

const UserAgent = 'RIWEB_CRAWLER';
const savePath = 'X:\\Facultate\\RIW-Crawl';

/**
 * Event handle for receiving a message from the master.
 */
process.on('message', async(message) => {
  try {
    /**
     * Request the url that was just received.
     */
    let { header, body, redirect } = await tryRequest(message.host, message.route);

    console.log(process.pid, message.host, message.route, header.statusCode);

    /**
     * If final response status code is not 2xx, reject the response as it means that
     * either it is a redirect that was not fulfilled trough 5 requests or it is 4xx or 5xx.
     */
    if (!header.statusCode.startsWith('2')) {
      throw new Error(`Not successful status code ${header.statusCode}`);
    }

    /**
     * Change the host with the one that was redirected to.
     */
    let host = message.host;
    if (redirect) {
      host = redirect.host;
    }

    const { text, links } = await extract(body, `http://${host}`);

    const now = Date.now();

    /**
     * Save the extracted text on the disk if available (fire and forget)
     * and return a response to the master.
     */
    saveFile(`${host}${message.route}`, text);
    process.send({ host, route: message.route, success: true, links: links, redirect: redirect ? redirect.host : undefined });
  } catch (e) {
    console.log(e.message);
    process.send({ host: message.host, route: message.route, success: false });
  }
});

/**
 * @argument {string} host
 * @argument {string} route
 * @argument {number} [currentDepth=1]
 * @returns {{header: object, body: string}}
 * @async
 */
async function tryRequest(host, route, currentDepth = 1) {
  try {
    if (currentDepth > 1) {
      console.log('redirect ', currentDepth);
    }

    /**
     * Enforce REP rules
     */
    const isRepAllowed = await (new RepHandler(UserAgent)
      .isEndpointAllowed(host, route));

    if (!isRepAllowed) {
      console.warn(`${host}${route} does not allow access for given user agent`);
      return process.send({ host: host, route: route, success: false });
    }

    const { header, body } = await (new HttpClient(host, route)
      .get());

    let redirect = undefined;

    /**
     * If received status code is 301 || 302 and the depth of redirects is less than 5 follow the redirect.
     */
    if (header.statusCode === '301' || header.statusCode === '302') {
      if (currentDepth === 5) {
        throw new Error('Max redirect depth reached', header.location);
      }

      if (header.location.startsWith('https')) {
        throw new Error('Protocol https not supported');
      }

      // Manual redirects
      if (header.location === 'http') {
        throw new Error('Manual redirects not supported');
      }

      const { host: redirectHost, route: redirectRoute } = createRedirectUrl(header.location, host, route);

      const { header: redirectHeader, body: redirectBody } = await tryRequest(redirectHost, redirectRoute, currentDepth + 1);

      redirect = {};
      redirect.header = redirectHeader;
      redirect.body = redirectBody;
    }

    /**
     * If the returned status code was 301 mark the domain as redirected by adding the new domain in the return object
     */
    if (currentDepth === 1 && header.statusCode === '301') {
      return { header, body, redirect };
    }

    return { header, body };
  } catch (e) {
    throw e;
  }
}

/**
 * Parse the location header on the 3xx response to get the header and route for the new endpoint
 * @param {string} receivedLocation
 * @param {string} host
 * @param {string} route
 * @returns {{host: string, route: string}}
 */
function createRedirectUrl(receivedLocation, host, route) {
  if (receivedLocation === 'http') {
    return {
      host: host,
      route: `${route}/`,
    };
  }

  if (receivedLocation.startsWith('http')) {
    return splitUrl(receivedLocation);
  }

  return {
    host: host,
    route: receivedLocation,
  };
}

/**
 * Save a file to the disk. Does not wait for the file to be written to the disk.
 * @param {string} url
 * @param {string} contents
 */
function saveFile(url, contents) {
  // Contents were removed due to REP policy.
  if (contents === null) {
    return;
  }

  let filePath = url;
  let containsHttpPrefix = filePath.indexOf('http://');

  // Remove http prefix from the url
  if (containsHttpPrefix === 0) {
    filePath = filePath.slice(7);
  }

  /**
   * If the path does not end in .html it means that either the endpoint finished in a slash
   * or it is the direct response from the host on /.
   * Either way, save it as index.html for the given path
   */
  const split = filePath.split('/');
  if (split[split.length - 1] === '') {
    filePath = `${filePath }index.html`;
  }

  filePath = `${savePath}/${filePath}`;

  /**
   * Ensure the directory to the file is created and
   * actually save the file.
   */
  try {
    shell.mkdir('-p',
      filePath.split('/').slice(0, -1).join('/'));

    fs.writeFile(filePath, contents, () => {});
  } catch (ex) {
    console.error(ex.message);
  }
}
