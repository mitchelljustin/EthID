'use strict';

let debug = require('debug')('ethid:contract');
let Web3 = require('web3');
let async = require('async');
let fs = require('fs');
let Contract = require('./models/Contract');
let Identity = require('./models/Identity');

let emailValidator = require('email-validator');

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
        Contract.findOne({
            identityType: this.identityType,
        }, (err, contractModel) => {
            if (err) {
                return callback(err);
            }
            if (!contractModel) {
                this.launchNewContract(callback);
            } else {
                this.contractModel = contractModel;
                this.setupExistingContract(callback);
            }
        });
    }

    setupExistingContract(callback) {
        let contractAddress = this.contractModel.ethereumAddress;
        debug(`Checking existing contract at ${contractAddress}`);
        this.loadAndCompileContract((err) => {
            if (err) {
                return callback(err);
            }
            this.contract = this.ContractClass.at(contractAddress);
            let liveCode = this.contractModel.code;
            let compiledCode = this.contractCompiled.code;
            let contractCodeCorrect = liveCode === compiledCode;
            if (!contractCodeCorrect) {
                debug(`Contract code mismatch, re-deploying \n${liveCode} !== \n${compiledCode}`);
                return this.contractModel.remove(() => {
                    this.launchNewContract(callback);
                });
            }
            debug(`Hooking up to existing contract at ${contractAddress}`);
            this.setupVerification();
            callback();
        });
    };

    loadAndCompileContract(done) {
        async.waterfall([
            (callback) => {
                fs.readFile(__dirname + '/../support/contracts/EthID.sol', {encoding: 'utf-8'}, callback);
            },
            (source, callback) => {
                this.web3.eth.compile.solidity(source, callback);
            },
            (compiled, callback) => {
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

        this.loadAndCompileContract(() => {
            let options = {
                data: this.contractCompiled.code,
                gas: 1000000,
            };
            this.contract = this.ContractClass.new(this.identityType, options, onContractCreated); // Deploy new contract
        });
    }

    setupVerification() {
        let eventNames = [
            'Registered',
            'Unregistered',
            'RegisteredVerified',
            'UnregisteredVerified',
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
    
    verifyRegistered(ethereumAddress, emailAddress) {
        this.contract._setVerifiedIdentity(ethereumAddress, emailAddress, (err, txHash) => {
            if (err) {
                console.error(err);
                return;
            }
            debug(`Called _setVerifiedIdentity with ${ethereumAddress} => ${emailAddress} (${txHash})`);
        });
    }
    
    verifyUnregistered(ethereumAddress, emailAddress) {
        this.contract._delVerifiedIdentity(ethereumAddress, emailAddress);
        debug(`Called _delVerifiedIdentity on ${ethereumAddress} => ${emailAddress}`);

    }

    handleRegistered(args) {
        let ethAddr = args.addr;
        let email = args.email;
        if (!emailValidator.validate(email)) {
            return;
        }
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
                identity.emailAddress = email;
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

    handleUnregistered(args) {
        let ethAddr = args.addr;
        let email = args.email;
        let query = {
            identityType: this.identityType,
            ethereumAddress: ethAddr,
            emailAddress: email,
        };
        async.waterfall([
            callback => {
                Identity
                    .findOne(query)
                    .exec(callback);
            },
            (identity, callback) => {
                if (!identity) {
                    return callback(new Error(`Identity not found: ${JSON.stringify(query)}`));
                }
                Identity.remove(callback);
            },
        ], (err) => {
            if (err) {
                console.error(err);
                return;
            }
            debug(`Removed identity: ${JSON.stringify(query)}`);
        });
    }

    handleRegisteredVerified(args) {
        let query = {
            ethereumAddress: args.addr,
            emailAddress: args.email,
            registerState: 'verifying',
        };
        async.waterfall([
            callback => {
                Identity
                    .findOne(query)
                    .exec(callback);
            },
            (identity, callback) => {
                if (!identity) {
                    return callback(new Error(`Could not find Identity(${JSON.stringify(query)})`));
                }
                identity.registerState = 'verified';
                identity.save(callback);
            },
            (identity, rowsAffected, callback) => {
                debug(`Verified identity: ${identity.toString()}`);
                callback();
            }
        ], (err) => {
            if (err) {
                console.error(err);
            }
        });
    }

    handleUnregisteredVerified(args) {

    }
}

ContractManager.get = (identityType) => GLOBAL_MANAGERS[identityType];

module.exports = ContractManager;