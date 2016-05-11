'use strict';

let router = require('koa-router')();
let identity = require('./identity');

router.get('/', function *() {
    yield this.render('index', {title: 'EthereumID'});
});

module.exports = router;