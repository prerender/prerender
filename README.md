Prerender Service
=========================== 

This is the customised branch of prerender for TrackIF.

custom plugins:

lib/plugins/override-default-user-agent.js

	Looks for the header "X-User-Agent" and, if found, appends it to the user agent of the Prerender server