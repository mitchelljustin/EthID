"use strict";
let request = require("request");

module.exports = (req, res, next) => {
    let coinbaseToken = req.session.coinbaseToken;
    if (!coinbaseToken) {
        res.redirect('/');
        return;
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
        req.coinbaseProfile = body.data;
        next();
    });
};