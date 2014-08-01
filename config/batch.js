module.exports = {
  port: 3030,

  logger: {
    console: true,
    path: 'log/prerender.log',
    papertrail: {
      host: 'logs.papertrailapp.com',
      port: 50175
    }
  },
  aws: {
    snsNotifyArn: 'arn:aws:sns:us-east-1:024376647576:prerender'
  },

  phantom_cluster_num_workers: 2,
  phantom_worker_iterations: 10,
  phantom_cluster_base_port: 12300,
  phantom_cluster_message_timeout: 1000,
  page_done_check_timeout: 100,
  resource_download_timeout: 10000,
  wait_after_last_request: 1000,
  js_check_timeout: 50,
  js_timeout: 15000,
  evaluate_javascript_check_timeout: 1000,
  follow_redirect: true,

  awsAccessKey: process.env.AWS_ACCESS_KEY,
  awsSecretKey: process.env.AWS_SECRET_ACCESS_KEY,

  s3Bucket: 'webflow-prerender-prod',
  s3_prefix_key: 'prerender'
};
