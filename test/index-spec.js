var assert = require('assert')
  , sinon = require('sinon')
  , prerender = require('../index')
  , util = require('../lib/util')

describe ('Prerender', function(){

  describe('#util', function(){

    var sandbox;

    beforeEach(function () {
      sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
      sandbox.restore();
    });

    it('should remove the / from the beginning of the URL if present', function(){
      var req = { url: '/http://www.example.com/'};

      var url = util.getUrl(req);

      assert.equal(url, 'http://www.example.com/');

    });

    it('should return the correct URL for #! URLs without query strings', function(){
      var req = { url: 'http://www.example.com/?_escaped_fragment_=/user/1'};

      var url = util.getUrl(req);

      assert.equal(url, 'http://www.example.com/#!/user/1');

    });

    it('should return the correct URL for #! URLs with query strings', function(){
      var req = { url: 'http://www.example.com/?_escaped_fragment_=/user/1&param1=yes&param2=no'};

      var url = util.getUrl(req);

      assert.equal(url, 'http://www.example.com/?param1=yes&param2=no#!/user/1');

    });

    it('should return the correct URL for #! URLs if query string is before hash', function(){
      var req = { url: 'http://www.example.com/?param1=yes&param2=no&_escaped_fragment_=/user/1'};

      var url = util.getUrl(req);

      assert.equal(url, 'http://www.example.com/?param1=yes&param2=no#!/user/1');

    });

    it('should return the correct URL for #! URLs that are encoded with another ?', function(){
      var req = { url: 'http://www.example.com/?_escaped_fragment_=%2Fuser%2F1%3Fparam1%3Dyes%26param2%3Dno'};

      var url = util.getUrl(req);

      assert.equal(url, 'http://www.example.com/?param1=yes&param2=no#!/user/1');

    });

    it('should return the correct URL for html5 push state URLs', function(){
      var req = { url: 'http://www.example.com/user/1?_escaped_fragment_='};

      var url = util.getUrl(req);

      assert.equal(url, 'http://www.example.com/user/1');

    });

    it('should return the correct URL for html5 push state URLs with query strings', function(){
      var req = { url: 'http://www.example.com/user/1?param1=yes&param2=no&_escaped_fragment_='};

      var url = util.getUrl(req);

      assert.equal(url, 'http://www.example.com/user/1?param1=yes&param2=no');

    });

    it('should fix incorrect html5 URL that Bing accesses', function(){
      var req = { url: 'http://www.example.com/?&_escaped_fragment_='};

      var url = util.getUrl(req);

      assert.equal(url, 'http://www.example.com/');

    });


    it('should encode # correctly in URLs that do not use the #!', function(){
      var req = { url: 'http://www.example.com/productNumber=123%23456?_escaped_fragment_='};

      var url = util.getUrl(req);

      assert.equal(url, 'http://www.example.com/productNumber=123%23456');

    });

    it('should not encode non-english characters', function() {
      var req = { url: 'http://www.example.com/كاليفورنيا?_escaped_fragment_='};

      var url = util.getUrl(req);

      assert.equal(url, 'http://www.example.com/كاليفورنيا');
    });
  });
});
