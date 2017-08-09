FROM node:8.2.1-wheezy
LABEL maintainer="kuzma.wm@gmail.com"

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        bzip2 \
        libfontconfig \
        curl \
    && mkdir /tmp/phantomjs \
    && curl -L https://bitbucket.org/ariya/phantomjs/downloads/phantomjs-2.1.1-linux-x86_64.tar.bz2 \
           | tar -xj --strip-components=1 -C /tmp/phantomjs \
    && cd /tmp/phantomjs \
    && mv bin/phantomjs /usr/local/bin \
    && cd \
    && apt-get purge --auto-remove -y \
        curl \
    && apt-get clean \
    && rm -rf /tmp/* /var/lib/apt/lists/*

WORKDIR /root/prerender
COPY . /root/prerender
RUN npm install

EXPOSE 3000

CMD [ "node", "server.js" ]

