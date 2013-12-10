Performance changes

* Requests are now load balanced between multiple phantomjs processes. How
  this affects performance is a product of the internals of phantomjs and
  the phantomjs-node bridge, neither of which I'm familiar with enough to
  say.
* Because of the load balancing, prerender is now virtually unaffected
  performance-wise by phantomjs/the phantomjs-node bridge crashing. Whereas
  before the system had to wait for everything to restart, this will just
  load balance to another client.

General code changes

* Logic has been broken up into separate modules since phantom-cluster
  enforces clear delineation of responsibilities between server and client
  work.
* Instead of the `.plugins*` methods for firing off middleware events, I added
  a generic `._pluginEvent` method to reduce some of the code.
* Some bits of logic has been shifted around, but I tried to maintain as much
  compatibility as possible, especially with respect to plugins.

Breaking changes

* The plugin events `onPhantomPageCreate` and `afterPhantomRequest` are no
  longer passed the express `req` and `res` objects, as they aren't available
  on worker processes. Instead, they're passed the phantomjs webpage object
  and the full context of the current request.

Other notes

* I had to make a custom fork of phantomjs-node:
  https://github.com/dailymuse/phantomjs-node. This includes a patch that
  ensures phantomjs processes are cleaned up on exit. This problem does
  not affect the current version of collectiveip/prerender, but would
  otherwise cause memory leaks in this version of dailymuse/prerender.
* http://google.com as a test successfully renders whereas it didn't before.
  So much has changed that I'm not sure why, but hopefully this is a sign that
  it is more resilient now.
