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
  FarcUserDAO,
} from "../model";
import {
  FarcDB,
} from "./";

export class FarcUserCheck implements UserCheck {

  private sessiondata: FarcUserDocument;
  private sessionDAO: FarcUserDAO;

  constructor(private db: FarcDB) {
    this.sessionDAO = new FarcUserDAO(db);
  }

  /*
   check user/pwd
   returns canonical UID || null if error
   */
  public authUser(uid: string, pwd?: string): Promise<string> {
    let user: string;
    let name = uid.split("\\")[1];
    if (name) {
      user = name.toUpperCase();
    } else {
      user = uid.toUpperCase();
    }
    return this.sessionDAO.findOne(user)
        .then( (u: FarcUserDocument) => {
          this.sessiondata = u;
          return u.uid;
        })
        .catch( err => {
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
  public setUserData(id: string, session: any): Promise<any> {
    return this.sessionDAO.updateSession(id, session);
  }

}
