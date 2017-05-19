Prerender Service [![Stories in Ready](https://badge.waffle.io/prerender/prerender.png?label=ready&title=Ready)](https://waffle.io/prerender/prerender)
===========================

Google, Facebook, Twitter, Yahoo, and Bing are constantly trying to view your website... but they don't execute javascript. That's why we built Prerender. Prerender is perfect for AngularJS SEO, BackboneJS SEO, EmberJS SEO, and any other javascript framework.

Behind the scenes, Prerender is a node server from [prerender.io](https://prerender.io) that uses headless Chrome to create static HTML out of a javascript page. We host this as a service at [prerender.io](https://prerender.io) but we also open sourced it because we believe basic SEO is a right, not a privilege!

It should be used in conjunction with [these middleware libraries](#middleware) to serve the prerendered HTML to crawlers for SEO. Get started in two lines of code using [Rails](https://github.com/prerender/prerender_rails) or [Node](https://github.com/prerender/prerender-node).

Prerender adheres to google's `_escaped_fragment_` proposal, which we recommend you use. It's easy:
- Just add &lt;meta name="fragment" content="!"> to the &lt;head> of all of your pages
- If you use hash urls (#), change them to the hash-bang (#!)
- That's it! Perfect SEO on javascript pages.


### <a id='middleware'></a>
## Middleware

This is a list of middleware available to use with the prerender service:

#### Official middleware

###### Javascript
* [prerender-node](https://github.com/prerender/prerender-node) (Express)

###### Ruby
* [prerender_rails](https://github.com/prerender/prerender_rails) (Rails)

###### Apache
* [.htaccess](https://gist.github.com/thoop/8072354)

###### Nginx
* [nginx.conf](https://gist.github.com/thoop/8165802)

#### Community middleware

###### PHP
* [zfr-prerender](https://github.com/zf-fr/zfr-prerender) (Zend Framework 2)
* [YuccaPrerenderBundle](https://github.com/rjanot/YuccaPrerenderBundle) (Symfony 2)
* [Laravel Prerender](https://github.com/JeroenNoten/Laravel-Prerender) (Laravel)

###### Java
* [prerender-java](https://github.com/greengerong/prerender-java)

###### Go
* [goprerender](https://github.com/tampajohn/goprerender)

###### Grails
* [grails-prerender](https://github.com/tuler/grails-prerender)

###### Nginx
* [Reverse Proxy Example](https://gist.github.com/Stanback/6998085)

###### Apache
* [.htaccess](https://gist.github.com/Stanback/7028309)

Request more middleware for a different framework in this [issue](https://github.com/prerender/prerender/issues/12).



## How it works
This is a simple service that only takes a url and returns the rendered HTML (with all script tags removed).

Note: you should proxy the request through your server (using middleware) so that any relative links to CSS/images/etc still work.

`GET https://service.prerender.io/https://www.google.com`

`GET https://service.prerender.io/https://www.google.com/search?q=angular`


## Running locally
If you are trying to test Prerender with your website on localhost, you'll have to run the Prerender server locally so that Prerender can access your local dev website.

If you are running the prerender service locally. Make sure you set your middleware to point to your local Prerender server with:

`export PRERENDER_SERVICE_URL=http://localhost:3000`

	$ git clone https://github.com/prerender/prerender.git
	$ cd prerender
	$ npm install
	$ node server.js

Prerender will now be running on http://localhost:3000. If you wanted to start a web app that ran on say, http://localhost:8000, you can now visit the URL http://localhost:3000/http://localhost:8000 to see how your app would render in Prerender.

Keep in mind you will see 504s for relative URLs because the actual domain on that request is your prerender server. This isn't really an issue because once you proxy that request through the middleware, then the domain will be your website and those requests won't be sent to the prerender server.  For instance if you want to see your relative URLS working visit `http://localhost:8000?_escaped_fragment_=`

## Deploying your own on heroku

	$ git clone https://github.com/prerender/prerender.git
	$ cd prerender
	$ heroku create
	$ git push heroku master


# Customization

You can clone this repo and run `server.js` OR include prerender in your project with `npm install prerender --save` to create an express-like server with custom plugins.


## Options

### chromeLocation
```
var prerender = require('./lib');

var server = prerender({
    chromeLocation: '/Applications/Google\ Chrome\ Canary.app/Contents/MacOS/Google\ Chrome\ Canary'
});

server.start();
```

Uses a chrome install at a certain location. Prerender does not download Chrome so you will want to make sure Chrome is installed on your server already. The Prerender server checks a few known locations for Chrome but this lets you override that.

`Default: null`


### logRequests
```
var prerender = require('./lib');

var server = prerender({
    logRequests: true
});

server.start();
```

Causes the Prerender server to print out every request made represented by a `+` and every response received represented by a `-`. Lets you analyze page load times.

`Default: false`

### pageDoneCheckInterval
```
var prerender = require('./lib');

var server = prerender({
    pageDoneCheckInterval: 1000
});

server.start();
```

Number of milliseconds between the interval of checking whether the page is done loading or not. You can also set the environment variable of `PAGE_DONE_CHECK_INTERVAL` instead of passing in the `pageDoneCheckInterval` parameter.

`Default: 500`

### pageLoadTimeout
```
var prerender = require('./lib');

var server = prerender({
    pageLoadTimeout: 20 * 1000
});

server.start();
```

Maximum number of milliseconds to wait while downloading the page, waiting for all pending requests/ajax calls to complete before timing out and continuing on. Time out condition does not cause an error, it just returns the HTML on the page at that moment. You can also set the environment variable of `PAGE_LOAD_TIMEOUT` instead of passing in the `pageLoadTimeout` parameter.

`Default: 20000`

### waitAfterLastRequest
```
var prerender = require('./lib');

var server = prerender({
    waitAfterLastRequest: 500
});

server.start();
```

Number of milliseconds to wait after the number of requests/ajax calls in flight reaches zero. HTML is pulled off of the page at this point. You can also set the environment variable of `WAIT_AFTER_LAST_REQUEST` instead of passing in the `waitAfterLastRequest` parameter.

`Default: 500`

### followRedirect
```
var prerender = require('./lib');

var server = prerender({
    followRedirect: false
});

server.start();
```

Whether Chrome follows a redirect on the first request if a redirect is encountered. Normally, for SEO purposes, you do not want to follow redirects. Instead, you want the Prerender server to return the redirect to the crawlers so they can update their index. Don't set this to `true` unless you know what you are doing. You can also set the environment variable of `FOLLOW_REDIRECT` instead of passing in the `followRedirect` parameter.

`Default: false`

## Plugins

We use a plugin system in the same way that Connect and Express use middleware. Our plugins are a little different and we don't want to confuse the prerender plugins with the [prerender middleware](#middleware), so we opted to call them "plugins".

Plugins are in the `lib/plugins` directory, and add functionality to the prerender service.

Each plugin can implement any of the plugin methods:

#### `init()`

#### `requestReceived(req, res, next)`

#### `tabCreated(req, res, next)`

#### `pageLoaded(req, res, next)`

## Available plugins

You can use any of these plugins by modifying the `server.js` file

### basicAuth

If you want to only allow access to your Prerender server from authorized parties, enable the basic auth plugin.

You will need to add the `BASIC_AUTH_USERNAME` and `BASIC_AUTH_PASSWORD` environment variables.
```
export BASIC_AUTH_USERNAME=prerender
export BASIC_AUTH_PASSWORD=test
```

Then make sure to pass the basic authentication headers (password base64 encoded).

```
curl -u prerender:wrong http://localhost:3000/http://example.com -> 401
curl -u prerender:test http://localhost:3000/http://example.com -> 200
```

### removeScriptTags

We remove script tags because we don't want any framework specific routing/rendering to happen on the rendered HTML once it's executed by the crawler. The crawlers may not execute javascript, but we'd rather be safe than have something get screwed up.

For example, if you rendered the HTML of an angular page but left the angular scripts in there, your browser would try to execute the angular routing and possibly end up clearing out the HTML of the page.

This plugin implements the `pageLoaded` function, so make sure any caching plugins run after this plugin is run to ensure you are caching pages with javascript removed.

### httpHeaders

If your Javascript routing has a catch-all for things like 404's, you can tell the prerender service to serve a 404 to google instead of a 200. This way, google won't index your 404's.

Add these tags in the `<head>` of your page if you want to serve soft http headers. Note: Prerender will still send the HTML of the page. This just modifies the status code and headers being sent.

Example: telling prerender to server this page as a 404
```html
<meta name="prerender-status-code" content="404">
```

Example: telling prerender to serve this page as a 302 redirect
```html
<meta name="prerender-status-code" content="302">
<meta name="prerender-header" content="Location: https://www.google.com">
```

### whitelist

If you only want to allow requests to a certain domain, use this plugin to cause a 404 for any other domains.

You can add the whitelisted domains to the plugin itself, or use the `ALLOWED_DOMAINS` environment variable.

`export ALLOWED_DOMAINS=www.prerender.io,prerender.io`

### blacklist

If you want to disallow requests to a certain domain, use this plugin to cause a 404 for the domains.

You can add the blacklisted domains to the plugin itself, or use the `BLACKLISTED_DOMAINS` environment variable.

`export BLACKLISTED_DOMAINS=yahoo.com,www.google.com`

### in-memory-cache

Caches pages in memory. Available at [coming soon](https://github.com/prerender/prerender)

### s3-html-cache

Caches pages in S3. Available at [coming soon](https://github.com/prerender/prerender)

## License

The MIT License (MIT)

Copyright (c) 2013 Todd Hooper &lt;todd@prerender.io&gt;

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
