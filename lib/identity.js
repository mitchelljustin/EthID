'use strict';

let Web3 = require('web3');
let async = require('async');
let fs = require('fs');

let EVENTS = [
    'Registered(address,string)',
    'RegisteredVerified(address,string)',
    'Unregistered(address,string)',
    'UnregisteredVerified(address,string)',
];
let TOPICS = EVENTS.map(event => `0x${ this.web3.sha3(event) }`);

class IdentityVerifier {
    constructor() {
        this.web3 = new Web3();
        let provider = new Web3.providers.HttpProvider(process.env.ETH_NODE_URI);
        this.web3.setProvider(provider);

        this.redis = require('redis').createClient(process.env.REDIS_URI);

        this.redis.get('contractAddress', (err, contractAddress) => {
            if (!contractAddress) {
                this.launchNewContract();
            }
            else {
                this.setupContract(contractAddress);
            }
        });
    }
    
    launchNewContract() {
        async.waterfall([
            (callback) => {
                fs.readFile('../contracts/eid.sol', {}, callback);
            },
            (contractSource, callback) => {
                this.web3.eth.compil
            },
        ]);
    }

    setupContract(contractAddress) {
        this.contractAddress = contractAddress;
        this.eventFilter = this.web3.eth.filter({
            fromBlock: 0,
            toBlock: 'latest',
            address: contractAddress,
            topics: TOPICS,
        });
        this.eventFilter.watch(this.onEvent.bind(this));
    }

    onEvent(err, event) {

    }
}

module.exports = new IdentityVerifier();