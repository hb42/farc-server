/**
 * Created by hb on 31.12.16.
 */

import * as fs from "fs";
import * as timers from "timers";

import {
  confROLES,
  FarcDriveDocument,
  FarcDriveTypes,
  FarcEndpunkt,
  FarcOeDocument,
  FarcRole,
  FarcUser,
  FarcUserDocument,
} from "@hb42/lib-farc";

import {
  DataEventEmitter,
} from ".";
import {
  FarcConfigDAO,
  FarcUserDAO,
} from "../../model";
import {
  ADService,
  FarcDB,
} from "../backend";

export class DataService {

  // zweite Ebene fuer INST-Endpunkte
  // TODO in config-DB auslagern
  private static instSubdir: string[] = ["VRZDaten", "SPKDaten"];

  // lokale Dateien fuer die AD-Daten fuer offline-Tests
  private static uname = "ad_users.json";
  private static ename = "ad_eps.json";
  private static rname = "ad_roles.json";

  // eingelesene Daten vom AD
  private adUsers: any;
  private adEps: any;
  private adRoles: any;
  private roles: FarcRole[];

  private dataDrive: FarcDriveDocument;
  private homeDrive: FarcDriveDocument;
  private instDrive: FarcDriveDocument;

  private userDAO: FarcUserDAO;
  private configDAO: FarcConfigDAO;
  private dataEventHandler: DataEventEmitter;

  constructor(private db: FarcDB, private spk: boolean) {
    this.dataEventHandler = new DataEventEmitter();
    this.initEventHandling();
    this.userDAO = new FarcUserDAO(db);
    this.configDAO = new FarcConfigDAO(db);
  }

