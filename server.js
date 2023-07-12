module.exports = require('./lib');

const prerender = require('./lib');

const server = prerender({
  followRedirects: true,
  chromeLocation: '/usr/bin/google-chrome',
  chromeFlags: [ '--no-sandbox', '--headless', '--disable-gpu', '--remote-debugging-port=9222', '--hide-scrollbars' ],
})

server.use(require('prerender-memory-cache'))
server.start()