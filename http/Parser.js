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

  extract: function extract(content, base) {
    const links = [];
    let text = '';

    let noindex = false,
      nofollow = false;

    return new Promise((resolve, reject) => {
      const parser = new htmlparser.Parser({

        onopentag: (tagName, attributes) => {
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
          else if (tagName.toLowerCase() === 'meta') {
            if (!attributes.name || attributes.name.toLowerCase() !== 'robots') {
              return;
            }

            if (!attributes.content) {
              return;
            }

            nofollow = attributes.content.toLowerCase().includes('nofollow');
            noindex = attributes.content.toLowerCase().includes('noindex');

            // console.log(attributes.content, nofollow, noindex);
          }
        },

        ontext: (_text) => {
          text = text + _text.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ');
        },

        onend: () => {
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
