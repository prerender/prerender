/*
 * This is a plugin that just includes other plugins and applies some settings
 * in order to clean up the server.js file
 */
module.exports = {

  init: (server) => {
    server.options.waitAfterLastRequest = 50
    server.options.pageDoneCheckInterval = 50

    server.use(require('./sendPrerenderHeader.js'))
    server.use(require('./requestBlocking.js'))
    server.use(require('./httpHeaders.js'))
  }
};