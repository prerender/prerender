const chrome = require("../../lib/browsers/chrome"),
  sinon = require("sinon"),
  assert = require("assert");

describe("chrome", function() {
  describe("loadUrlThenWaitForPageLoadEvent", function() {
    let tab;
    let sandbox;

    beforeEach(function() {
      sandbox = sinon.createSandbox();

      tab = sandbox.stub();
      tab.prerender = sandbox.stub();
      tab.prerender.pageDoneCheckInterval = 1000;
      tab.prerender.pageLoadTimeout = 1;

      tab.Page = sandbox.stub();
      tab.Page.enable = sandbox.stub();
      tab.Page.enable.resolves(1);
      tab.Page.addScriptToEvaluateOnNewDocument = sandbox.stub();
      tab.Page.navigate = sandbox.stub();
      tab.Page.navigate.resolves(1);

      tab.Emulation = sandbox.stub();
      tab.Emulation.setDeviceMetricsOverride = sandbox.stub();

      chrome.options = chrome.options || {};
    });

    afterEach(function() {
      sandbox.restore();
    });

    it("Should NOT change tabs status code", async function() {
      const expectedStatusCode = 123;
      tab.prerender.statusCode = expectedStatusCode;

      await chrome.loadUrlThenWaitForPageLoadEvent(tab, "the-url");

      assert.strictEqual(tab.prerender.statusCode, expectedStatusCode);
    });

    it("Should change tabs status code to the predefined value", async function() {
      const expectedStatusCode = 222;
      tab.prerender.statusCode = 111;
      tab.prerender.timeoutStatusCode = expectedStatusCode;

      await chrome.loadUrlThenWaitForPageLoadEvent(tab, "the-url");

      assert.strictEqual(tab.prerender.statusCode, expectedStatusCode);
    });
  });
});
