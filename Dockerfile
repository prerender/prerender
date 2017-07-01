FROM node:4

EXPOSE 3000

RUN apt-get update \
    && apt-get install -y \
        build-essential g++ flex bison gperf ruby perl \
        libsqlite3-dev libfontconfig1-dev libicu-dev libfreetype6 libssl-dev \
        libpng-dev libjpeg-dev python libx11-dev libxext-dev

RUN git clone git://github.com/ariya/phantomjs.git \
    && cd phantomjs \
    && git checkout 2.0 \
    && echo 'y' | ./build.sh

RUN ln -s /phantomjs/bin/phantomjs /usr/local/bin/phantomjs

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

COPY package.json /usr/src/app/
RUN npm install
COPY . /usr/src/app

CMD [ "npm", "start" ]