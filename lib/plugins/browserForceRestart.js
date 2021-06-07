//delay incoming requests and force browser to restart before proceeding with requests
const BROWSER_FORCE_RESTART_PERIOD = process.env.BROWSER_FORCE_RESTART_PERIOD || 3600000;

function disconnectBrowserIfBrowserShouldBeRestarted(req) {
  const { server } = req;
  //force a browser restart every hour
  //this lets any current browser requests finish while preventing new tabs from being created
  //this causes new requests to wait for the browser to restart before opening a new tab
  if(!server.isThisTheOnlyInFlightRequest(req) && new Date().getTime() - server.lastRestart > BROWSER_FORCE_RESTART_PERIOD) {
    server.isBrowserConnected = false;
  }
};


module.exports = {
  connectingToBrowserStarted: (req, res, next) => {
    disconnectBrowserIfBrowserShouldBeRestarted(req);
    next();
  }

}
