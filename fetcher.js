const HttpClient = require('./http/Client');
const RepHandler = require('./http/RepHandler');
const { splitUrl } = require('./http/Parser');
const { extract } = require('./http/Parser');
const shell = require('shelljs');
const fs = require('fs');

const UserAgent = 'RIWEB_CRAWLER';
const savePath = 'X:\\Facultate\\RIW-Crawl';

process.on('message', async(message) => {
  let start = Date.now();
  let afterRequest = null;

  try {
    let { header, body, redirect } = await tryRequest(message.host, message.route);
    afterRequest = Date.now();

    // console.log(process.pid, message.host, message.route, header.statusCode);

    if (!header.statusCode.startsWith('2')) {
      throw new Error(`Not successful status code ${header.statusCode}`);
    }

    let host = message.host;
    if (redirect) {
      host = redirect.host;
    }

    const { text, links } = await extract(body, `http://${host}`);

    const now = Date.now();
    // console.log(message.host, message.route, now - start, afterRequest - start, now - afterRequest);

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
    const isRepAllowed = await (new RepHandler(UserAgent)
      .isEndpointAllowed(host, route));

    if (!isRepAllowed) {
      console.warn(`${host}${route} does not allow access for given user agent`);
      return process.send({ host: host, route: route, success: false });
    }

    const { header, body } = await (new HttpClient(host, route)
      .get());

    let redirect = undefined;

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

    return { header, body, redirect };
  } catch (e) {
    throw e;
  }
}

/**
 *
 * @param {string} receivedLocation
 * @param {string} host
 * @param {string} route
 * @returns {{host: string, route, string}}
 */
function createRedirectUrl(receivedLocation, host, route) {
  let newLocation = '';

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
 * Save a file to the disk
 * @param {string} url
 * @param {string} contents
 */
function saveFile(url, contents) {
  if (contents === null) {
    return;
  }

  let filePath = url;
  let containsHttpPrefix = filePath.indexOf('http://');

  if (containsHttpPrefix === 0) {
    filePath = filePath.slice(7);
  }

  const split = filePath.split('/');
  if (split[split.length - 1] === '') {
    filePath = `${filePath }index.html`;
  }

  filePath = `${savePath}/${filePath}`;

  try {
    shell.mkdir('-p',
      filePath.split('/').slice(0, -1).join('/'));

    fs.writeFile(filePath, contents, () => {});
  } catch (ex) {
    console.error(ex.message);
  }
}
