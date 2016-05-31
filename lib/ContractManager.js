'use strict';

let debug = require('debug')('ethid:contract');
let Web3 = require('web3');
let async = require('async');
let fs = require('fs');
let Contract = require('./models/Contract');
let Identity = require('./models/Identity');

let web3;
let contractSource;
let ContractClass;

let initialize = new Promise((resolve, reject) => {
        web3 = new Web3();
        let provider = new Web3.providers.HttpProvider(process.env.ETH_NODE_URI);
        web3.setProvider(provider);
        web3.eth.defaultAccount = web3.eth.coinbase;

        async.waterfall([
            (callback) => {
                debug('Reading contract file');
                fs.readFile(__dirname + '/../support/contracts/EthID.sol', {encoding: 'utf-8'}, callback);
            },
            (source, callback) => {
                debug('Compiling contract');
                web3.eth.compile.solidity(source, callback);
            },
            (compiled, callback) => {
                debug('Instantiating contract class');
                contractSource = compiled.EthID;
                let abiArray = contractSource.info.abiDefinition;
                ContractClass = web3.eth.contract(abiArray);
                callback();
            },
        ], (err) => {
            if (err) {
                return reject(err);
            }
            return resolve();
        });
    }
);

let GLOBAL_MANAGERS = {};

class ContractManager {
    constructor(identityType) {
        if (!GLOBAL_MANAGERS[identityType]) {
            GLOBAL_MANAGERS[identityType] = this;
        }
        else {
            throw new Error(`Cannot run multiple instances of '${identityType}' contract managers`);
        }
        this.identityType = identityType;
    }

    start(callback) {
        async.waterfall([
            done => initialize.then(done),
            done => Contract.findOne({
                identityType: this.identityType,
            }, done),
            (contractModel, done) => {
                if (!contractModel) {
                    this.launchNewContract(done);
                }
                else {
                    this.contractModel = contractModel;
                    this.setupExistingContract(done);
                }
            },
        ], callback);
    }

    setupExistingContract(callback) {
        let contractAddress = this.contractModel.ethereumAddress;
        debug(`(${this.identityType}) Checking contract at ${contractAddress}`);
        this.contract = ContractClass.at(contractAddress);
        let liveCode = this.contractModel.code;
        let compiledCode = contractSource.code;
        if (liveCode !== compiledCode) {
            debug(`Contract code mismatch, re-deploying.`);
            return this.contractModel.remove(() => {
                this.launchNewContract(callback);
            });
        }
        debug(`(${this.identityType}) Using existing contract at ${contractAddress}`);
        this.setupVerification();
        callback();
    };

    launchNewContract(callback) {
        let onContractCreated = (err, contract) => {
            if (err) {
                return callback(err);
            }
            if (!contract.address) {
                debug(`(${this.identityType}) Contract being deployed by tx with hash ${contract.transactionHash}`);
                return;
            }
            debug(`(${this.identityType}) Contract deployed at ${contract.address}`);
            this.contract = contract;
            var abiDefinition = contractSource.info.abiDefinition;
            Contract.create({
                identityType: this.identityType,
                ethereumAddress: contract.address,
                abiDefinition: JSON.stringify(abiDefinition),
                code: contractSource.code,
            }, (err, contractModel) => {
                if (err) {
                    return callback(err);
                }
                debug(`Contract saved: ${contractModel.toString()}`);
                this.contractModel = contractModel;
                this.setupVerification();
                callback();
            });
        };

        let options = {
            data: contractSource.code,
            gas: 1000000,
        };
        this.contract = ContractClass.new(this.identityType, options, onContractCreated); // Deploy new contract
    }

    setupVerification() {
        let eventNames = [
            'Linked',
            'Unlinked',
            'IdentityVerified',
        ];
        eventNames.forEach(eventName => {
            let subscribeToEvent = this.contract[eventName];
            let eventHandlerName = `handle${eventName}`;
            let eventHandler = this[eventHandlerName].bind(this);
            subscribeToEvent((err, data) => {
                if (err || !data) {
                    console.error(err || new Error('No event data'));
                    return;
                }
                debug(`${eventName}(${JSON.stringify(data.args)})`);
                eventHandler(data.args);
            });
            debug(`(${this.identityType}) Subscribed to ${eventName}`);
        });
    }

    verifyIdentity(ethereumAddress, identityValue) {
        this.contract._setVerifiedIdentity(ethereumAddress, identityValue, (err, txHash) => {
            if (err) {
                console.error(err);
                return;
            }
            debug(`(${this.identityType}) _setVerifiedIdentity(${ethereumAddress} => ${identityValue}) (${txHash})`);
        });
    }

    handleLinked(args) {
        let ethAddr = args.addr;
        let identityValue = args.identityValue;
        async.waterfall([
            callback => {
                Identity
                    .findOne({
                        identityType: this.identityType,
                        ethereumAddress: ethAddr,
                    })
                    .exec(callback);
            },
            (identity, callback) => {
                if (identity) {
                    return callback(null, identity);
                }
                let data = {
                    identityType: this.identityType,
                    ethereumAddress: ethAddr,
                };
                debug(`Creating identity: ${JSON.stringify(data)}`);
                Identity.create(data, callback);
            },
            (identity, callback) => {
                identity.identityValue = identityValue;
                identity.registerState = 'pending';
                identity.save(callback);
            },
        ], (err, identity) => {
            if (err) {
                console.error(err);
                return;
            }
            debug(`Pending identity: ${identity.toString()}`);
        });
    }

    handleUnlinked(args) {
        let ethAddr = args.addr;
        let identityValue = args.identityValue;
        let query = {
            identityType: this.identityType,
            ethereumAddress: ethAddr,
            identityValue: identityValue,
        };
        async.waterfall([
            done => {
                Identity
                    .findOne(query)
                    .exec(done);
            },
            (identity, done) => {
                if (!identity) {
                    return done(new Error(`Identity not found: ${JSON.stringify(query)}`));
                }
                Identity.remove(done);
            },
        ], (err) => {
            if (err) {
                console.error(err);
                return;
            }
            debug(`Removed identity: ${JSON.stringify(query)}`);
        });
    }

    handleIdentityVerified(args) {
        let query = {
            ethereumAddress: args.addr,
            identityValue: args.identityValue,
            registerState: 'verifying',
        };
        async.waterfall([
            done => {
                Identity
                    .findOne(query)
                    .exec(done);
            },
            (identity, done) => {
                if (!identity) {
                    return done(new Error(`Could not find 'verifying' Identity(${JSON.stringify(query)})`));
                }
                identity.registerState = 'verified';
                identity.save(done);
            },
            (identity, rowsAffected, done) => {
                debug(`Verified identity: ${identity.toString()}`);
                done();
            }
        ], (err) => {
            if (err) {
                console.error(err);
            }
        });
    }
}

ContractManager.get = (identityType) => GLOBAL_MANAGERS[identityType];

module.exports = ContractManager;