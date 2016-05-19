FROM mhart/alpine-node:6.1.0

RUN apk add -U git && npm install -g bower

RUN mkdir -p /app
WORKDIR /app

ADD package.json /app
RUN npm install

RUN mkdir -p /app/www
WORKDIR /app/www
ADD www/bower.json /app/www
RUN bower install --allow-root

WORKDIR /app
ADD . /app

CMD ["node", "bin/serve"]