"use strict";
let mongoose = require("mongoose");
let Schema = mongoose.Schema;

let ContractSchema = new Schema({
    identityType: String,
    ethereumAddress: String,
    abiDefinition: String,
    code: String,
});

let Contract = mongoose.model('Contract', ContractSchema);

module.exports = Contract;