/**
 * Created by hb on 07.08.16.
 */

import {
  FarcUserDocument,
} from "@hb42/lib-farc";
import {
  UserCheck,
} from "@hb42/lib-server";

import {
  FarcConfigDAO,
  FarcUserDAO,
} from "../model";
import {
  FarcDB,
} from "./backend";

export class FarcUserCheck implements UserCheck {

  private sessionuser: FarcUserDocument;
  private sessiondata: any = null;

  private sessionDAO: FarcUserDAO;
  private configDao: FarcConfigDAO;

  private confName: string = "FARC_";

  constructor(private db: FarcDB) {
    this.sessionDAO = new FarcUserDAO(db);
    this.configDao = new FarcConfigDAO(db);
  }

  /*
   check user/pwd
   returns canonical UID || null if error
   */
  public authUser(uid: string, pwd?: string): Promise<string> {
    let user: string;
    const name = uid.split("\\")[1];
    if (name) {
      user = name.toUpperCase();
    } else {
      user = uid.toUpperCase();
    }
    return this.sessionDAO.findOne(user)
        .then( (u: FarcUserDocument) => {
          this.sessionuser = u;
          this.confName += u.uid.toUpperCase();
          this.configDao.findConfig(this.confName)
              .then( (conf) => {
                this.sessiondata = conf;
              })
          return u.uid;
        })
        .catch( (err) => {
          console.error("error fetching user " + err);
          return null;
        });
  }

  /*
   returns user data object
   */
  public getUserData(): any {
    return this.sessiondata;
  }

  // public setUserData(data: FarcUserDocument): Promise<any> {
  public setUserData(session: any): Promise<any> {
    this.sessiondata = session;
    return this.configDao.updateConfig(this.confName, this.sessiondata);
  }

}
