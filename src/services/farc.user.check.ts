import {
  FarcOeDocument,
  FarcUserDocument,
} from "@hb42/lib-farc";
import {
  LoggerService,
  UserCheck,
} from "@hb42/lib-server";

import {
  FarcUserDAO,
} from "../model";
import {
  ServiceHandler,
} from "./backend";

export class FarcUserCheck implements UserCheck {

  private userDAO: FarcUserDAO;
  private admrole: string;

  private log = LoggerService.get("farc-server.services.FarcUserCheck");

  constructor(private services: ServiceHandler, private timeoutSec: number) {
    this.userDAO = new FarcUserDAO(services.db);
    this.admrole = services.config.adminrole;
  }

  /*
   check user/pwd
   returns canonical UID || null if error
   => jeder User, der in der DB gefunden wird, ist gueltig
   */
  public authUser(uid: string, pwd?: string): Promise<string | null> {
    const name = uid.split("\\")[1];
    const user = name ? name.toUpperCase() : uid.toUpperCase();
    this.log.info("authUser uid=" + uid);
    return this.userDAO.findOne(user)
        .then((usr: FarcUserDocument) => usr ? usr.uid : null)
        .catch((err) => {
          this.log.error("error fetching user " + err);
          return null;
        });
  }

  /*
   returns user data object
   */
  public getUser(userid: string): Promise<any> {
    return this.userDAO.findOne(userid)
        .then((usr: FarcUserDocument) => {
          return this.userDAO.getOe(usr.uid)
              .then((useroe: FarcOeDocument) => {
                const adm: boolean = -1 < usr.roles.findIndex((dn) => {
                  return dn.toLowerCase().includes(this.admrole.toLowerCase());
                });
                return { uid: usr.uid,
                         name: usr.name,
                         vorname: usr.vorname,
                         mail: usr.mail,
                         oe: useroe.name,
                         admin: adm,
                };
              });
        })
        .catch((err) => {
          this.log.error("error fetching user " + err);
          // im configMode bekommt jeder Adminrechte
          if (this.services.configMode) {
            return { uid: userid,
                     name: "admin",
                     vorname: "admin",
                     admin: true,
            };
          } else {
            return null;
          }
        });
  }

  public getJwtSecret(): string {
    return this.services.config.jwtSecret;
  }

  public getJwtTimeout(): number {
    return this.timeoutSec;
  }

}
