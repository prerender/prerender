# All rights reserved © 2018 Zero
FROM node:latest
MAINTAINER Mohos Tamas <tomi@mohos.name>

RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable git \
    && apt-get clean
	
RUN cd /home \
	&& git clone https://github.com/zerosuxx/prerender.git \
	&& cd prerender \
	&& npm i

WORKDIR /home/prerender

CMD ["node", "server.js"]