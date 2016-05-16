'use strict';

let Web3 = require('web3');
let async = require('async');
let fs = require('fs');
let Contract = require('./models/Contract');
let Identity = require('./models/Identity');

let emailValidator = require('email-validator');

class ContractManager {
    constructor(identityType) {
        this.identityType = identityType;

        this.web3 = new Web3();
        let provider = new Web3.providers.HttpProvider(process.env.ETH_NODE_URI);
        this.web3.setProvider(provider);
        this.web3.eth.defaultAccount = this.web3.eth.coinbase;
    }

    start() {
        Contract.findOne({
            identityType: this.identityType,
        }, (err, contractModel) => {
            if (err) {
                console.error(err);
                return;
            }
            if (!contractModel) {
                return this.launchNewContract();
            }
            this.contractModel = contractModel;
            this.setupContract();
        });
    }

    setupContract() {
        let contractAddress = this.contractModel.ethereumAddress;
        console.log(`Checking existing contract at ${contractAddress}`);
        this.loadAndCompileContract(() => {
            this.contract = this.ContractClass.at(contractAddress);
            let liveCode = this.web3.eth.getCode(contractAddress).slice(0, 12);
            let compiledCode = this.contractCompiled.EthereumID.code.slice(0, 12);
            let contractExists = liveCode === compiledCode;
            if (!contractExists) {
                console.log(`Contract code mismatch, re-deploying \n${liveCode} !== \n${compiledCode}`);
                return this.contractModel.remove(() => {
                    this.launchNewContract();
                });
            }
            console.log(`Hooking up to existing contract at ${contractAddress}`);
            this.setupVerification();
        });
    };

    loadAndCompileContract(done) {
        async.waterfall([
            (callback) => {
                fs.readFile(__dirname + '/../contracts/eid.sol', {encoding: 'utf-8'}, callback);
            },
            (source, callback) => {
                this.contractCompiled = this.web3.eth.compile.solidity(source);
                let abiArray = this.contractCompiled.EthereumID.info.abiDefinition;
                this.ContractClass = this.web3.eth.contract(abiArray);
                callback();
            }
        ], done);
    }

    launchNewContract() {
        let onContractCreated = (err, contract) => {
            if (err) {
                console.error(err);
                return;
            }
            if (!contract.address) {
                console.log(`Contract being deployed by tx with hash ${contract.transactionHash}`);
                return;
            }
            console.log(`Contract deployed at ${contract.address}`);
            Contract.create({
                identityType: this.identityType,
                ethereumAddress: contract.address,
            }, (err, contractModel) => {
                if (err) {
                    console.error(err);
                    return;
                }
                console.log(`Contract saved: ${contractModel.toString()}`);
                this.contractModel = contractModel;
            });
        };

        this.loadAndCompileContract(() => {
            let options = {
                data: this.contractCompiled.EthereumID.code,
                gas: 1000000,
            };
            this.contract = this.ContractClass.new(options, onContractCreated); // Deploy new contract
        });
    }

    setupVerification() {
        this.contract.Registered(this.handleRegistered.bind(this));
        this.contract.Unregistered(this.handleUnregistered.bind(this));
    }

    handleRegistered(err, data) {
        if (err) {
            console.error(err);
            return;
        }
        console.log(`Registered(${JSON.stringify(data.args)})`);
        let ethAddr = data.args.addr;
        let email = data.args.email;
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
                console.log(`Creating identity: ${JSON.stringify(data)}`);
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
            console.log(`Pending identity: ${identity.toString()}`);
        });
    }

    handleUnregistered(err, data) {
        if (err) {
            console.error(err);
            return;
        }
        console.log(`Unregistered(${JSON.stringify(data.args)})`);
        let ethAddr = data.args.addr;
        let email = data.args.email;
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
            console.log(`Removed identity: ${JSON.stringify(query)}`);
        });
    }
}

module.exports = ContractManager;