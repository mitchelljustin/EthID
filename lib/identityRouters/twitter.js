"use strict";

let OAuth = require('oauth-1.0a');
let oauth = OAuth({
    consumer: {
        public: process.env.TWITTER_CLIENT_ID,
        secret: process.env.TWITTER_CLIENT_SECRET,
    },
    signature_method: 'HMAC-SHA1'
});

let request = require('request');
let async = require('async');

let router = require('express').Router();
module.exports = router;

function parseBodyString(body) {
    let result = {};
    body.split('&').forEach(str => {
        let kv = str.split('=');
        result[kv[0]] = kv.slice(1).join('=');
    });
    return result;
}

router.route('/login')
    .get((req, res, next) => {
        let request_data = {
            url: 'https://api.twitter.com/oauth/request_token',
            method: 'POST',
            data: {
                oauth_callback: process.env.TWITTER_OAUTH_REDIRECT_URI,
            }
        };
        let authorize = oauth.authorize(request_data, {});
        request({
            url: request_data.url,
            method: request_data.method,
            form: authorize,
        }, (err, response, body) => {
            if (err) {
                return next(err);
            }
            let result = parseBodyString(body);
            if (result.oauth_callback_confirmed !== 'true') {
                return next(new Error('Could not confirm Twitter OAuth'));
            }
            res.redirect(`https://api.twitter.com/oauth/authenticate?oauth_token=${result.oauth_token}`);
        });
    });

router.route('/login_redirect')
    .get((req, res, next) => {
        let token;
        async.waterfall([
            done => {
                let request_data = {
                    url: 'https://api.twitter.com/oauth/access_token',
                    method: 'POST',
                    data: {
                        oauth_verifier: req.query.oauth_verifier,
                    },
                };
                let authorize = oauth.authorize(request_data, {
                    public: req.query.oauth_token
                });
                request({
                    url: request_data.url,
                    method: request_data.method,
                    headers: oauth.toHeader(authorize),
                    form: request_data.data,
                }, done);
            },
            (response, body, done) => {
                if (response.statusCode !== 200) {
                    return done(new Error(body));
                }
                let result = parseBodyString(body);
                req.session.identityToken = result.oauth_token;
                req.session.identityTokenSecret = result.oauth_token_secret;
                let request_data = {
                    url: 'https://api.twitter.com/1.1/account/verify_credentials.json',
                    method: 'GET',
                    data: {
                    },
                };
                token = {
                    public: result.oauth_token,
                    secret: result.oauth_token_secret,
                };
                let authorize = oauth.authorize(request_data, token);
                request({
                    url: request_data.url,
                    method: request_data.method,
                    headers: oauth.toHeader(authorize),
                    qs: request_data.data,
                }, done);
            },
            (response, body, done) => {
                if (response.statusCode !== 200) {
                    return done(new Error(body));
                }
                let profile = JSON.parse(body);
                req.session.identityType = 'Twitter';
                req.session.identityToken = token;
                req.session.identityValue = `https://twitter.com/${profile.screen_name}`;
                req.session.profile = {
                    name: profile.name,
                    username: profile.screen_name,
                    avatarUrl: profile.profile_image_url,
                };
                done();
            }
        ], (err) => {
            if (err) {
                return next(err);
            }
            res.redirect('/identity');
        })
    });