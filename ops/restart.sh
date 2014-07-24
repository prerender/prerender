#!/bin/bash
# 
# Restarts the prerender forever daemon, or, if it's not running, start it.
# Also creates the server directory if it doesn't exist.

PID=`forever list | grep prerender.js | awk '{print $7}'`
if [ "$PID" != "" ]; then
  echo "Killing all phantom processes..."
  pkill phantom
  echo "Restarting prerender.js..."
  forever restart prerender.js
else
  if [ "$NODE_ENV" == "development" ]; then
    cd `dirname $0`/..
    DIR=`pwd`
    cd ..
  else
    DIR=/opt/prerender/current
    cd /opt/prerender
  fi
  echo "Target directory: $DIR"

  if [ ! -d server ]; then
    echo "Creating `pwd`/server directory"
    mkdir server
    cd server
    ln -s $DIR/prerender.js .
    ln -s $DIR/config .
    ln -s $DIR/public .
    ln -s $DIR/views .
    npm install config
  else
    cd server
  fi
  echo "Starting prerender.js with forever"
  forever start prerender.js
fi
