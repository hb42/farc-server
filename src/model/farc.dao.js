"use strict";
var mongoose = require("mongoose");
var farc_model_1 = require("./model/farc-model");
var Schema = mongoose.Schema;
var ObjectId = mongoose.Schema.Types.ObjectId;
var FarcService = (function () {
    function FarcService() {
    }
    FarcService.prototype.getEps = function () {
        console.log("farcService.getEps() ");
        return farc_model_1.EP.find(function (err) {
            if (err) {
                console.log("error @find " + err);
            }
            else {
                console.log("@find");
            }
        }).exec(function (err) {
            if (err) {
                console.log("error @exec " + err);
            }
            else {
                console.log("@exec ");
            }
        });
    };
    return FarcService;
}());
exports.FarcService = FarcService;
;
//# sourceMappingURL=farc-service.js.map