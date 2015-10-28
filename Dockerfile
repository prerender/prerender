FROM debian:jessie
MAINTAINER Recast.AI <hello@recast.ai>

# Let the conatiner know that there is no tty
ENV DEBIAN_FRONTEND noninteractive

# Add and update Debian Sources
RUN echo "deb http://httpredir.debian.org/debian jessie main" > /etc/apt/sources.list && \
echo "deb-src http://httpredir.debian.org/debian jessie main" >> /etc/apt/sources.list && \
echo "deb http://httpredir.debian.org/debian jessie-updates main" >> /etc/apt/sources.list && \
echo "deb-src http://httpredir.debian.org/debian jessie-updates main" >> /etc/apt/sources.list && \
echo "deb http://security.debian.org/ jessie/updates main" >> /etc/apt/sources.list && \
echo "deb-src http://security.debian.org/ jessie/updates main" >> /etc/apt/sources.list

RUN apt-get -y update && apt-get -y upgrade

# Install softs
RUN apt-get -y install curl build-essential g++ flex bison gperf ruby perl \
  libsqlite3-dev libfontconfig1-dev libicu-dev libfreetype6 libssl-dev \
  libpng-dev libjpeg-dev python libx11-dev libxext-dev git

# Install NodeJs
RUN curl -sL https://deb.nodesource.com/setup | bash -
RUN apt-get install -y nodejs

WORKDIR /app
ADD package.json /app/
# If you want a fully autonomous docker, uncomment and comment line above
#RUN git clone https://github.com/prerender/prerender /app
RUN npm install
ADD . /app

#ENV port=
#ENV NODE_HOSTNAME=

ENTRYPOINT ["/usr/bin/npm", "start"]
