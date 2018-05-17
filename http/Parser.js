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
};
