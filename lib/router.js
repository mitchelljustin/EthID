'use strict';

let Identity = require('./models/Identity');
let request = require('request');
let attachCoinbaseProfile = require('./middleware/attachCoinbaseProfile');
let async = require("async");

let router = require('express').Router();

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
            json: true,
            form: formData,
        }, (err, response, body) => {
            if (err) {
                return next(err);
            }
            req.session.coinbaseToken = body.access_token;
            res.redirect('/identity');
        });
    });

router.route('/identity')
    .get(attachCoinbaseProfile)
    .get((req, res, next) => {
        async.waterfall([
            done => {
                let emailAddress = req.coinbaseProfile.email;
                Identity
                    .find({
                        emailAddress: emailAddress,
                    })
                    .exec(done);
            },
            (identities, done) => {
                identities = identities.map(identity => {
                    identity = identity.toJSON();
                    identity.verified = identity.registerState === 'verified';
                    return identity;
                });
                res.render('identity', {
                    profile: req.coinbaseProfile,
                    identities: identities,
                });
                done();
            }
        ], (err) => {
            if (err) {
                next(err);
            }
        });
    });

router.route('/identity/approve')
    .post(attachCoinbaseProfile)
    .post((req, res, next) => {
        let data = req.body;
        if (data.emailAddress !== req.coinbaseProfile.email) {
            res.send(400, 'Email address mismatch');
        }
        Identity
            .findOne({
                ethereumAddress: data.ethereumAddress,
                emailAddress: data.emailAddress,
                registerState: 'pending',
            })
            .exec((err, identity) => {
                if (err) {
                    return next(err);
                }
                if (!identity) {
                    return res.send(404, 'Identity not found');
                }
                identity.registerState = 'verified';
                identity.save((err) => {
                    if (err) {
                        return next(err);
                    }
                    res.send('OK');
                });
            });
    });

module.exports = router;