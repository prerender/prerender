var config = require('config');
var debug = require('debug')('prerender-snsNotify');
var AWS = require('aws-sdk');
var logger = require('../logger')('snsNotify');

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
      if (req.prerender.valid === false) {
        logger.warn('Skipping snsNotify');
        return next();
      }
      
      debug('sns publish: %s', req.prerender.url);

      // Return right away to not hold request
      next();

      var snsMessage = {
        url: req.prerender.url,
        'user-agent': req.headers['user-agent'],
        time: Date.now() - req.prerender.start.getTime()
      };
      debug('snsMessage: %j', snsMessage);

      var params = {
        Message: JSON.stringify(snsMessage, '\t', 5),
        Subject: 'prerendered',
        TopicArn: config.aws.snsNotifyArn
      };
      sns.publish(params, function(err, data) {
        if (err) return debug(err, err.stack); 
        debug(data);
        logger.info('snsNotify: %j', data);
      });
    }
};
