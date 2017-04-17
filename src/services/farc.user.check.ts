/**
 * Created by hb on 07.08.16.
 */

import {
  FarcUserDAO,
} from "../model";
import {
  FarcOeDocument,
  FarcUserDocument,
  UserCheck,
} from "../shared/ext";
import {
  FarcDB,
} from "./backend";

export class FarcUserCheck implements UserCheck {

  private userDAO: FarcUserDAO;

  constructor(private db: FarcDB, private admrole: string) {
    this.userDAO = new FarcUserDAO(db);
  }

  /*
   check user/pwd
   returns canonical UID || null if error
   => jeder User, der in der DB gefunden wird, ist gueltig
   */
  public authUser(uid: string, pwd?: string): Promise<string> {
    let user: string;
    const name = uid.split("\\")[1];
    if (name) {
      user = name.toUpperCase();
    } else {
      user = uid.toUpperCase();
    }
    return this.userDAO.findOne(user)
        .then( (usr: FarcUserDocument) => usr ? usr.uid : null );
  }

  /*
   returns user data object
   */
  public getUser(uid: string): Promise<any> {
    return this.userDAO.findOne(uid)
        .then( (usr: FarcUserDocument) => {
          return this.userDAO.getOe(usr.uid)
              .then( (useroe: FarcOeDocument) => {
                const adm: boolean = -1 < usr.roles.findIndex( (dn) => {
                      return dn.toLowerCase().includes(this.admrole.toLowerCase());
                    });
                return {u: usr, oe: useroe, admin: adm};
              });
        })
        .catch( (err) => {
          console.error("error fetching user " + err);
          return null;
        });
  }

}
