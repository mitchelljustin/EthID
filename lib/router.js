'use strict';

let request = require('request-promise');

let router = require('express').Router();
let pendingHelper = require('./pendingHelper');

let SCOPES = [
    'wallet:user:read',
    'wallet:user:email',
];

router.route('/')
    .get((req, res) => {
        if (req.session.coinbaseToken) {
            res.redirect('/identity');
            return;
        }
        res.render('index', {
            title: 'EthID',
        });
    });

router.route('/login')
    .get((req, res) => {
        let oauthUrl = `https://www.coinbase.com/oauth/authorize?`;
        oauthUrl += `response_type=code&`;
        oauthUrl += `client_id=${process.env.COINBASE_CLIENT_ID}&`;
        oauthUrl += `redirect_uri=${encodeURIComponent(process.env.COINBASE_OAUTH_REDIRECT_URI)}&`;
        oauthUrl += `scope=${SCOPES.join(',')}&`;
        res.redirect(oauthUrl);
    });

router.route('/login_redirect')
    .get((req, res, next) => {
        let code = req.query.code;
        let formData = {
            grant_type: 'authorization_code',
            code: code,
            client_id: process.env.COINBASE_CLIENT_ID,
            client_secret: process.env.COINBASE_CLIENT_SECRET,
            redirect_uri: process.env.COINBASE_OAUTH_REDIRECT_URI,
        };

        request({
            method: 'POST',
            uri: `https://api.coinbase.com/oauth/token`,
            form: formData,
        })
            .then((bodyStr) => {
                let body = JSON.parse(bodyStr);
                req.session.coinbaseToken = body.access_token;
                res.redirect('/identity');
            })
            .catch(next);
    });

router.route('/identity')
    .get((req, res, next) => {
        let coinbaseToken = req.session.coinbaseToken;
        if (!coinbaseToken) {
            res.redirect('/');
            return;
        }
        request({
            method: 'GET',
            uri: 'https://api.coinbase.com/v2/user',
            headers: {
                'Authorization': `Bearer ${coinbaseToken}`,
                'CB-VERSION': '2016-05-14',
            },
        })
            .then((bodyStr) => {
                let userInfo = JSON.parse(bodyStr).data;
                let email = userInfo.email;
                if (!email) {
                    return next(new Error('Invalid email'));
                }
                pendingHelper.getPendingForEmail(email, (err, pending) => {
                    if (err) {
                        return next(err);
                    }
                    let data = Object.assign({}, {pending: pending}, {
                        title: 'Your Ethereum Identity',
                    });
                    res.render('identity', data);
                });
            })
            .catch((err) => {
                console.log(err);
            });
    });

module.exports = router;