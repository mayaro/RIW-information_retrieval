const HttpClient = require('./http/Client');
const RepHandler = require('./http/RepHandler');
const cheerio = require('cheerio');

const UserAgent = 'RIWEB_CRAWLER';

process.on('message', async(message) => {
  let start = Date.now();
  let afterRequest = null;

  try {
    const isRepAllowed = await (new RepHandler(UserAgent)
      .isEndpointAllowed(message.host, message.route));

    if (!isRepAllowed) {
      console.warn(`${message.host}${message.route} does not allow access for given user agent`);
      return process.send({ host: message.host, route: message.route, success: false });
    }

    const { header, body } = await (new HttpClient(message.host, message.route)
      .get());

    afterRequest = Date.now();

    console.log(process.pid, message.host, message.route, header.statusCode);

    if (!header.statusCode.startsWith('2')) {
      throw new Error(`Not successful status code ${header.statusCode}`);
    }

    const { textContent, links } = extract(body, `http://${message.host}`);

    const now = Date.now();
    console.log(message.host, message.route, now - start, afterRequest - start, now - afterRequest);

    process.send({ host: message.host, route: message.route, success: true, links: links });
  } catch (e) {
    console.error(e.message);
    process.send({ host: message.host, route: message.route, success: false });
  }
});

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
