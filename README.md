Prerender Service
=========================== 

This is the customized branch of prerender for TrackIF.

basic auth is turned on, so don't forget to set:

export BASIC_AUTH_USERNAME=[username]
export BASIC_AUTH_PASSWORD=[password]

custom plugins:

lib/plugins/override-default-user-agent.js

	Looks for the header "X-User-Agent" and, if found, appends it to the user agent of the Prerender server