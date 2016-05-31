"use strict";

let ContractManager = require('../ContractManager');

module.exports = (req, res, next) => {
    if (!req.session.identityToken) {
        return next(new Error(`Not logged in, so can't retrieve identity type`));
    }
    let identityType = req.session.identityType;
    let contractManager = ContractManager.get(identityType);
    if (!contractManager) {
        return next(new Error(`No contract manager for identity type '${identityType}'`));
    }
    req.contractManager = contractManager;
    next();
};