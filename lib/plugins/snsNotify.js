var config = require('config');
var debug = require('debug')('prerender-snsNotify');
var AWS = require('aws-sdk');

AWS.config.update({
  accessKeyId: config.awsAccessKey,
  secretAccessKey: config.awsSecretKey,
  region: 'us-east-1'
});

var sns = new AWS.SNS();

module.exports = {
    init: function() {
    },
    beforeSend: function(req, res, next) {
      debug('sns publish: %s', req.prerender.url);

      var params = {
        Message: req.prerender.url,
        Subject: 'prerendered',
        TopicArn: config.logger.aws.snsNotifyArn
      };
      sns.publish(params, function(err, data) {
        if (err) return debug(err, err.stack); 
        debug(data);        
        next();
      });
    }
};
