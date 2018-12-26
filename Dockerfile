FROM matchoffice/rubies:2.4.3

ENV APP_PATH /var/www/prerender/current

WORKDIR $APP_PATH

RUN apt-get update
RUN apt install wget

# Install Chrome
RUN wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
RUN dpkg -i google-chrome-stable_current_amd64.deb; apt-get -fy install

RUN curl -sL https://deb.nodesource.com/setup_8.x | bash -
RUN apt-get install -y nodejs

ADD git_repo.tar $APP_PATH

RUN npm install

EXPOSE 8080

CMD ["node", "server.js"]
