FROM mhart/alpine-node:6.1.0

RUN apk add -U git

RUN mkdir -p /app
WORKDIR /app

ADD package.json /app
RUN npm install

ADD . /app

CMD ["node", "bin /serve"]