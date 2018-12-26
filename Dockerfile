FROM matchoffice/rubies:2.4.3

ENV APP_PATH /var/www/prerender/current

WORKDIR $APP_PATH

RUN apt install wget
RUN apt-get update
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add -
RUN sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list'
RUN apt-get update
RUN apt-get install google-chrome-stable

RUN curl -sL https://deb.nodesource.com/setup_8.x | bash -
RUN apt-get install -y nodejs

ADD git_repo.tar $APP_PATH

RUN npm install

EXPOSE 8080

CMD ["node", "server.js"]
