"use strict";
require('localenv');

let fs = require("fs");
let path = require('path');
let contractAddress = process.argv[2];
let identityValue = process.argv[3];

let Web3 = require('web3');

let web3 = new Web3();
let provider = new Web3.providers.HttpProvider(process.env.ETH_NODE_URI);
web3.setProvider(provider);
web3.eth.defaultAccount = web3.eth.coinbase;

let contractSource = fs.readFileSync(path.resolve('./support/contracts/EthID.sol'), 'utf-8');

let compiled = web3.eth.compile.solidity(contractSource);
let Contract = web3.eth.contract(compiled.EthID.info.abiDefinition);
let contract = Contract.at(contractAddress);

console.log(`linking ${contractAddress} with '${identityValue}'`);
contract.link(identityValue);