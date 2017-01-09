/**
 * Created by hb on 31.12.16.
 */

import * as fs from "fs";

import {
  FarcDriveDocument,
  FarcUser,
  FarcUserDocument,
} from "@hb42/lib-farc";

import {
  ADService,
  DataEventEmitter,
  FarcDB,
} from ".";
import {
  FarcUserDAO,
} from "../model";

export class DataService {

  private uname = "ad_users.json";
  private ename = "ad_eps.json";
  private rname = "ad_roles.json";

  private userDAO: FarcUserDAO;
  private dataEventHandler: DataEventEmitter;

  constructor(private db: FarcDB, private spk: boolean) {
    this.dataEventHandler = new DataEventEmitter();
    this.initEventHandling();
    this.userDAO = new FarcUserDAO(db);
  }

  /**
   * Liefet den EventEmitter.
   *
   * @returns {DataEventEmitter}
   */
  public getEvent(): DataEventEmitter {
    return this.dataEventHandler;
  }

  /**
   * Rollen, User, EPs aus dem AD holen und in der DB ablegen.
   *
   */
  public readData() {
    if (this.spk) {
      const AD: ADService = new ADService(this.dataEventHandler);
      // Auf AD-Connect warten
      // Ergebnisse landen im EventHandler s. u.
      this.dataEventHandler.on(this.dataEventHandler.evtADready, () => {
        AD.readUsers();
        AD.readEps();
        AD.readRoles();
      });
    } else {  /* fuer Tests ohne AD, Daten aus .json-files holen */
      this.dataEventHandler.emit(this.dataEventHandler.evtReadAdUsers,
                                 JSON.parse(fs.readFileSync("../div/" + this.uname, "utf8")).data);
      this.dataEventHandler.emit(this.dataEventHandler.evtReadAdEps,
                                 JSON.parse(fs.readFileSync("../div/" + this.ename, "utf8")).data);
      this.dataEventHandler.emit(this.dataEventHandler.evtReadAdRoles,
                                 JSON.parse(fs.readFileSync("../div/" + this.rname, "utf8")).data);
    }

  }

  /**
   * Events abarbeiten
   */
  private initEventHandling() {

    this.dataEventHandler.on(this.dataEventHandler.evtReadAdUsers, (usr) => {
      console.info("LDAP users " + usr.length);
      this.saveAD(this.uname, usr);
      this.saveUsers(usr);
    });

    this.dataEventHandler.on(this.dataEventHandler.evtReadAdEps, (eps) => {
      this.saveAD(this.ename, eps);
      console.info("Endpunkte " + eps.length);
      this.saveEps(eps);
    });

    this.dataEventHandler.on(this.dataEventHandler.evtReadAdRoles, (roles) => {
      this.saveAD(this.rname, roles);
      console.info("Rollen " + roles.length);
      this.saveRoles(roles);
    });

  }

  /**
   * Aus dem AD gelesene Daten in einer .json-Datei ablegen.
   *
   * @param fname - Dateiname ohne Pfad
   * @param dat   - zu schreibendes Object
   */
  private saveAD(fname: string, dat: any) {
    if (this.spk) {
      const exp = {data: dat};
      fs.writeFile(fname, JSON.stringify(exp, null, 2));
    }

  }

  private saveUsers(obj: any) {
    const validusers = [];
    obj.forEach( (u) => {
      const user: FarcUser = {
        uid    : u.cn,
        name   : u.sn,
        vorname: u.givenName,
        mail   : u.mail,
        roles  : u.memberOf,
        session: null,
      };
      validusers.push(u.cn);
      this.saveUser(user);
    });

    // User, die nicht in der AD-Abfrage sind, aus der DB entfernen
    this.userDAO.find({ uid : { $nin: validusers } })
        .then( (result: FarcUserDocument[]) => {
          if (result) {
            result.forEach( (usr: FarcUserDocument) => {
              console.info("delete invalid user " + usr.name);
              this.userDAO.delete(usr)
                  .catch( (e) => {
                    console.error("error deleting user " + usr.uid + " " + e);
                  });
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

  private saveEps(obj: any) {
    /*
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

     }
     */

  }

  private saveRoles(obj: any) {
    //
  }

}
