/**
 * Created by hb on 21.08.16.
 */

import * as ldap from "ldapjs";

import {
  FarcDriveDocument,
  FarcUser,
  FarcUserDocument,
} from "@hb42/lib-farc";
import {
  ldapAdmin,
  ldapPwd,
} from "@hb42/lib-passwd";

import {
  FarcUserDAO,
} from "../model";
import {
  FarcDB,
} from "./";

/* nicht mehr im AD vorhandene User aus DB entfernen
 let start;
 usersession.find(null)
 .then( (res: FarcUserDocument[]) => {
 console.info("find " + res.length);
 let uids = [];
 res.forEach((u: FarcUserDocument) => {
 uids.push(u.uid);
 });
 uids.pop();
 uids.pop();
 console.info("query " + uids.length);
 return uids;
 })
 .then( ids => {
 start = Date.now();
 return usersession.find({ "uid" : { $nin: ids } });
 })
 .then( (delta: FarcUserDocument[]) => {
 console.dir(delta);
 console.info("delta " + delta.length + "  time: " + (Date.now() - start));
 })
 .catch( err => {
 console.info("ERROR " + err);
 });
 */

export class ADService {

  private client;
  private userDAO: FarcUserDAO;
  private ID;

  constructor(private db: FarcDB) {
    this.client = ldap.createClient({url: "ldap://v998dpve.v998.intern:389"});
    this.userDAO = new FarcUserDAO(db);
  }

  public updateUsers() {
    this.query(() => this.updateusers());
  }

  public updateEps(drvstd?: FarcDriveDocument, drvarc?: FarcDriveDocument) {
    // let paths: string[] =
    this.query((drives) => this.updateeps(drives), {std: drvstd, arc: drvarc});
    // TODO drive holen, bzw. uebergeben, damit entry obj bauen und speichern
    // console.info("Endpunkte:");
    // paths.forEach( p => console.info(p));
  }

  private query(callback, payload?) {
    this.client.bind(ldapAdmin, ldapPwd,
                     (err) => {
          if (err) {
            console.info("error binding " + err);
          } else {
            callback(payload);
          }
        });
  }

  private updateusers() {

    let opts = {
      filter: "(&(objectCategory=person)(objectClass=user))",
      scope: "sub",
      paging: true,
//  sizeLimit: 2000,
      attributes: [ "cn", "sn", "givenName", "displayName", "mail", "distinguishedName"],
    };
    let opts2 = { filter: "(&(member:1.2.840.113556.1.4.1941:=%s))",
      scope: "sub",
      paging: true,
//              sizeLimit: 200,
      attributes: ["cn", "displayName", "distinguishedName", "description"]};

    let users = [];

    this.client
        .search("OU=E077,OU=Kunden,dc=v998dpve,dc=v998,dc=intern",
                opts,
                (err, res) => {
                  if (err) {
                    console.info("ERROR: " + err);
                  } else {
                    res.on("page", (resp) => {
                      console.info("page");
                    });
                    res.on("searchEntry", (entry) => {
                      // console.log(entry.object.cn);
                      /*
                       entry: {"messageID":2,"protocolOp":"SearchEntry","objectName":"CN=S077X033,OU=Benutzer,
                       OU=Konten,OU=E077,OU=Kunden,DC=v998dpve,DC=v998,DC=intern","attributes":[{"type":"cn",
                       "vals":["S077X033"]},{"type":"sn","vals":["Ficht"]},{"type":"givenName","vals":
                       ["Hermann"]},{"type":"distinguishedName","vals":["CN=S077X033,OU=Benutzer,OU=Konten,
                       OU=E077,OU=Kunden,DC=v998dpve,DC=v998,DC=intern"]},{"type":"displayName","vals":
                       ["Ficht Hermann"]},{"type":"mail","vals":["benutzerservice@sparkasse-co-lif.de"]}],
                       "controls":[]}
                       */
                      users.push(entry.object);
                    });
                    res.on("searchReference", (referral) => {
                      console.info("referral: " + referral.uris.join());
                    });
                    res.on("error", (e) => {
                      console.error("error: " + e.message);
                    });
                    res.on("end", (result) => {
                      let usrcnt = users.length;
                      let cnt = 0;
                      users.forEach((u) => {
                        cnt++;
                        u.roles = [];
                        opts2.filter = "(&(member:1.2.840.113556.1.4.1941:=" + u.dn + "))";
                        this.client
                            .search("OU=E077,OU=Kunden,dc=v998dpve,dc=v998,dc=intern",
                                    opts2,
                                    (error, roles) => {
                                      if (error) {
                                        console.info("ERROR2: " + error);
                                      } else {
                                        roles.on("searchEntry", (entry) => {
                                          u.roles.push(entry.object);
                                        });
                                        roles.on("end", (r) => {
                                          let user: FarcUser = {
                                            uid: u.cn,
                                            name: u.sn,
                                            vorname: u.givenName,
                                            mail: u.mail,
                                            roles: [],
                                            session: null,
                                          };
                                          u.roles.forEach((role) => {
                                            user.roles.push(role.cn.toLowerCase());
                                          });
                                          this.saveUser(user);
                                          // TODO nicht mehr existente User loeschen
                                          if (cnt === usrcnt) {
                                            this.client.unbind( (ube) => {
                                              if (ube) {
                                                console.error("error unbinding " + ube);
                                              }
                                            });
                                          }
                                          // console.info(JSON.stringify(user), ",");
                                        });
                                      }
                                    });
                      });
                    });

                  }
                });

  }

