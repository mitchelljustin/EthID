'use strict';

let router = require('express').Router();
let identity = require('./identity');

router.route('/')
    .get((req, res) => {
        if (req.session.coinbaseToken) {
            res.redirect('/pending');
            return;
        }
        res.render('index', {
            title: 'EthereumID',
        });
    });

router.route('/pending')
    .get((req, res) => {
        if (!req.session.coinbaseToken) {
            res.redirect('/');
            return;
        }
    });

module.exports = router;