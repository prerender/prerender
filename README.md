Prerender
===========================

Prerender is a node server that uses Headless Chrome to render HTML, screenshots, PDFs, and HAR files out of any web page. The Prerender server listens for an http request, takes the URL and loads it in Headless Chrome, waits for the page to finish loading by waiting for the network to be idle, and then returns your content.

##### The quickest way to run your own prerender server:

```bash
$ npm install prerender
```
##### server.js
```js
const prerender = require('prerender');
const server = prerender();
server.start();
```
##### test it:
```bash
curl http://localhost:3000/render?url=https://www.example.com/
```

## Use Cases
The Prerender server can be used in conjunction with [our Prerender.io middleware](#middleware) in order to serve the prerendered HTML of your javascript website to search engines (Google, Bing, etc) and social networks (Facebook, Twitter, etc) for SEO. We run the Prerender server at scale for SEO needs at [https://prerender.io/](https://prerender.io/).

The Prerender server can be used on its own to crawl any web page and pull down the content for your own parsing needs. We host the Prerender server for your own crawling needs at [https://prerender.com/](https://prerender.com/).


Prerender differs from Google Puppeteer in that Prerender is a web server that takes in URLs and loads them in parallel in a new tab in Headless Chrome. Puppeteer is an API for interacting with Chrome, but you still have to write that interaction yourself. With Prerender, you don't have to write any code to launch Chrome, load pages, wait for the page to load, or pull the content off of the page. The Prerender server handles all of that for you so you can focus on more important things!

Below you will find documentation for our Prerender.io service (website SEO) and our Prerender.com service (web crawling).

[Click here to jump to Prerender.io documentation](#prerenderio)

[Click here to jump to Prerender.com documentation](#prerendercom)


### <a id='prerenderio'></a>
# Prerender.io
###### For serving your prerendered HTML to crawlers for SEO

Prerender solves SEO by serving prerendered HTML to Google and other search engines.  It's easy:
- Just install the appropriate middleware for your app (or check out the source code and build your own)
- Make sure search engines have a way of discovering your pages (e.g. sitemap.xml and links from other parts of your site or from around the web)
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

To test how your website will render through Prerender using the middleware, you'll want to visit the URL http://localhost:8000?_escaped_fragment_=

That should send a request to the Prerender server and display the prerendered page through your website. If you View Source of that page, you should see the HTML with all of the `<script>` tags removed.

Keep in mind you will see 504s for relative URLs when accessing http://localhost:3000/http://localhost:8000 because the actual domain on that request is your prerender server. This isn't really an issue because once you proxy that request through the middleware, then the domain will be your website and those requests won't be sent to the prerender server.  For instance if you want to see your relative URLS working visit `http://localhost:8000?_escaped_fragment_=`


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

### captureConsoleLog
```
var prerender = require('./lib');

var server = prerender({
    captureConsoleLog: true
});

server.start();
```

Prerender server will store all console logs into `pageLoadInfo.logEntries` for further analytics.

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

### followRedirects
```
var prerender = require('./lib');

var server = prerender({
    followRedirects: false
});

server.start();
```

Whether Chrome follows a redirect on the first request if a redirect is encountered. Normally, for SEO purposes, you do not want to follow redirects. Instead, you want the Prerender server to return the redirect to the crawlers so they can update their index. Don't set this to `true` unless you know what you are doing. You can also set the environment variable of `FOLLOW_REDIRECTS` instead of passing in the `followRedirects` parameter.

`Default: false`

## Plugins

We use a plugin system in the same way that Connect and Express use middleware. Our plugins are a little different and we don't want to confuse the prerender plugins with the [prerender middleware](#middleware), so we opted to call them "plugins".

Plugins are in the `lib/plugins` directory, and add functionality to the prerender service.

Each plugin can implement any of the plugin methods:

#### `init()`

#### `requestReceived(req, res, next)`

#### `tabCreated(req, res, next)`

#### `pageLoaded(req, res, next)`

#### `beforeSend(req, res, next)`

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

Caches pages in memory. Available at [prerender-memory-cache](https://github.com/prerender/prerender-memory-cache)

### s3-html-cache

Caches pages in S3. Available at [coming soon](https://github.com/prerender/prerender)

--------------------

### <a id='prerendercom'></a>
# Prerender.com
###### For doing your own web crawling

When running your Prerender server in the web crawling context, we have a separate "API" for the server that is more complex to let you do different things like:
- get HTML from a web page
- get screenshots (viewport or full screen) from a web page
- get PDFS from a web page
- get HAR files from a web page
- execute your own javascript and return json along with the HTML

If you make an http request to the `/render` endpoint, you can pass any of the following options. You can pass any of these options as query parameters on a GET request or as JSON properties on a POST request. We recommend using a POST request but we will display GET requests here for brevity. Click here to see [how to send the POST request](#getvspost).

These examples assume you have the server running locally on port 3000 but you can also use our hosted service at [https://prerender.com/](https://prerender.com/).

#### url

The URL you want to load. Returns HTML by default.

```
http://localhost:3000/render?url=https://www.example.com/
```

#### renderType

The type of content you want to pull off the page.

```
http://localhost:3000/render?renderType=html&url=https://www.example.com/
```

Options are `html`, `jpeg`, `png`, `pdf`, `har`.

#### userAgent

Send your own custom user agent when Chrome loads the page.

```
http://localhost:3000/render?userAgent=ExampleCrawlerUserAgent&url=https://www.example.com/
```

#### fullpage

Whether you want your screenshot to be the entire height of the document or just the viewport.

```
http://localhost:3000/render?fullpage=true&renderType=html&url=https://www.example.com/
```

Don't include `fullpage` and we'll just screenshot the normal browser viewport. Include `fullpage=true` for a full page screenshot.

#### width

Screen width. Lets you emulate different screen sizes.

```
http://localhost:3000/render?width=990&url=https://www.example.com/
```

Default is `1440`.

#### height

Screen height. Lets you emulate different screen sizes.

```
http://localhost:3000/render?height=100&url=https://www.example.com/
```

Default is `718`.

#### followRedirects

By default, we don't follow 301 redirects on the initial request so you can be alerted of any changes in URLs to update your crawling data. If you want us to follow redirects instead, you can pass this parameter.

```
http://localhost:3000/render?followRedirects=true&url=https://www.example.com/
```

Default is `false`.

#### javascript

Execute javascript to modify the page before we snapshot your content. If you set `window.prerenderData` to an object, we will pull the object off the page and return it to you. Great for parsing extra data from a page in javascript.

```
http://localhost:3000/render?javascript=window.prerenderData=window.angular.version&url=https://www.example.com/
```

When using this parameter and `window.prerenderData`, the response from Prerender will look like:
```
{
	prerenderData: { example: 'data' },
	content: '<html><body></body></html>'
}
```

If you don't set `window.prerenderData`, the response won't be JSON. The response will just be the normal HTML.

### <a id='getvspost'></a>
### Get vs Post

You can send all options as a query parameter on a GET request or as a JSON property on a POST request. We recommend using the POST request when possible to avoid any issues with URL encoding of GET request query strings. Here's a few pseudo examples:

```
POST http://localhost:3000/render
{
	renderType: 'html',
	javascript: 'window.prerenderData = window.angular.version',
	url: 'https://www.example.com/'
}
```

```
POST http://localhost:3000/render
{
	renderType: 'jpeg',
	fullpage: 'true',
	url: 'https://www.example.com/'
}
```

Check out our [full documentation](https://docs.prerender.io)


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
