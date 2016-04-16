FROM node:5.9.0

RUN mkdir -p /app
WORKDIR /app

ADD package.json /app
RUN npm install

ADD . /app

CMD ["node", "bin/serve"]