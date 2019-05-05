/*
 * This is a plugin that just includes other plugins and applies some settings
 * in order to clean up the server.js file
 */
module.exports = {

  init: (server) => {
    server.use(require('./sendPrerenderHeader.js'))
    server.use(require('./blockResources.js'))
    server.use(require('./httpHeaders.js'))
    server.use(require('./removeScriptTags.js'))
  }
};