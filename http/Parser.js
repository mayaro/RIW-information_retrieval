const htmlparser = require('htmlparser2');

module.exports = exports = {
  /**
  * Get the hostand the route from a URL.
  * @param {string} url
  * @returns {{linkHost: string, route: string}}
  */
  splitUrl: function splitUrl(url) {
    const splitted = url.split('/');

    return {
      linkHost: splitted.slice(2, 3)[0],
      route: `/${splitted.slice(3).join('/')}`,
    };
  },

  /**
   * Extract the links and and parse the text from the raw response body,
   *
   * @argument {string} content
   * @argument {string} base
   * @returns {Promise<{links: string[], text: string}>}
   */
  extract: function extract(content, base) {
    const links = [];
    let text = '';

    let noindex = false,
      nofollow = false;

    return new Promise((resolve, reject) => {
      const parser = new htmlparser.Parser({

        onopentag: (tagName, attributes) => {
          /**
           * On <a> tag, if not page anchor and is html file create a new URL
           * that will be passed to the master process.
           */
          if (tagName.toLowerCase() === 'a') {
            let href = attributes.href;

            if (!href || href.startsWith('#')) {
              return;
            }

            const linkComponents = href.split('/');
            const lastComponent = linkComponents[linkComponents.length - 1];

            if (!lastComponent.endsWith('.html') && lastComponent.split('.').length > 1) {
              return;
            }

            const url = new URL(href, base);
            url.hash = '';

            links.push(url.toString());
          }
          /**
           * On <meta> tag check if REP rules are enforced and update noindex and nofollow flags accordingly.
           */
          else if (tagName.toLowerCase() === 'meta') {
            if (!attributes.name || attributes.name.toLowerCase() !== 'robots') {
              return;
            }

            if (!attributes.content) {
              return;
            }

            nofollow = attributes.content.toLowerCase().includes('nofollow');
            noindex = attributes.content.toLowerCase().includes('noindex');
          }
        },

        ontext: (_text) => {
          /**
           * When text is received, remove all empty spaces and append it to the already existing text.
           */
          text = text + _text.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ');
        },

        onend: () => {
          /**
           * Once the DOM has been completely parsed return the text and links found
           * depending to the noindex and nofollow REP rules.
           */
          if (noindex === true || nofollow === true) {
            console.log(noindex, nofollow);
          }

          return resolve({
            links: nofollow === false ? links : [],
            text: noindex === false ? text : null,
          });
        },

        onerror: (e) => {
          return reject(e);
        },

      });

      parser.write(content);
      parser.end();
    });
  },
};
