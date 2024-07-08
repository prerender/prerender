var url = require('url');

module.exports = {
  init: () => {
    this.ALLOWED_DOMAINS =
      (process.env.ALLOWED_DOMAINS && process.env.ALLOWED_DOMAINS.split(',')) ||
      [];
  },
  requestReceived: (req, res, next) => {
    let parsed = url.parse(req.prerender.url);

    if (this.ALLOWED_DOMAINS.indexOf(parsed.hostname) > -1) {
      next();
    } else {
      res.send(404);
    }
  },
};
