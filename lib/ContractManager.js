'use strict';

let debug = require('debug')('ethid:contract');
let Web3 = require('web3');
let async = require('async');
let fs = require('fs');
let Contract = require('./models/Contract');
let Identity = require('./models/Identity');

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

        this.web3 = new Web3();
        let provider = new Web3.providers.HttpProvider(process.env.ETH_NODE_URI);
        this.web3.setProvider(provider);
        this.web3.eth.defaultAccount = this.web3.eth.coinbase;
    }

    start(callback) {
        async.waterfall([
            done => this.loadAndCompileContract(done),
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
        debug(`Checking contract at ${contractAddress}`);
        this.contract = this.ContractClass.at(contractAddress);
        let liveCode = this.contractModel.code;
        let compiledCode = this.contractCompiled.code;
        if (liveCode !== compiledCode) {
            debug(`Contract code mismatch, re-deploying.`);
            return this.contractModel.remove(() => {
                this.launchNewContract(callback);
            });
        }
        debug(`Using existing contract at ${contractAddress}`);
        this.setupVerification();
        callback();
    };

    loadAndCompileContract(done) {
        async.waterfall([
            (callback) => {
                debug('Reading contract file');
                fs.readFile(__dirname + '/../support/contracts/EthID.sol', {encoding: 'utf-8'}, callback);
            },
            (source, callback) => {
                debug('Compiling contract');
                this.web3.eth.compile.solidity(source, callback);
            },
            (compiled, callback) => {
                debug('Instantiating contract class');
                this.contractCompiled = compiled.EthID;
                let abiArray = this.contractCompiled.info.abiDefinition;
                this.ContractClass = this.web3.eth.contract(abiArray);
                callback();
            }
        ], done);
    }

    launchNewContract(callback) {
        let onContractCreated = (err, contract) => {
            if (err) {
                return callback(err);
            }
            if (!contract.address) {
                debug(`Contract being deployed by tx with hash ${contract.transactionHash}`);
                return;
            }
            debug(`Contract deployed at ${contract.address}`);
            this.contract = contract;
            var abiDefinition = this.contractCompiled.info.abiDefinition;
            Contract.create({
                identityType: this.identityType,
                ethereumAddress: contract.address,
                abiDefinition: JSON.stringify(abiDefinition),
                code: this.contractCompiled.code,
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
            data: this.contractCompiled.code,
            gas: 1000000,
        };
        this.contract = this.ContractClass.new(this.identityType, options, onContractCreated); // Deploy new contract
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
            debug(`Subscribed to ${eventName}`);
        });
    }
    
    verifyIdentity(ethereumAddress, identityValue) {
        this.contract._setVerifiedIdentity(ethereumAddress, identityValue, (err, txHash) => {
            if (err) {
                console.error(err);
                return;
            }
            debug(`Called _setVerifiedIdentity with ${ethereumAddress} => ${identityValue} (${txHash})`);
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