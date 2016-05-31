"use strict";
let mongoose = require("mongoose");
let Schema = mongoose.Schema;

let IdentitySchema = new Schema({
    identityType: String,
    ethereumAddress: String,
    identityValue: String,
    registerState: String,
    extraInfo: Schema.Types.Mixed,
}, {
    timestamps: true,
});

let Identity = mongoose.model('Identity', IdentitySchema);

module.exports = Identity;