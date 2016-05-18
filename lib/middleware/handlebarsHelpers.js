"use strict";

module.exports = (Handlebars) => {
    Handlebars.registerHelper('ifEqual', function (lvalue, rvalue, options) {
        if (arguments.length < 3) {
            throw new Error("Handlebars ifEqual needs 2 parameters");
        }
        if (lvalue !== rvalue) {
            return options.inverse(this);
        } else {
            return options.fn(this);
        }
    });
};