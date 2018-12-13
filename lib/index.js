const fs = require('fs');
const path = require('path');
const util = require('./util');
const server = require('./server');
const express = require('express');
const bodyParser = require('body-parser');
const compression = require('compression');
const basename = path.basename;

exports = module.exports = (options = {}, router) => {
    function bindRoutes(router) {
        router.get('*', server.onRequest);
        router.post('*', bodyParser.json({type: () => true}), server.onRequest);
    }

    function createExpressApp() {
        const port = options.port || process.env.PORT || 3000;
        const app = express();
        app.disable('x-powered-by');
        app.use(compression());
        app.listen(port, () => util.log(`Prerender server accepting requests on port ${port}`));
        return app;
    }

    server.init(options);
    server.onRequest = server.onRequest.bind(server);

    const app = router ? router : createExpressApp();
    bindRoutes(app);

    return server;
};

fs.readdirSync(__dirname + '/plugins').forEach((filename) => {
    if (!/\.js$/.test(filename)) return;

    var name = basename(filename, '.js');

    function load() {
        return require('./plugins/' + name);
    };

    Object.defineProperty(exports, name, {
        value: load
    });
});