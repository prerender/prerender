const server = require('./lib');
/**
 * We are starting the server here now, since SDK consumers (if any) used to receive
 * an already listening server instance in the past, and we changed that in server.js.
 * 
 * So starting it here will keep the API backwards compatible.
 */
server.start();

module.exports = server;