"use strict";
let request = require("request");

module.exports = (req, res, next) => {
    let coinbaseToken = req.session.coinbaseToken;
    if (!coinbaseToken) {
        res.redirect('/');
        return;
    }
    if (req.session.coinbaseProfile) {
        return next();
    }
    request({
        method: 'GET',
        uri: 'https://api.coinbase.com/v2/user',
        json: true,
        headers: {
            'Authorization': `Bearer ${coinbaseToken}`,
            'CB-VERSION': '2016-05-14',
        },
    }, (err, response, body) => {
        if (err) {
            return next(err);
        }
        req.session.coinbaseProfile = body.data;
        next();
    });
};