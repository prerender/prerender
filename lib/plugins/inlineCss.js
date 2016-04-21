var jsdom = require("jsdom").jsdom;
var url = require("url");
var rp = require('request-promise');

module.exports = {
  beforeSend: function(req, res, next) {
    if(!req.prerender.documentHTML) {
      return next();
    }
    var document = jsdom(req.prerender.documentHTML.toString(), {});

    var elList = document.getElementsByTagName("link");
    var promiseList = [];

    for (var i in elList) {
      var el = elList[i];
      var relAttr = el.attributes.rel;
      var hrefAttr = el.attributes.href;
      if (relAttr && relAttr.value == "stylesheet" && hrefAttr) {
        var p = function(el){
          var absPath = url.resolve(req.prerender.url, el.attributes.href.value);
          return rp(
            { method: 'GET'
              , uri: absPath
              , gzip: true
            })
            .then(function (htmlString) {
              var css = htmlString;

              var style = document.createElement('style');

              style.type = 'text/css';
              style.id = absPath;
              style.appendChild(document.createTextNode(css));

              el.parentNode.appendChild(style);

              el.parentNode.removeChild(el);
              return absPath;
            })
            .catch(function (err) {
              console.error(err);
            })
            ;
        }(el);

        promiseList.push(p);

      }
    }
    Promise.all(promiseList).then(function(values) {
      req.prerender.documentHTML = document.documentElement.outerHTML;
      next();
    });
  }
};
