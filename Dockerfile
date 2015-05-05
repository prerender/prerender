FROM ubuntu:14.04.2
MAINTAINER Rogier Slag

# Make the machine up to date and install some dependencies
RUN apt-get install -y software-properties-common python
RUN add-apt-repository ppa:chris-lea/node.js
RUN echo "deb http://us.archive.ubuntu.com/ubuntu/ precise universe" >> /etc/apt/sources.list
RUN apt-get update && apt-get upgrade -y && apt-get install build-essential make gcc nodejs -y

# Set the application
ADD . /opt/prerender/

# Set the exposed port
EXPOSE 3000

# Run NPM love
RUN cd /opt/prerender && npm install

# Start it!
WORKDIR /opt/prerender
CMD ["/usr/bin/node", "server.js"]

