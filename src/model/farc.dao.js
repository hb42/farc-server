/**
 * Created by hb on 25.05.16.
 */
"use strict";
// let Schema = mongoose.Schema;
// let ObjectId = Schema.Types.ObjectId;
var FarcDAO = (function () {
    function FarcDAO(db) {
        this.db = db;
        //
    }
    FarcDAO.prototype.getEps = function () {
        console.info("farcService.getEps() ");
        return this.db.farcEndpunktModel.find({}).exec();
        // return this.model.EP.find(err => {
        //   if (err) {
        //     console.log("error @find " + err);
        //   } else {
        //     console.log("@find");
        //   }
        // }).exec(err => {
        //   if (err) {
        //     console.log("error @exec " + err);
        //   } else {
        //     console.log("@exec ");
        //     // return result;
        //   }
        // });
    };
    return FarcDAO;
}());
exports.FarcDAO = FarcDAO;
;
