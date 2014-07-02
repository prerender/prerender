var logger = require('../logger')();

module.exports = {
  onPhantomPageCreate: function(phantom, req, res, next) {
    phantom.set('onConsoleMessage', function(msg) {
      logger.info(msg);
    });
    next();
  }
};
