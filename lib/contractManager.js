'use strict';

let Web3 = require('web3');
let async = require('async');
let fs = require('fs');
let Redis = require('redis');
let emailValidator = require('email-validator');

class ContractManager {
    constructor() {
        this.web3 = new Web3();
        let provider = new Web3.providers.HttpProvider(process.env.ETH_NODE_URI);
        this.web3.setProvider(provider);
        this.web3.eth.defaultAccount = this.web3.eth.coinbase;

        this.redis = Redis.createClient(process.env.REDIS_URI);
    }
    
    start() {
        this.redis.get('contractAddress', (err, contractAddress) => {
            if (!contractAddress) {
                this.launchNewContract();
            }
            else {
                this.setupContractAtAddress(contractAddress);
            }
        });
    }

    setupContractAtAddress(contractAddress) {
        console.log(`Checking existing contract at ${contractAddress}`);
        this.loadAndCompileContract(() => {
            this.contractInstance = this.EthereumID.at(contractAddress);
            let contractExists = this.web3.eth.getCode(contractAddress) !== '0x';
            if (!contractExists) {
                console.log(`Contract does not exist. Re-deploying`);
                return this.launchNewContract();
            }
            console.log(`Hooking up to existing contract at ${contractAddress}`);
            this.setupVerification();
        });
    };

    loadAndCompileContract(done) {
        async.waterfall([
            (callback) => {
                fs.readFile(__dirname + '/../contracts/eid.sol', { encoding: 'utf-8' }, callback);
            },
            (source, callback) => {
                this.contractCompiled = this.web3.eth.compile.solidity(source);
                let abiArray = this.contractCompiled.EthereumID.info.abiDefinition;
                this.EthereumID = this.web3.eth.contract(abiArray);
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
            console.log(`Console deployed at ${contract.address}`);
            this.redis.set('contractAddress', contract.address, Redis.print);
        };

        this.loadAndCompileContract(() => {
            let options = {
                data: this.contractCompiled.EthereumID.code,
                gas: 1000000,
            };
            this.contractInstance = this.EthereumID.new(options, onContractCreated); // Deploy new contract
        });
    }

    setupVerification() {
        this.contractInstance.Registered(this.handleRegistered.bind(this));
        this.contractInstance.Unregistered(this.handleUnregistered.bind(this));
    }

    handleRegistered(err, data) {
        this._addToPending(err, data, 'pending register');
    }

    handleUnregistered(err, data) {
        this._addToPending(err, data, 'pending unregister');
    }

    _addToPending(err, data, actionType) {
        if (err) {
            console.error(err);
            return;
        }
        let ethAddr = data.args.addr;
        let email = data.args.email;
        if (!emailValidator.validate(email)) {
            return;
        }
        let pendingKey = `${email} ${actionType}`;
        this.redis.sadd(pendingKey, ethAddr, (err, result) => {
            if (err) {
                console.error(err);
                return;
            }
            this.redis.expire(pendingKey, 24 * 60 * 60); // After 24 hrs, key expires
            if (result) {
                console.log(`Added ${actionType} eth address ${ethAddr} to ${email}`);
            }
        });
    }
}

module.exports = new ContractManager();