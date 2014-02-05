module.exports = {

    beforeSend: function(req, res, next) {
    	if(!req.prerender.documentHTML) {
    		return next();
    	}

		var regex = (/(class="[\w\s-_]*)prerender-only([\w\s-_]*")/gi);
		req.prerender.documentHTML = req.prerender.documentHTML.toString().replace(regex, "$1 $2");
		
      
        next();
    },
	
	//afterPhantomRequest: function(page, context, next) {
	//	 page.evaluate(function () {
    //       var list = document.getElementsByClassName('panel');
    //      
	//		for(var i = 0; i < list.length; ++i) {
	//			// print the tag name of the node (DIV, SPAN, etc.)
	//			var curr_node = list[i];
	//			var clName = curr_node.className;
	//			//	console.log("Before" + curr_node.className);
	//			curr_node.className = clName.replace(/\bpanel\b/,'');
	//			//console.log(curr_node.className);
	//			//console.log("After" + i + curr_node.className);
	//			
	//		}
	//		
	//		
	//	
    //    });
	//	next();
	//}
  
};
