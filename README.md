Prerender Service [![Stories in Ready](https://badge.waffle.io/prerender/prerender.png?label=ready&title=Ready)](https://waffle.io/prerender/prerender)
===========================

Google, Facebook, Twitter, Yahoo, and Bing are constantly trying to view your website... but they don't execute javascript. That's why we built Prerender. Prerender is perfect for AngularJS SEO, BackboneJS SEO, EmberJS SEO, and any other javascript framework.

Behind the scenes, Prerender is a node server from [prerender.io](http://prerender.io) that uses phantomjs to create static HTML out of a javascript page. We host this as a service at [prerender.io](http://prerender.io) but we also open sourced it because we believe basic SEO is a right, not a privilege!

It should be used in conjunction with [these middleware libraries](#middleware) to serve the prerendered HTML to crawlers for SEO. Get started in two lines of code using [Rails](https://github.com/prerender/prerender_rails) or [Node](https://github.com/prerender/prerender-node).

Prerender adheres to google's `_escaped_fragment_` proposal, which we recommend you use. It's easy:
- Just add &lt;meta name="fragment" content="!"> to the &lt;head> of all of your pages
- If you use hash urls (#), change them to the hash-bang (#!)
- That's it! Perfect SEO on javascript pages.

Prerender includes lots of plugins if you are running your own server, for example using Amazon S3 to [cache your prerendered HTML](#s3-html-cache).
Prerender also starts multiple phantomjs processes to maximize throughput.


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
* [prerender-go](https://github.com/tampajohn/prerender)

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

`GET http://service.prerender.io/https://www.google.com`

`GET http://service.prerender.io/https://www.google.com/search?q=angular`


## Running locally
If you are trying to test Prerender with your website on localhost, you'll have to run the Prerender server locally so that Prerender can access your local dev website.

If you are running the prerender service locally. Make sure you set your middleware to point to your local Prerender server with:

`export PRERENDER_SERVICE_URL=<your local url>`

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
	
>If you are installing Prerender under a Windows environment and you encounter errors related to 'node-gyp', you may need to follow these additional steps:
>https://github.com/nodejs/node-gyp#installation

#Customization

You can clone this repo and run `server.js`
OR
use just include prerender in your project with `npm install prerender --save` to create an express-like server with custom plugins.


## Options

### workers
```
var prerender = require('./lib');

var server = prerender({
    workers: 1
});

server.start();
```

The number of Prerender workers that you'd like to start. We suggest 1 per CPU on your machine. `Default: os.cpus().length`

### iterations
```
var prerender = require('./lib');

var server = prerender({
    iterations: 40
});

server.start();
```

The number of pages Prerender should render before restarting the worker. WARNING: Will restart Prerender mid-request if two requests are in flight, causing a 504 response to be sent.

Shutting Prerender down reclaims memory to ensure good performance. You can also set the environment variable of `NUM_ITERATIONS` instead of passing in the `iterations` parameter. `Default: 40`

### softIterations
```
var prerender = require('./lib');

var server = prerender({
    softIterations: 5
});

server.start();
```

The number of pages Prerender should render before restarting the worker. This option counts the number of requests in flight and only restarts the worker if no requests are in flight. If you constantly have more than 1 request in flight, this won't restart the server.

Shutting Prerender down reclaims memory to ensure good performance. You can also set the environment variable of `NUM_SOFT_ITERATIONS` instead of passing in the `softIterations` parameter. `Default: 30`

### cookiesEnabled
```
var prerender = require('./lib');

var server = prerender({
    cookiesEnabled: true
});

server.start();
```

If Prerender should use Cookies. You can also set the environment variable of `COOKIES_ENABLED` instead of passing in the `cookiesEnabled` parameter. `Default: false`

### logRequests
```
var prerender = require('./lib');

var server = prerender({
    logRequests: true
});

server.start();
```

Causes the Prerender server to print out every request made represented by a `+` and every response received represented by a `-`. Lets you analyze page load times. `Default: false`

### pageDoneCheckTimeout
```
var prerender = require('./lib');

var server = prerender({
    pageDoneCheckTimeout: 300
});

server.start();
```

Number of milliseconds between the interval of checking whether the page is done loading or not. You can also set the environment variable of `PAGE_DONE_CHECK_TIMEOUT` instead of passing in the `pageDoneCheckTimeout` parameter. `Default: 300`

### resourceDownloadTimeout
```
var prerender = require('./lib');

var server = prerender({
    resourceDownloadTimeout: 10000
});

server.start();
```

Number of milliseconds to wait while downloading the page, waiting for all pending requests/ajax calls to complete before timing out and continuing on. Time out condition does not cause an error, it just moves on to the javascript execution stage. You can also set the environment variable of `RESOURCE_DOWNLOAD_TIMEOUT` instead of passing in the `resourceDownloadTimeout` parameter. `Default: 10000`

### waitAfterLastRequest
```
var prerender = require('./lib');

var server = prerender({
    waitAfterLastRequest: 500
});

server.start();
```

Number of milliseconds to wait after the number of requests/ajax calls in flight reaches zero. Javascript execution begins after this in order to pull the HTML off of the page. You can also set the environment variable of `WAIT_AFTER_LAST_REQUEST` instead of passing in the `waitAfterLastRequest` parameter. `Default: 500`

### jsTimeout
```
var prerender = require('./lib');

var server = prerender({
    jsTimeout: 10000
});

server.start();
```

Number of milliseconds to continue trying to pull the HTML off of the page using javascript before timing out. Once the timeout is hit, Prerender returns a 200 response with the last HTML that it was able to pull off of the page. You can also set the environment variable of `JS_TIMEOUT` instead of passing in the `jsTimeout` parameter. `Default: 10000`

### jsCheckTimeout
```
var prerender = require('./lib');

var server = prerender({
    jsCheckTimeout: 300
});

server.start();
```

Number of milliseconds between the interval of checking whether the javascript timeout has been reached or not. You can also set the environment variable of `JS_CHECK_TIMEOUT` instead of passing in the `jsCheckTimeout` parameter. `Default: 300`

### noJsExecutionTimeout
```
var prerender = require('./lib');

var server = prerender({
    noJsExecutionTimeout: 3000
});

server.start();
```

Number of milliseconds to wait while not being able to execute javascript before determining that the Prerender server hasn't been able to execute javascript, usually due to a webpage not giving up control of the JS execution thread (infinite loop). You can also set the environment variable of `NO_JS_EXECUTION_TIMEOUT` instead of passing in the `noJsExecutionTimeout` parameter. `Default: 3000`

### evaluateJavascriptCheckTimeout
```
var prerender = require('./lib');

var server = prerender({
    evaluateJavascriptCheckTimeout: 300
});

server.start();
```

Number of milliseconds between executing the javascript on the webpage to pull off the HTML. Pulling off the HTML only happens multiple times when `window.prerenderReady` is set to false. You can also set the environment variable of `EVALUATE_JAVASCRIPT_CHECK_TIMEOUT` instead of passing in the `evaluateJavascriptCheckTimeout` parameter. `Default: 300`

## Plugins

We use a plugin system in the same way that Connect and Express use middleware. Our plugins are a little different and we don't want to confuse the prerender plugins with the [prerender middleware](#middleware), so we opted to call them "plugins".

Plugins are in the `lib/plugins` directory, and add functionality to the prerender service.

Each plugin can implement any of the plugin methods:

####`init()`

####`beforePhantomRequest(req, res, next)`

####`onPhantomPageCreate(phantom, req, res, next)`

####`afterPhantomRequest(req, res, next)`

####`beforeSend(req, res, next)`

## Available plugins

You can enable the plugins in `server.js` by uncommenting the corresponding lines.

### basicAuth

If you want to only allow access to your Prerender server from authorized parties, enable the basic auth plugin.

You will need to add the `BASIC_AUTH_USERNAME` and `BASIC_AUTH_PASSWORD` environment variables.
```
export BASIC_AUTH_USERNAME=prerender
export BASIC_AUTH_PASSWORD=test
```

Then make sure to pass the basic authentication headers (password base64 encoded).

```
curl -u prerender:wrong http://localhost:1337/http://example.com -> 401
curl -u prerender:test http://localhost:1337/http://example.com -> 200
```

### removeScriptTags

We remove script tags because we don't want any framework specific routing/rendering to happen on the rendered HTML once it's executed by the crawler. The crawlers may not execute javascript, but we'd rather be safe than have something get screwed up.

For example, if you rendered the HTML of an angular page but left the angular scripts in there, your browser would try to execute the angular routing and rendering on a page that no longer has any angular bindings.

This plugin implements the `beforeSend` funtion, therefore cached HTML pages still contain scripts tags until they get served.

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
<meta name="prerender-header" content="Location: http://www.google.com">
```

### whitelist

If you only want to allow requests to a certain domain, use this plugin to cause a 404 for any other domains.

You can add the whitelisted domains to the plugin itself, or use the `ALLOWED_DOMAINS` environment variable.

`export ALLOWED_DOMAINS=www.prerender.io,prerender.io`

### blacklist

If you want to disallow requests to a certain domain, use this plugin to cause a 404 for the domains.

You can add the blacklisted domains to the plugin itself, or use the `BLACKLISTED_DOMAINS` environment variable.

`export BLACKLISTED_DOMAINS=yahoo.com,www.google.com`


### <a id='s3-html-cache'></a>
### s3HtmlCache

A `GET` request will check S3 for a cached copy. If a cached copy is found, it will return that. Otherwise, it will make the request to your server and then persist the HTML to the S3 cache.

A `POST` request will skip the S3 cache. It will make a request to your server and then persist the HTML to the S3 cache. The `POST` is meant to update the cache.

You'll need to sign up with Amazon Web Services and export these 3 environment variables.

```
$ export AWS_ACCESS_KEY_ID=<aws access key>
$ export AWS_SECRET_ACCESS_KEY=<aws secret access key>
$ export S3_BUCKET_NAME=<bucket name>
```

Warning! Your keys should be kept private and you'll be charged for all files uploaded to S3.

> If Prerender is hosted on a EC2 instance, you can also take advantage of [IAM instance roles](http://aws.typepad.com/aws/2012/06/iam-roles-for-ec2-instances-simplified-secure-access-to-aws-service-apis-from-ec2.html)
so that you don't need to export your AWS credentials.

> You can also export the S3_PREFIX_KEY variable so that the key (which is by default the complete requested URL) is
prefixed. This is useful if you want to organize the snapshots in the same bucket.

#### Region 


By default, s3HtmlCache works with the US Standard region (East), if your bucket is localized in another region you can config it with an environment variable : `AWS_REGION`.

```
$ export AWS_REGION=<region name>
```

For example :

```
$ export AWS_REGION=eu-west-1
```

### inMemoryHtmlCache

*Note* The in memory cache is per process so if you have multiple Prerender workers then they do not share a cache. For higher traffic websites, use a common cache like redis.

An in memory cache but you can easily change it to any caching system compatible with the `cache-manager` nodejs package.

For example, with the request:

`GET http://service.prerender.io/https://www.facebook.com/`

First time: Overall Elapsed:	00:00:03.3174661

With cache: Overall Elapsed:	00:00:00.0360119


### logger

This will show console.log's from the phantomjs page in your local console. Great for debugging.

### mongodbCache

Caches pages in a MongoDB database. Available at [prerender-mongodb-cache](https://github.com/lammertw/prerender-mongodb-cache) by [@lammertw](https://github.com/lammertw)


### memjsCache

Caches pages in a memjs(memcache) service. Available at [prerender-memjs-cache](https://github.com/lammertw/prerender-memjs-cache) by [@lammertw](https://github.com/lammertw)


### levelCache

Caches pages in a levelDB database. Available at [prerender-level-cache](https://github.com/maxlath/prerender-level-cache) by [@maxlath](https://github.com/maxlath)

### accessLog

Create access log file for prerendered requests. Available at [prerender-access-log](https://github.com/unDemian/prerender-access-log) by [@unDemian](https://github.com/unDemian)


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
