/**
 * Created by hb on 16.08.16.
 */

import * as fs from "fs";

// import {
//   Model,
// } from "mongoose";

import {
    FarcDB,
} from "../services";
import {
  FarcOeDocument,
  FarcUser,
  FarcUserDocument,
} from "../shared/ext";

/* query
   NICHT IN: let uids= []; uids.push("..") ... -> { "uid" : { $nin: uids } }
             -> nur uid's, die nicht in uids sind
             (array mit 823 Eintraegen gegen 825 records -> 250 ms)
 */

// TODO evtl. als allgemeine DAO abstrahieren

export class FarcUserDAO {

  constructor(private db: FarcDB) {
    console.info("c'tor TestSession");
  }

  // {"uid":"S0777493","name":"Steinbach","vorname":"Hermann","mail":"Hermann.Steinbach@sparkasse-co-lif.de",
  //  "roles":["e077guv-zzv-791-itundkommunikation-coburg-lichtenfels-spk", ... ]} ,
  // DEBUG
  public importFile(file: string) {
    const config = JSON.parse(fs.readFileSync(file, "utf8"));
    config.user.forEach( (u) => {
      // let usr = new this.model.USER({
      const usr = new this.db.farcUserModel({
        uid: u.uid,
        name: u.name,
        vorname: u.vorname,
        mail: u.mail,
        roles: u.roles,
      });
      usr.save()
          .then((res) => {
            console.info("saved " + u.uid);
          })
          .catch((err) => {
            console.error("error saving " + u.uid);
          });
      });
  }

  public findOne(uid: string): Promise<FarcUserDocument> {
    // empty result -> null (kein error)
    return this.db.farcUserModel.findOne({uid: uid.toUpperCase()}).exec();
  }

  public updateUser(user: FarcUserDocument, neu: FarcUser ): Promise<any> {
    return this.db.farcUserModel.findByIdAndUpdate(user._id,
                                           { name: neu.name, vorname: neu.vorname,
                                             mail: neu.mail, roles: neu.roles},
                                           {new: true} ).exec();
  }

  public find(condition: object): Promise<FarcUserDocument[]> {
    return this.db.farcUserModel.find(condition).exec();
  }

  public create(users: FarcUser[]): Promise<FarcUserDocument[]> {
    return this.db.farcUserModel.create(users);
  }

  public delete(user: FarcUserDocument): Promise<any> {  // { result: { ok: 1, n: 1 }, connection: ..
    return this.db.farcUserModel.remove({_id: user._id}).exec();
  }

  public getOe(uid: string): Promise<FarcOeDocument> {
    return this.db.farcEndpunktModel.findOne({endpunkt: uid.toUpperCase()}).exec()
        .then( (ep) => {
          return this.db.farcOeModel.findById(ep.oe).exec();
        });
  }

  // DEBUG
  public testfile(file: string) {
    const uids = [];
    const config = JSON.parse(fs.readFileSync(file, "utf8"));
    config.user.forEach( (u) => {
      uids.push(u.uid);
    });
    uids.pop();
    uids.pop();
    return uids;
  }

}
