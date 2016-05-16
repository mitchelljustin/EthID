"use strict";

let redis = require('./redisClient');
let async = require('async');

module.exports = {
    getPendingForEmail(email, callback) {
        let pending = [];
        async.series([
            done => {
                redis.smembers(`${email} pending register`, (registers) => {
                    if (registers) {
                        registers.forEach(addr => {
                            pending.push({ ethAddr: addr, type: 'register' })
                        });
                    }
                    done();
                });
            },
            done => {
                redis.smembers(`${email} pending unregister`, (unregisters) => {
                    if (unregisters) {
                        unregisters.forEach(addr => {
                            pending.push({ ethAddr: addr, type: 'unregister' })
                        });
                    }
                    done();
                });
            },
        ], (err) => {
            callback(err, pending);
        });
    }
};