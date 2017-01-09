/**
 * Created by hb on 21.08.16.
 */

import * as ldap from "ldapjs";

import {
  ldapAdmin,
  ldapPwd,
} from "@hb42/lib-passwd";

import {
  DataEventEmitter,
} from "./";

export class ADService {

  private client;
  private ID;

  constructor(private event: DataEventEmitter) {
    this.client = ldap.createClient({url: "ldap://v998dpve.v998.intern:389"});
    this.client.bind(ldapAdmin, ldapPwd,
                     (err) => {
                       if (err) {
                         console.info("error binding " + err);
                       } else {
                         event.emit(event.evtADready);
                       }
                     });
  }

  public readUsers() {
    this.queryUserCallback(this.event);
    // this.query((evt) => this.queryUserCallback(evt));
  }

  //
  public readEps() {
    this.updateeps(this.event);
    // this.query((evt, drives) => this.updateeps(evt, drives), {std: drvstd, arc: drvarc});
  }

  public readRoles() {
    this.updateroles(this.event);
    // this.query((evt) => this.updateroles(evt));
  }

  // statt bind() im c'tor
  private query(callback, payload?) {
    this.client.bind(ldapAdmin, ldapPwd,
                     (err) => {
                       if (err) {
                         console.info("error binding " + err);
                       } else {
                         callback(this.event, payload);
                       }
                     });
  }

  private queryUserCallback(evt: DataEventEmitter) {

    console.info("queryUserCallback");
    const opts = {
      filter    : "(&(objectCategory=person)(objectClass=user))",
      scope     : "sub",
      paging    : true,
//  sizeLimit: 2000,
      attributes: ["cn", "sn", "givenName", "displayName", "mail", "distinguishedName", "memberOf"],
    };

    const users = [];

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
                      users.push(entry.object);
                    });
                    res.on("searchReference", (referral) => {
                      console.info("referral: " + referral.uris.join());
                    });
                    res.on("error", (e) => {
                      console.error("error getting users: " + e.message);
                    });
                    res.on("end", (result) => {
                      console.info("queryUserCallback on.end");
                      evt.emit(evt.evtReadAdUsers, users);
                      // this.client.unbind((uberr) => {
                      //   if (uberr) {
                      //     console.error("error unbinding " + uberr);
                      //   }
                      // });
                    });
                  }
                });
  }

  // User mit allen Rollen -> erforderlich?
  // TODO trennen in ldap + db ins
  private updateusers() {

    const opts = {
      filter: "(&(objectCategory=person)(objectClass=user))",
      scope: "sub",
      paging: true,
//  sizeLimit: 2000,
      attributes: [ "cn", "sn", "givenName", "displayName", "mail", "distinguishedName", "memberOf"],
    };
    const opts2 = { filter: "(&(member:1.2.840.113556.1.4.1941:=%s))",
      scope: "sub",
      paging: true,
//              sizeLimit: 200,
      attributes: ["cn", "displayName", "distinguishedName", "description"]};

    const users = [];

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
                      // DEBUG
                      // let exp = {u: users};
                      // this.fs.writeFile("ad_users.json", JSON.stringify(exp, null, 2));
                      /*
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
                       */
                    });
                  }
                });

  }

  private updateeps(evt: DataEventEmitter) {

    this.ID = 0;
    const opts = {
      filter: "(&(objectCategory=group)(objectClass=group))",
      scope: "sub",
      paging: true,
//  sizeLimit: 2000,
      attributes: [ "cn", "displayName", "distinguishedName", "description" ],
    };
    const pattern = /^.nd_V998DPVE(\\E077\\Daten)?\\{1,2}/i;

    const eps = [];
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
                      const path = entry.object.displayName;
                      if (path.match(pattern)) {
                        const ep = path.replace(pattern, "").replace(/\\/g, "/").toLowerCase();
                        eps.push(ep);
                      }
                    });
                    res.on("searchReference", (referral) => {
                      console.info("referral: " + referral.uris.join());
                    });
                    res.on("error", (e) => {
                      console.error("error getting EPs: " + e.message);
                    });
                    res.on("end", (result) => {
                      evt.emit(evt.evtReadAdEps, eps);
                      console.info("end ldap user search");
                      // this.client.unbind((uberr) => {
                      //   if (uberr) {
                      //     console.error("error unbinding " + uberr);
                      //   }
                      // });

                    });
                  }
                });
  }

  private updateroles(evt: DataEventEmitter) {

    this.ID = 0;
    const opts = {
      filter: "(&(objectCategory=group)(objectClass=group))",
      scope: "sub",
      paging: true,
//  sizeLimit: 2000,
      attributes: [ "cn", "displayName", "distinguishedName", "description" ],
    };

    const roles = [];
    this.client
        .search("OU=AnwenderRollen,OU=Gruppen,OU=E077,OU=Kunden,dc=v998dpve,dc=v998,dc=intern",
                opts,
                (err, res) => {
                  if (err) {
                    console.info("ERROR: " + err);
                  } else {
                    res.on("page", (resp) => {
                      console.info("page");
                    });
                    res.on("searchEntry", (entry) => {
                      roles.push(entry.object);
                    });
                    res.on("searchReference", (referral) => {
                      console.info("referral: " + referral.uris.join());
                    });
                    res.on("error", (e) => {
                      console.error("error getting roles: " + e.message);
                    });
                    res.on("end", (result) => {
                      evt.emit(evt.evtReadAdRoles, roles);
                      console.info("end ldap role search");
                      // this.client.unbind((uberr) => {
                      //   if (uberr) {
                      //     console.error("error unbinding " + uberr);
                      //   }
                      // });
                    });
                  }
                });
  }

}
