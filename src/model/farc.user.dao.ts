/**
 * Created by hb on 16.08.16.
 */

import * as fs from "fs";

import {
  FarcOeDocument,
  FarcUser,
  FarcUserDocument,
} from "@hb42/lib-farc";
import { LoggerService } from "@hb42/lib-server";

import {
    FarcDB,
} from "../services";

/* query
   NICHT IN: let uids= []; uids.push("..") ... -> { "uid" : { $nin: uids } }
             -> nur uid's, die nicht in uids sind
             (array mit 823 Eintraegen gegen 825 records -> 250 ms)
 */

// TODO evtl. als allgemeine DAO abstrahieren

export class FarcUserDAO {

  private db: FarcDB;

  private log = LoggerService.get("farc-server.model.FarcUserDAO");

  constructor(private farcdb: FarcDB) {
    this.log.info("c'tor TestSession");
    this.db = farcdb;
  }

  // {"uid":"S07xxx","name":"xxx","vorname":"xxx","mail":"xxx",
  //  "roles":["e077guv-zzv-7xxx", ... ]} ,
  // DEBUG
  public importFile(file: string) {
    const config = JSON.parse(fs.readFileSync(file, "utf8"));
    config.user.forEach((u: any) => {
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
            this.log.info("saved " + u.uid);
          })
          .catch((err) => {
            this.log.error("error saving " + u.uid);
          });
      });
  }

  public findOne(uid: string): Promise<FarcUserDocument | null> {
    // empty result -> null (kein error)
    return this.db.farcUserModel.findOne({uid: uid.toUpperCase()}).exec();
  }

  public updateUser(user: FarcUserDocument, neu: FarcUser): Promise<any> {
    return this.db.farcUserModel.findByIdAndUpdate(user._id,
                                           { name: neu.name, vorname: neu.vorname,
                                             mail: neu.mail, roles: neu.roles},
                                           {new: true}).exec();
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

  public getOe(uid: string): Promise<FarcOeDocument | null> {
    return this.db.farcEndpunktModel.findOne({endpunkt: uid.toUpperCase()}).exec()
        .then((ep) => {
          if (ep) {
            return this.db.farcOeModel.findById(ep.oe).exec();
          } else {
            this.log.error("Kein Home-Verzeichnis fuer Benutzer " + uid);
            return null;
          }
        })
        .catch((err) => {
          this.log.error("Kein Home-Verzeichnis fuer Benutzer " + uid);
          return null;
        });
  }

  // DEBUG
  public testfile(file: string) {
    const uids: any[] = [];
    const config = JSON.parse(fs.readFileSync(file, "utf8"));
    config.user.forEach((u: any) => {
      uids.push(u.uid);
    });
    uids.pop();
    uids.pop();
    return uids;
  }

}
