Prerender Service
=========================== 

This is a node server that uses phantomjs to render a javascript-rendered page as HTML. It should be used in conjunction with [prerender_rails](https://github.com/collectiveip/prerender_rails) middleware to serve the rendered HTML to crawlers for SEO. It is also meant to be proxied through your server so that any relative links to things like CSS will work.

It is currently deployed at `http://prerender.herokuapp.com`, or you can deploy your own.

## Deploying your own

	$ git clone https://github.com/collectiveip/prerender.git
	$ heroku create
	$ git push heroku master


## How it works
This is a simple service that only takes a url and returns the rendered HTML (with all script tags removed).

Note: you should proxy the request through your server so that relative links to CSS still work (see [prerender_rails](https://github.com/collectiveip/prerender_rails) for an example)

`GET` http://prerender.herokuapp.com/https://google.com

`GET` http://prerender.herokuapp.com/https://google.com/search?q=angular

## Why do you remove script tags?
We remove script tags because we don't want any framework specific routing/rendering to happen on the rendered HTML once it's executed by the crawler. The crawlers may not execute javascript, but we'd rather be safe than have something get screwed up.

For example, if you rendered the HTML of an angular page but left the angular scripts in there, your browser would try to execute the angular routing and rendering on a page that no longer has any angular bindings.

## License

The MIT License (MIT)

Copyright (c) 2013 Todd Hooper &lt;todd@collectiveip.com&gt;

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