"use strict";
require('localenv');
var fs = require("fs");

let web3 = new Web3();
let provider = new Web3.providers.HttpProvider(process.env.ETH_NODE_URI);
web3.setProvider(provider);
web3.eth.defaultAccount = web3.eth.coinbase;

let contractSource = fs.readFileSync('../contracts/eid.sol');
