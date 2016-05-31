"use strict";

let request = require('request');
let async = require('async');

let SCOPES = [
    'wallet:user:read',
    'wallet:user:email',
];

let router = require('express').Router();
module.exports = router;

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

        async.waterfall([
            done => request({
                method: 'POST',
                uri: `https://api.coinbase.com/oauth/token`,
                json: true,
                form: formData,
            }, done),
            (response, body, done) => {
                req.session.identityToken = body.access_token;
                req.session.identityType = 'Coinbase';
                request({
                    method: 'GET',
                    uri: 'https://api.coinbase.com/v2/user',
                    json: true,
                    headers: {
                        'Authorization': `Bearer ${body.access_token}`,
                        'CB-VERSION': '2016-05-14',
                    },
                }, done);
            },
            (response, body, done) => {
                if (body.errors) {
                    return done(body.errors);
                }
                let profile = body.data;
                req.session.identityValue = profile.profile_url || `mailto:${profile.email}`;
                req.session.profile = {
                    name: profile.name,
                    username: profile.username,
                    email: profile.email,
                    avatarUrl: profile.avatar_url,
                };
                done();
            }
        ], (err) => {
            if (err) {
                return next(err);
            }
            res.redirect('/identity');
        });
    });
