module.exports = {
    beforeSend: function(req, res, next) {
      	if(!req.prerender.documentHTML) {
      		  return next();
      	}
        console.log(req.prerender.url)
        req.prerender.documentHTML = req.prerender.documentHTML.toString().replace(/(<[\s]*head[^>]*>)/i, '$1<base href="'+req.prerender.url+'">'); 
        next();
    }
};
