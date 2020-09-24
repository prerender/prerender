FROM node:12-alpine
ENV CHROME_BIN=/usr/bin/chromium-browser
ENV CHROME_PATH=/usr/lib/chromium/
ENV MEMORY_CACHE=0

COPY ./package.json .
COPY ./server.js .

# install chromium and clear cache
RUN apk add --update-cache chromium \
 && rm -rf /var/cache/apk/* /tmp/*

# install npm packages
RUN npm install --no-package-lock

EXPOSE 3000
RUN mkdir -p /app
RUN adduser -D random-user
RUN chown -R random-user /app
USER random-user
CMD ["node", "server.js"]
