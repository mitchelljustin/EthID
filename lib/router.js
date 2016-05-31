'use strict';

let debug = require('debug')('ethid:router');
let ContractManager = require('./ContractManager');
let Contract = require('./models/Contract');
let Identity = require('./models/Identity');
let async = require("async");
let HttpError = require('http-error');
let Web3 = require('web3');
let web3 = new Web3();

let attachContractManager = require('./middleware/attachContractManager');

let router = require('express').Router();
module.exports = router;

let coinbaseRouter = require('./identityRouters/coinbase');
router.use('/coinbase', coinbaseRouter);

let twitterRouter = require('./identityRouters/twitter');
router.use('/twitter', twitterRouter);

router.use((req, res, next) => {
    debug(`${req.method} ${req.path}`);
    next();
});

router.use((req, res, next) => {
    let _render = res.render;
    res.render = (view, locals, callback) => {
        let isLoggedIn = !!req.session.identityToken;
        Object.assign(locals, {
            isLoggedIn: isLoggedIn,
        });
        if (isLoggedIn) {
            Object.assign(locals, {
                identityType: req.session.identityType,
                identityValue: req.session.identityValue,
                profile: req.session.profile,
            });
        }
        return _render.call(res, view, locals, callback);
    };
    next();
});

router.route('/')
    .get((req, res) => {
        res.render('index', {
            title: 'Home',
        });
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

router.route('/about')
    .get((req, res) => {
        res.render('about', {
            title: 'About',
        });
    });

router.route('/identity')
    .get((req, res, next) => {
        async.waterfall([
            done => {
                Identity
                    .find({
                        identityValue: req.session.identityValue,
                    })
                    .exec(done);
            },
            (identities, done) => {
                identities = identities.map(id => id.toJSON());
                let verifiedIds = identities.filter(id => id.registerState === 'verified');
                let unverifiedIds = identities.filter(id => id.registerState !== 'verified');
                let manager = ContractManager.get(req.session.identityType);
                let contract = manager.contractModel.toJSON();
                res.render('identity', {
                    title: `My ${req.session.identityType} Identity`,
                    profile: req.session.profile,
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

router.route('/identity/approve')
    .post(attachContractManager)
    .post((req, res, next) => {
        let data = req.body;
        Identity
            .findOne({
                ethereumAddress: data.ethereumAddress,
                identityValue: req.session.identityValue,
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
                    req.contractManager.verifyIdentity(identity.ethereumAddress, identity.identityValue);
                    res.send('OK');
                });
            });
    });

router.route('/identity/reject')
    .post(attachContractManager)
    .post((req, res, next) => {
        let data = req.body;
        async.waterfall([
            done => {
                Identity
                    .findOne({
                        ethereumAddress: data.ethereumAddress,
                        identityValue: req.session.identityValue,
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
            (identity, done) => {
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