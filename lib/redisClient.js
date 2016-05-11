"use strict";

let client = require('redis').createClient(process.env.REDIS_URI);
module.exports = client;