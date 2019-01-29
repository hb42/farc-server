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

export class FarcUserDAO {

  private db: FarcDB;

  private log = LoggerService.get("farc-server.model.FarcUserDAO");

  constructor(private farcdb: FarcDB) {
    this.log.info("c'tor TestSession");
    this.db = farcdb;
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

}
