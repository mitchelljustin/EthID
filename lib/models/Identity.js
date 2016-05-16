"use strict";
let mongoose = require("mongoose");
let Schema = mongoose.Schema;

let IdentitySchema = new Schema({
    identityType: String,
    registerState: String,
    ethereumAddress: String,
    emailAddress: String,
    registeredAt: Date,
    extraInfo: Schema.Types.Mixed,
});

let Identity = mongoose.model('Identity', IdentitySchema);

module.exports = Identity;