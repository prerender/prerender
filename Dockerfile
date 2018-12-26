FROM matchoffice/rubies:2.4.3

ENV APP_PATH /var/www/prerender/current

WORKDIR $APP_PATH

RUN apt-get update

RUN curl -sL https://deb.nodesource.com/setup_8.x | bash -
RUN apt-get install -y nodejs
RUN npm install

ADD git_repo.tar $APP_PATH

EXPOSE 8080

CMD ["node", "server.js"]