  private updateeps(drvs: any) {

    this.ID = 0;
    let opts = {
      filter: "(&(objectCategory=group)(objectClass=group))",
      scope: "sub",
      paging: true,
//  sizeLimit: 2000,
      attributes: [ "cn", "displayName", "distinguishedName", "description" ],
    };
    let pattern = /^.nd_V998DPVE(\\E077\\Daten)?\\{1,2}/i;

    this.client
        .search("OU=Dateisystemzugriff,OU=Gruppen,OU=E077,OU=Kunden,dc=v998dpve,dc=v998,dc=intern",
                opts,
                (err, res) => {
                  if (err) {
                    console.info("ERROR: " + err);
                  } else {
                    res.on("page", (resp) => {
                      console.info("page");
                    });
                    res.on("searchEntry", (entry) => {
                      let path = entry.object.displayName;
                      if (path.match(pattern)) {
                        let ep = path.replace(pattern, "").replace(/\\/g, "/").toLowerCase();
                        // eps.push(ep);  // kann raus
                        this.saveEP(ep, entry.object.cn, drvs);
                      }
                    });
                    res.on("searchReference", (referral) => {
                      console.info("referral: " + referral.uris.join());
                    });
                    res.on("error", (e) => {
                      console.error("error: " + e.message);
                    });
                    res.on("end", (result) => {
                      this.client.unbind((ube) => {
                        if (ube) {
                          console.error("error unbinding " + ube);
                        }
                      });
                      console.info("end ldap search");
                    });
                  }
                });
  }

  private saveUser(user: FarcUser) {
    console.info("save user " + user.uid);
    this.userDAO.findOne(user.uid)
        .then( (u: FarcUserDocument) => {
          if (u) {
            this.userDAO.updateUser(u, user)
                .catch((e) => {
                  console.error("error updating user " + user.uid + " " + e);
                });
          } else {
            this.userDAO.create([user])
                .catch((e2) => {
                  console.error("error creating user " + user.uid + " " + e2);
                });
          }
        })
        .catch( (err) => {
          console.error("error searching user " + user.uid);
        });
  }

  private saveEP(path: string, role: string, drives: any) {
    let p = path.split(/\//);
    let ep = p.pop();
    // console.info("       " + ep + " above.len = " + p.length);
    new this.db.farcEndpunktModel({
      endpunkt: ep,
      above: p,
      size: 0,
      drive: drives.std.id,
      arc: drives.std.arc,
      epid: role,
      key: this.ID++,
    }).save().then( (entry) => {
      console.info("saveEP id=" + entry.key + " " + role + " = " + path);
    });
    new this.db.farcEndpunktModel({
      endpunkt: ep,
      above: p,
      size: 0,
      drive: drives.arc.id,
      arc: drives.arc.arc,
      epid: role,
      key: this.ID++,
    }).save().then( (entry) => {
      console.info("saveEP id=" + entry.key + " " + role + " = " + path);
    });

  }

}
