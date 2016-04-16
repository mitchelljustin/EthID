'use strict';

let router = require('koa-router')();
let identity = require('./identity');

router.get('/', function *(next) {
    this.body = '<h1>EID</h1>';
});

module.exports = router;