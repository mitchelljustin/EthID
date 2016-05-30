'use strict';

let debug = require('debug')('ethid:router');
let ContractManager = require('./ContractManager');
let Contract = require('./models/Contract');
let Identity = require('./models/Identity');
let request = require('request');
let async = require("async");
let HttpError = require('http-error');
let Web3 = require('web3');
let web3 = new Web3();

let attachCoinbaseProfile = require('./middleware/attachCoinbaseProfile');
let attachContractManager = require('./middleware/attachContractManager');

let router = require('express').Router();

let SCOPES = [
    'wallet:user:read',
    'wallet:user:email',
];

router.use((req, res, next) => {
    debug(`${req.method} ${req.path}`);
    next();
});

router.use((req, res, next) => {
    let _render = res.render;
    res.render = (view, locals, callback) => {
        Object.assign(locals, {
            isLoggedIn: !!req.session.coinbaseToken
        });
        return _render.call(res, view, locals, callback);
    };
    next();
});

router.route('/')
    .get((req, res) => {
        res.render('index', {
            title: 'Home',
        }, () => {
            console.log('swag');
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

router.route('/logout')
    .get((req, res, next) => {
        req.session.destroy((err) => {
            if (err) {
                return next(err);
            }
            res.redirect('/');
        });
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
                let emailAddress = req.session.coinbaseProfile.email;
                Identity
                    .find({
                        emailAddress: emailAddress,
                    })
                    .exec(done);
            },
            (identities, done) => {
                identities = identities.map(id => id.toJSON());
                let verifiedIds = identities.filter(id => id.registerState === 'verified');
                let unverifiedIds = identities.filter(id => id.registerState !== 'verified');
                // TODO: Eventually this won't be hardcoded to coinbase
                let contract = ContractManager.get('Coinbase').contractModel.toJSON();
                res.render('identity', {
                    title: 'My Identity',
                    profile: req.session.coinbaseProfile,
                    verifiedIds: verifiedIds,
                    unverifiedIds: unverifiedIds,
                    contract: contract,
                });
                done();
            }
        ], (err) => {
            if (err) {
                next(err);
            }
        });
    });

router.route('/identity/:identityType/approve')
    .post(attachCoinbaseProfile, attachContractManager)
    .post((req, res, next) => {
        let data = req.body;
        Identity
            .findOne({
                ethereumAddress: data.ethereumAddress,
                emailAddress: req.session.coinbaseProfile.email,
                registerState: 'pending',
            })
            .exec((err, identity) => {
                if (err) {
                    return next(err);
                }
                if (!identity) {
                    return next(new HttpError.NotFound('identity not found'));
                }
                identity.registerState = 'verifying';
                identity.save((err) => {
                    if (err) {
                        return next(err);
                    }
                    req.contractManager.verifyRegistered(identity.ethereumAddress, identity.emailAddress);
                    res.send('OK');
                });
            });
    });

router.route('/identity/:identityType/reject')
    .post(attachCoinbaseProfile, attachContractManager)
    .post((req, res, next) => {
        let data = req.body;
        async.waterfall([
            done => {
                Identity
                    .findOne({
                        ethereumAddress: data.ethereumAddress,
                        emailAddress: req.session.coinbaseProfile.email,
                        registerState: 'pending',
                    })
                    .exec(done);
            },
            (identity, done) => {
                if (!identity) {
                    return next(new HttpError.NotFound('identity not found'));
                }
                identity.remove(done);
            },
            done => {
                res.send('OK');
                done();
            }
        ], (err) => {
            if (err) {
                next(err);
            }
        });
    });

router.route('/contracts')
    .get((req, res, next) => {
        Contract
            .find({})
            .exec((err, contracts) => {
                if (err) {
                    return next(err);
                }
                res.render('contracts', {
                    title: 'Identity Contracts',
                    contracts: contracts,
                });
            })
    });

router.route('/contracts/:identityType')
    .get((req, res, next) => {
        let identityType = req.params.identityType;
        Contract.findOne({
            identityType: identityType,
        })
            .exec((err, contract) => {
                if (err) {
                    return next(err);
                }
                if (!contract) {
                    return res.status(404).render('not_found', {
                        title: 'Contract not found',
                        path: req.path,
                    });
                }
                res.render('contract', {
                    title: `Contract: ${identityType}`,
                    contract: contract,
                });
            })
    });

router.route('/:ethereumAddress')
    .get((req, res, next) => {
        let ethereumAddress = req.params.ethereumAddress;
        if (ethereumAddress.indexOf('0x') !== 0) {
            return next();
        }
        if (!web3.isAddress(ethereumAddress)) {
            return res.status(400).render('error', {
                title: `Not a valid ethereum address: ${ethereumAddress}`,
            });
        }
        Identity.find({
            ethereumAddress: ethereumAddress,
            registerState: 'verified',
        })
            .exec((err, identities) => {
                if (err) {
                    return next(err);
                }
                res.render('public_address', {
                    title: `Public identity for ${ethereumAddress}`,
                    ethereumAddress: ethereumAddress,
                    identities: identities,
                });
            });
    });

module.exports = router;