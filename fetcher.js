const HttpClient = require('./http/Client');
const RepHandler = require('./http/RepHandler');
const { splitUrl } = require('./http/Parser');
const cheerio = require('cheerio');

const UserAgent = 'RIWEB_CRAWLER';

process.on('message', async(message) => {
  let start = Date.now();
  let afterRequest = null;

  try {
    let { header, body } = await tryRequest(message.host, message.route);
    afterRequest = Date.now();

    console.log(process.pid, message.host, message.route, header.statusCode);

    let permanentRedirect = undefined;
    if (header.statusCode === '301' || header.statusCode === '302') {
      if (header.location.startsWith('https')) {
        throw new Error('Protocol https not supported');
      }

      const { host: redirect_host, route: redirect_route } = createRedirectUrl(header.location, message.host, message.route);

      const { header: redirect_header, body: redirect_body } = await tryRequest(redirect_host, redirect_route);

      if (!redirect_header.statusCode.startsWith('2')) {
        throw new Error('Redirect was not successfull');
      }

      if (header.statusCode === '301') {
        permanentRedirect = {
          host: redirect_host,
          route: redirect_route,
        };
      }

      header = redirect_header;
      body = redirect_body;
    }

    if (!header.statusCode.startsWith('2') && !header.statusCode.startsWith('3')) {
      throw new Error(`Not successful status code ${header.statusCode}`);
    }

    const { textContent, links } = extract(body, `http://${message.host}`);

    const now = Date.now();
    console.log(message.host, message.route, now - start, afterRequest - start, now - afterRequest);

    process.send({ host: message.host, route: message.route, success: true, links: links, redirect: permanentRedirect });
  } catch (e) {
    console.error(e.message);
    process.send({ host: message.host, route: message.route, success: false });
  }
});

/**
 * @argument {string} host
 * @argument {string} route
 * @returns {{header: object, body: string}}
 * @async
 */
async function tryRequest(host, route) {
  try {
    const isRepAllowed = await (new RepHandler(UserAgent)
      .isEndpointAllowed(host, route));

    if (!isRepAllowed) {
      console.warn(`${host}${route} does not allow access for given user agent`);
      return process.send({ host: host, route: route, success: false });
    }

    const { header, body } = await (new HttpClient(host, route)
      .get());

    return { header: header, body: body };
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

  if (receivedLocation.startsWith('http')) {
    return splitUrl(receivedLocation);
  }

  return {
    host: host,
    route: receivedLocation,
  };
}

/**
 * Parse the body of a received document.
 * @param {string} content
 * @param {string} baseUrl
 * @returns {{textContent: string, links: string[]}}
 */
function extract(content, baseUrl) {
  const $ = cheerio.load(content);

  $('script, noscript, style').remove();
  let anchorElements = $('a');

  anchorElements = anchorElements
    .filter((idx, el) => {
      return $(el).prop('href') && $(el).prop('href')[0] !== '#';
    });

  const links = [].slice.call(anchorElements.map((acc, anchorElement) => {
    const link = $(anchorElement).prop('href');
    const foundUrl = new URL(link, baseUrl);
    foundUrl.hash = '';

    return foundUrl.toString();
  }));

  let textElements = $('body, body *');

  const textContent = [].slice.call(
    textElements
      .filter((idx, el) => {
        return $(el).text();
      }))
    .reduce((accum, el) => {
      return `${accum + $(el)
        .text()
        .trim()
        .replace(/\r?\n/g, ' ')
        .replace(/\s+/g, ' ') } `;
    }, '');

  return {
    textContent: textContent,
    links: links,
  };
}
