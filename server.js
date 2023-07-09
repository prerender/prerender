module.exports = require('./lib');

function route (){

    const prerender = require('./lib');
    const server = prerender();

    server.use(prerender.sendPrerenderHeader());
    server.use(prerender.browserForceRestart());
    // server.use(prerender.blockResources());
    server.use(prerender.addMetaTags());
    server.use(prerender.removeScriptTags());
    server.use(prerender.httpHeaders());

    server.start();
}

module.exports = { route }