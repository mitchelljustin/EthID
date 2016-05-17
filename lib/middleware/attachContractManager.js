"use strict";

let ContractManager = require('../ContractManager');

module.exports = (req, res, next) => {
    let identityType = req.params.identityType;
    let contractManager = ContractManager.get(identityType);
    if (!contractManager) {
        return next(new Error(`No contract manager for identity type '${identityType}'`));
    }
    req.contractManager = contractManager;
    next();
};