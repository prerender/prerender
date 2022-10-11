const fs = require('fs');
const path = require('path');
const util = require('./util');
const basename = path.basename;
const server = require('./server');
const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const compression = require('compression');

exports = module.exports = (
  options = {
    logRequests: process.env.PRERENDER_LOG_REQUESTS === 'true',
  }
) => {
  const parsedOptions = Object.assign(
    {},
    {
      port: options.port || process.env.PORT || 3000,
    },
    options
  );

  server.init(options);
  server.onRequest = server.onRequest.bind(server);

  app.disable('x-powered-by');
  app.use(compression());

  // inbuilt health check
  app.get('/health-check', (req, res) => res.status(200).send({ health: 'good' }));

  const addQuery = (req, res, next) => {
    req.url += (req.url.indexOf('?') === -1 ? '?' : '&') + 'bot=true';
    next();
  };

  app.get('*', addQuery, server.onRequest);

  //dont check content-type and just always try to parse body as json
  app.post('*', bodyParser.json({ type: () => true }), server.onRequest);

  app.listen(parsedOptions, () => util.log(`Prerender server accepting requests on port ${parsedOptions.port}`));

  return server;
};

fs.readdirSync(__dirname + '/plugins').forEach((filename) => {
  if (!/\.js$/.test(filename)) return;

  var name = basename(filename, '.js');

  function load() {
    return require('./plugins/' + name);
  }

  Object.defineProperty(exports, name, {
    value: load,
  });
});