  /**
   * Liefert den EventEmitter.
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
    // erstmal Laufwerke holen (async)
    this.getDrive(FarcDriveTypes.daten).then( (drv) => {
      this.dataDrive = drv;
    });
    this.getDrive(FarcDriveTypes.inst).then( (drv) => {
      this.instDrive = drv;
    });
    this.getDrive(FarcDriveTypes.home).then( (drv) => {
      this.homeDrive = drv;
    });
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
      timers.setTimeout( () => {  // Verzoegerung, um AD-Delay zu simulieren
        this.dataEventHandler.emit(this.dataEventHandler.evtReadAdUsers,
                                   JSON.parse(fs.readFileSync("../div/" + DataService.uname, "utf8")).data);
        this.dataEventHandler.emit(this.dataEventHandler.evtReadAdEps,
                                   JSON.parse(fs.readFileSync("../div/" + DataService.ename, "utf8")).data);
        this.dataEventHandler.emit(this.dataEventHandler.evtReadAdRoles,
                                   JSON.parse(fs.readFileSync("../div/" + DataService.rname, "utf8")).data);
      }, 1000);
    }

  }

  /**
   * Events abarbeiten
   */
  private initEventHandling() {

    this.dataEventHandler.on(this.dataEventHandler.evtReadAdUsers, (usr) => {
      console.info("LDAP users " + usr.length);
      this.saveAD(DataService.uname, usr);
      this.adUsers = usr;
      this.processADdata();
    });

    this.dataEventHandler.on(this.dataEventHandler.evtReadAdEps, (eps) => {
      this.saveAD(DataService.ename, eps);
      console.info("Endpunkte " + eps.length);
      this.adEps = eps;
      this.processADdata();
    });

    this.dataEventHandler.on(this.dataEventHandler.evtReadAdRoles, (roles) => {
      this.saveAD(DataService.rname, roles);
      console.info("Rollen " + roles.length);
      this.adRoles = roles;
      this.processADdata();
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

  /**
   * Eingelesene Daten weiterverarbeiten
   *
   * Erst sinnvoll, wenn alle drei Teile (User, EP, Rollen) geholt wurden
   */
  private processADdata() {
    let users: FarcUser[];
    console.info("processADData");
    let dataEP: any;
    if (this.adRoles && this.adUsers && this.adEps) {
      console.info("process for real");
      this.saveRoles(this.adRoles);
      this.adRoles = null;
      users = this.saveUsers(this.adUsers);
      this.adUsers = null;
      dataEP = this.adEps;
      this.adEps = null;

      this.saveEndpunkte(dataEP, users);
    }
  }

  /**
   * AD-Rollen in ConfigDB speichern
   * und fuer die weitere Verarbeitung in this.roles festhalten
   *
   * @param obj - Daten aus dem AD
   */
  private saveRoles(obj: any) {
    // dn + displayName sichern (displayName ist ohne e077ggx -> cn)
    const roles: FarcRole[] = [];

    obj.forEach( (r) => {
      roles.push({name: r.displayName, dn: r.dn});
    });
    this.roles = roles;
    this.configDAO.updateConfig(confROLES, roles);
  }

  /**
   * Endpunkte speichern
   *
   * @param dataEps
   * @param users
   */
  private saveEndpunkte(dataEps: any, users: FarcUser[]) {
    console.info("saveEPs");
    this.saveDataEps(dataEps);
    this.saveUserEps(users);
    this.saveInstEps();
  }

  /**
   * Endpunkte fuer DATEN mit Liste aus dem AD updaten
   */
  private saveDataEps(eps: any) {
    if (!this.dataDrive) {
      return;
    }
    console.info("saveDataEps: " + this.dataDrive.displayname);
    const eplist: FarcEndpunkt[] = this.makeEpList(eps, this.dataDrive);
    console.info("ep.length: " + eplist.length);
    this.saveEps(eplist, this.dataDrive);
  }

  /**
   * Endpunkte fuer HOME mit Liste der User aus dem AD updaten
   */
  private saveUserEps(users: FarcUser[]) {
    if (!this.homeDrive) {
      return;
    }
    console.info("saveUserEps: " + this.homeDrive.displayname);
    const eplist: FarcEndpunkt[] = this.makeEpList(users.map( (u) => u.uid ), this.homeDrive);
    this.setHomeOe(eplist, users);
    console.info("ep.length: " + eplist.length);
    this.saveEps(eplist, this.homeDrive);
  }

  /**
   * Endpunkte fuer INST mit den vorhandenen Verzeichnissen updaten
   */
  private saveInstEps() {
    if (!this.instDrive) {
      return;
    }
    console.info("saveInstEps: " + this.instDrive.displayname);
    const eps: string[] = this.getInstEps(this.instDrive);
    const eplist: FarcEndpunkt[] = this.makeEpList(eps, this.instDrive);
    console.info("ep.length: " + eplist.length);
    this.saveEps(eplist, this.instDrive);
  }

  /**
   * Laufwerksdaten fuer typ holen
   *
   * @param typ - data | inst | home
   * @returns {Promise<FarcDriveDocument>}
   */
  private getDrive(typ: FarcDriveTypes): Promise<FarcDriveDocument> {
    return this.db.farcDriveModel.findOne({type: typ}).exec();
  }

  /**
   * Liste der im FS vorhandenen Endpunkte aus einer Stringliste bauen
   *
   * @param eps - Stringliste (jew. Pfad ab drive)
   * @param drv - FarcDrive
   * @returns {FarcEndpunkt[]}
   */
  private makeEpList(eps: string[], drv: FarcDriveDocument): FarcEndpunkt[] {
    const eplist: FarcEndpunkt[] = [];
    eps.forEach( (ep: string) => {
      // node.filesystem versteht auch unter Windows Pfade mit slashes => backslash ist verzichtbar
      ep = ep.replace(/\\/g, "/");
      // nur EPs, die auch im filesystem existieren
      if (this.checkFS(ep, drv)) {
        const path = ep.split("/");
        const endpunkt: FarcEndpunkt = {
          endpunkt: path.pop(),
          above   : path.join("/"),
          drive   : drv._id,
          oe      : null,
        };
        eplist.push(endpunkt);
      }
    });
    return eplist;
  }

  /**
   * Check if EP-path exists on drive drv
   *
   * sourcepath only, no archive
   *
   * @param path - EP
   * @param drv - FarcDrive
   * @returns {boolean}
   */
  private checkFS(path: string, drv: FarcDriveDocument): boolean {
    if (drv.type === FarcDriveTypes.inst) {
      return true; // f. inst ist der Check redundant
    }
    return fs.existsSync(drv.sourcepath + "/" + path);
  }

  /**
   * EP-Liste fuer INST-Laufwerk
   *
   * Holt die Verzeichnisse der obersten Ebene, sowie die Verzeichnisse
   * unterhalb this.instSubdir[].
   *
   * @param drv
   * @returns {string[]}
   */
  private getInstEps(drv: FarcDriveDocument): string[] {
    let eplist: string[] = this.getDirList(drv.sourcepath);
    eplist = eplist.filter( (dirname) =>
      !DataService.instSubdir.find( (d) => d.toLowerCase() === dirname.toLowerCase() ) );
    DataService.instSubdir.forEach( (sub) => {
      let sublist = this.getDirList(drv.sourcepath + "/" + sub);
      sublist = sublist.map( (d) => sub + "/" + d );
      eplist = [...eplist, ...sublist];
    });
    return eplist;
  }

  /**
   * Alle Verzeichnisse unterhalb path als string[] holen
   *
   * @param path
   * @returns {string[]}
   */
  private getDirList(path: string): string[] {
    let list: string[];
    try {
      list = fs.readdirSync(path);
    } catch (e) {
      list = [];
    }
    return list.filter( (filename) => {
      const entry = path + "/" + filename;
      try {
        const stat = fs.lstatSync(entry);
        return stat.isDirectory();
      } catch (err) {
        console.error("error for stat(" + entry + ") " + err);
        return false;
      }
    });

  }

  /**
   * OE fuer Home-Dir anhand der Benutzer-Rollen setzen
   *
   * @param eplist - HOME-EPs
   * @param users - Benutzer
   */
  private setHomeOe(eplist: FarcEndpunkt[], users: FarcUser[]) {
    this.db.farcOeModel.find().exec().then( (oes) => {
      eplist.forEach((ep) => {
        const user: FarcUser = users.find((u) => u.uid.toLowerCase() === ep.endpunkt.toLowerCase());
        const oe: FarcOeDocument = oes.find((o) => {
          return -1 < o.roles.findIndex((or) => {
            return -1 < user.roles.findIndex((ur) => {
              return ur.toLowerCase() === or.dn.toLowerCase();
            });
          });
        });
        if (oe) {
          ep.oe = oe._id;
          console.info("set OE " + oe.name + " for user " + user.uid + " " + user.vorname + " " + user.name);
        }
      });
    });
  }

  private saveEps(eplist: FarcEndpunkt[], drv: FarcDriveDocument) {
    console.info("save EPs count=" + eplist.length + " for drive " + drv.displayname);
    this.db.farcEndpunktModel.find({drive: drv._id}).exec().then( (dbEps) => {
      console.info("EPs in DB: " + dbEps.length);
      const neweps: FarcEndpunkt[] = eplist.filter( (ep) => {
        const len = dbEps.length;
        dbEps = dbEps.filter( (dbep) => {
          if (ep.above.toLowerCase() === dbep.above.toLowerCase() &&
              ep.endpunkt.toLowerCase() === dbep.endpunkt.toLowerCase()) {
            if (drv.type === FarcDriveTypes.home) {
              // id auf einheitlichen Typ festlegen, sonst macht der Vergleich Aerger
              const newoe: string = ep.oe ? ep.oe.toString() : "";
              const oldoe: string = dbep.oe ? dbep.oe.toString() : "";
              if (newoe !== oldoe) {
                // update set oe
                console.info("ep.oe=" + newoe + " / DBep.oe=" + oldoe);
                this.db.farcEndpunktModel.findByIdAndUpdate(dbep._id,
                                                            {oe: ep.oe},
                                                            {new: true}).exec().then(() => {
                  console.info("update OE for user " + ep.endpunkt);
                });
              }
            }
            return false;
          } else {
            return true;
          }
        });
        return len === dbEps.length;
      });
      console.info("new EPs: " + neweps.length);
      console.info("delete EPs: " + dbEps.length);
      // save neweps
      this.db.farcEndpunktModel.create(neweps);
      // delete dbEps
      dbEps.forEach( (delEp) => {
        this.db.farcEndpunktModel.remove({_id: delEp._id}).exec();
      });
    });
  }

  /**
   * AD-User in der DB ablegen
   *
   * @param obj - AD-Abfrage
   * @returns {FarcUser[]}
   */
  private saveUsers(obj: any): FarcUser[] {
    const validusers = [];
    const users: FarcUser[] = [];
    obj.forEach( (u) => {
      const user: FarcUser = {
        uid    : u.cn,
        name   : u.sn,
        vorname: u.givenName,
        mail   : u.mail,
        roles  : u.memberOf ? [...u.memberOf] : [],  // sicherstellen, dass das immer ein Array ist
      };
      validusers.push(u.cn);
      users.push(user);
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
    return users;
  }

  /**
   * User in der DB speichern, bzw. ersetzen
   *
   * @param user
   */
  private saveUser(user: FarcUser) {
    // console.info("save user " + user.uid);
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

}
