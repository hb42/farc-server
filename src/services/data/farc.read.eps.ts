/**
 * Created by hb on 04.03.17.
 */

import * as fs from "fs";
import * as timers from "timers";

import {
  DataEventEmitter,
} from ".";
import {
  FarcConfigDAO,
  FarcUserDAO,
} from "../../model";
import {
  confROLES,
  FarcDriveDocument,
  FarcDriveTypes,
  FarcEndpunkt,
  FarcOeDocument,
  FarcRole,
  FarcUser,
  FarcUserDocument,
  LoggerService,
} from "../../shared/ext";
import {
  ADService,
  FarcDB,
} from "../backend";

export class FarcReadEps {
  // zweite Ebene fuer INST-Endpunkte
  // TODO in config-DB auslagern
  private static instSubdir: string[] = ["VRZDaten", "SPKDaten"];

  // TODO Hilfsroutine zum Umbenennen der EP-Pfade in archive auf Gross- Kleinschreibung analog source

  // lokale Dateien fuer die AD-Daten fuer offline-Tests
  private static uname = "ad_users.json";
  private static ename = "ad_eps.json";
  private static rname = "ad_roles.json";

  private static evtProcess = "processADdata";

  private log = LoggerService.get("fac-server.services.data.FarcReadEps");
  private eplog = LoggerService.get("Endpunkte");

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
  private AD: ADService;

  constructor(private eventHandler: DataEventEmitter, private db: FarcDB,  private spk: boolean) {
    this.userDAO = new FarcUserDAO(db);
    this.configDAO = new FarcConfigDAO(db);
  }

  /**
   * Einlesen der Endpunkte starten
   */
  public readEps() {
    this.adUsers = null;
    this.adRoles = null;
    this.adEps = null;
    this.roles = null;
    this.dataDrive = null;
    this.homeDrive = null;
    this.instDrive = null;
    this.AD = null;
    this.initEventHandling();

    this.getDrives();
  }

  /**
   * Event-Listener definieren
   */
  private initEventHandling() {
        // AD-Zugriff initialisiert
    if (this.eventHandler.listenerCount(this.eventHandler.evtADready) > 0) {
      this.eventHandler.removeAllListeners(this.eventHandler.evtADready);
    }
    this.eventHandler.on(this.eventHandler.evtADready, () => {
      this.AD.readUsers();
      this.AD.readEps();
      this.AD.readRoles();
    });
        // User aus AD
    if (this.eventHandler.listenerCount(this.eventHandler.evtReadAdUsers) > 0) {
      this.eventHandler.removeAllListeners(this.eventHandler.evtReadAdUsers);
    }
    this.eventHandler.on(this.eventHandler.evtReadAdUsers, (usr) => {
      this.log.debug("LDAP users " + usr.length);
      this.saveAD(FarcReadEps.uname, usr);
      this.adUsers = usr;
      this.eventHandler.emit(FarcReadEps.evtProcess);
    });

        // EPs fuer data-share aus AD
    if (this.eventHandler.listenerCount(this.eventHandler.evtReadAdEps) > 0) {
      this.eventHandler.removeAllListeners(this.eventHandler.evtReadAdEps);
    }
    this.eventHandler.on(this.eventHandler.evtReadAdEps, (eps) => {
      this.log.debug("Endpunkte " + eps.length);
      this.saveAD(FarcReadEps.ename, eps);
      this.adEps = eps;
      this.eventHandler.emit(FarcReadEps.evtProcess);
    });
        // Rollen aus AD
    if (this.eventHandler.listenerCount(this.eventHandler.evtReadAdRoles) > 0) {
      this.eventHandler.removeAllListeners(this.eventHandler.evtReadAdRoles);
    }
    this.eventHandler.on(this.eventHandler.evtReadAdRoles, (roles) => {
      this.log.debug("Rollen " + roles.length);
      this.saveAD(FarcReadEps.rname, roles);
      this.adRoles = roles;
      this.eventHandler.emit(FarcReadEps.evtProcess);
    });
        // Eingelesene Daten verarbeiten (
    if (this.eventHandler.listenerCount(FarcReadEps.evtProcess) > 0) {
      this.eventHandler.removeAllListeners(FarcReadEps.evtProcess);
    }
    this.eventHandler.on(FarcReadEps.evtProcess, () => {
      this.log.debug("processADData");
      // sind alle drei Lesevorgaenge erledigt?
      if (this.adRoles && this.adUsers && this.adEps) {
        this.processADdata();
      }
    });
  }

  /**
   * alle drei Laufwerke holen und im Anschluss die EPs einlesen
   */
  private getDrives() {
    this.db.farcDriveModel.find().exec()
        .then( (drvs: FarcDriveDocument[]) => {
          drvs.forEach( (drv) => {
            switch (drv.type) {
              case FarcDriveTypes.daten :
                this.dataDrive = drv;
                break;
              case FarcDriveTypes.home  :
                this.homeDrive = drv;
                break;
              case FarcDriveTypes.inst  :
                this.instDrive = drv;
                break;
              default                   :
                this.log.error("Datensatz mit unbekanntem Laufwerkstyp gefunden");
                this.log.error(drv.type);
                break;
            }
          });
          this.readEndpunkte();
        })
        .catch( (err) => {
          this.log.error("error reading drives " + err);
          this.dataDrive = null;
          this.instDrive = null;
          this.homeDrive = null;
        });
  }

  /**
   * Endpunkte, User und Rollen aus dem AD holen
   */
  private readEndpunkte() {
    if (this.spk) {
      this.AD = new ADService(this.eventHandler); // triggert evtADready
    } else {  /* fuer Tests ohne AD, Daten aus .json-files holen */
      timers.setTimeout( () => {  // Verzoegerung, um AD-Delay zu simulieren
        this.eventHandler.emit(this.eventHandler.evtReadAdUsers,
                                   JSON.parse(fs.readFileSync("../div/" + FarcReadEps.uname, "utf8")).data);
        this.eventHandler.emit(this.eventHandler.evtReadAdEps,
                                   JSON.parse(fs.readFileSync("../div/" + FarcReadEps.ename, "utf8")).data);
        this.eventHandler.emit(this.eventHandler.evtReadAdRoles,
                                   JSON.parse(fs.readFileSync("../div/" + FarcReadEps.rname, "utf8")).data);
      }, 1000);
    }

  }

  /**
   * Eingelesene Daten weiterverarbeiten
   *
   * Erst sinnvoll, wenn alle drei Teile (User, EP, Rollen) geholt wurden
   */
  private processADdata() {
    let users: FarcUser[];
    let dataEP: any;
    this.saveRoles(this.adRoles);
    this.adRoles = null;
    users = this.saveUsers(this.adUsers);
    this.adUsers = null;
    dataEP = this.adEps;
    this.adEps = null;

    this.saveEndpunkte(dataEP, users);
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
    this.configDAO.updateConfig(confROLES, roles); // TODO error handling
  }

  /**
   * Endpunkte speichern
   *
   * @param dataEps
   * @param users
   */
  private saveEndpunkte(dataEps: any, users: FarcUser[]) {
    const saves: Array<Promise<boolean>> = [];
    this.log.debug("saveEPs");
    saves.push(this.saveDataEps(dataEps));
    saves.push(this.saveUserEps(users));
    saves.push(this.saveInstEps());

    Promise.all(saves).then( (sav: boolean[]) => {
      const result: boolean = sav.reduce( (a, b) => a && b);
      if (result) {
        this.log.debug("saveEndpunkte ended OK");
        this.eplog.info("EPs erfolgreich gespeichert");
        this.eventHandler.emit(this.eventHandler.evtReadDataReady);
      } else {
        this.log.error("saveEndpunkte ended NOT OK");
        this.eplog.error("Fehler beim Speichern der EPs in saveEndpunkte()");
      }
    });
  }

  /**
   * Endpunkte fuer DATEN mit Liste aus dem AD updaten
   */
  private saveDataEps(eps: any): Promise<boolean> {
    if (!this.dataDrive) {
      this.eplog.error("Kein Laufwerk 'data'");
      return;
    }
    this.log.debug("saveDataEps: " + this.dataDrive.displayname);
    const eplist: FarcEndpunkt[] = this.makeEpList(eps, this.dataDrive);
    this.log.debug("ep.length: " + eplist.length);
    return this.saveEps(eplist, this.dataDrive);
  }

  /**
   * Endpunkte fuer HOME mit Liste der User aus dem AD updaten
   */
  private saveUserEps(users: FarcUser[]): Promise<boolean> {
    if (!this.homeDrive) {
      this.eplog.error("Kein Laufwerk 'home'");
      return;
    }
    this.log.debug("saveUserEps: " + this.homeDrive.displayname);
    const eplist: FarcEndpunkt[] = this.makeEpList(users.map( (u) => u.uid ), this.homeDrive);
    return this.setHomeOe(eplist, users).then( (res: boolean) => {
      if (res) {
        this.log.debug("ep.length: " + eplist.length);
        return this.saveEps(eplist, this.homeDrive);
      } else {
        return false;
      }
    });
  }

  /**
   * Endpunkte fuer INST mit den vorhandenen Verzeichnissen updaten
   */
  private saveInstEps(): Promise<boolean> {
    if (!this.instDrive) {
      this.eplog.error("Kein Laufwerk 'inst'");
      return;
    }
    this.log.debug("saveInstEps: " + this.instDrive.displayname);
    const eps: string[] = this.getInstEps(this.instDrive);
    const eplist: FarcEndpunkt[] = this.makeEpList(eps, this.instDrive);
    this.log.debug("ep.length: " + eplist.length);
    return this.saveEps(eplist, this.instDrive);
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
      // nur EPs, die auch im filesystem (source) existieren
      if (this.checkFS(ep, drv)) {
        const path = ep.split("/");
        const endpunkt: FarcEndpunkt = {
          endpunkt: path.pop(), // .toLowerCase(), // immer lowercase bis EP
          above   : path.join("/"), // .toLowerCase(),
          drive   : drv._id,
          oe      : null,
        };
        eplist.push(endpunkt);
      } else {
        this.eplog.error("Endpunkt nicht im Dateisystem vorhanden: [" + drv.displayname + "] " + ep);
      }
    });
    return eplist;
  }

  /**
   * Check if EP-path exists on drive drv
   *
   * Wenn sourcepath existiert wird archivepath angelegt.
   *
   * @param path - EP
   * @param drv - FarcDrive
   * @returns {boolean}
   */
  private checkFS(path: string, drv: FarcDriveDocument): boolean {
    let rc: boolean = false;
    if (drv.type === FarcDriveTypes.inst) {
      rc = true; // f. inst ist der Check redundant
    }
    rc = fs.existsSync(drv.sourcepath + "/" + path);
    // TODO erst scharfschalten, wenn das Programm in Produktion geht
    // if (rc) {
    //   // if archive EP in lowercase rename to source path
    //   path.split("/").reduce((p, folder) => {
    //     if (folder !== folder.toLowerCase() && fs.existsSync(drv.archivepath + "/" + p + folder.toLowerCase())) {
    //       fs.renameSync(drv.archivepath + "/" + p + folder.toLowerCase(),
    //                     drv.archivepath + "/" + p + folder);
    //     }
    //     return p + folder + "/";
    //   }, "");
    //   // create archive EP if not exist
    //   path.split("/").reduce((p, folder) => {
    //     p += "/" + folder;
    //     if (!fs.existsSync(drv.archivepath + p)) {
    //       fs.mkdirSync(drv.archivepath + p);
    //     }
    //     return p;
    //   }, "");
    // }
    return rc;
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
                                !FarcReadEps.instSubdir.find( (d) => d.toLowerCase() === dirname.toLowerCase() ) );
    FarcReadEps.instSubdir.forEach( (sub) => {
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
      list = fs.readdirSync(path);  // TODO was ist mit dirs, fuer die keine Berechtigung besteht (bes. inst)?
    } catch (e) {
      list = [];
    }
    return list.filter( (filename) => {
      const entry = path + "/" + filename;
      try {
        const stat = fs.lstatSync(entry);
        return stat.isDirectory();
      } catch (err) {
        this.log.error("error for stat(" + entry + ") " + err);
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
  private setHomeOe(eplist: FarcEndpunkt[], users: FarcUser[]): Promise<boolean> {
    return this.db.farcOeModel.find().exec()
        .then( (oes) => {
          eplist.forEach((ep) => {
            const user: FarcUser = users.find((u) => u.uid.toLowerCase() === ep.endpunkt.toLowerCase());
            if (user) {
              const oe: FarcOeDocument = oes.find((o) => {
                return -1 < o.roles.findIndex((or) => {
                      return -1 < user.roles.findIndex((ur) => {
                            return ur.toLowerCase() === or.dn.toLowerCase();
                          });
                    });
              });
              if (oe) {
                ep.oe = oe._id;
                this.log.debug("set OE " + oe.name + " for user " + user.uid + " " + user.vorname + " " + user.name);
              }
            } else {
              this.eplog.info("Kein User fuer EP " + ep.endpunkt);
            }
          });
          return true;
        })
        .catch ( (err) => {
          this.log.error("error reading OEs " + err);
          return false;
        });
  }

  /**
   * Endpunkte aus eplist in DB speichern, sofern neu. Fuer HOME-EPs OE updaten.
   * Nicht in eplist vorhandene Datensaetze werden geloescht.
   *
   * TODO event wenn alles in DB geschrieben?
   *
   * @param eplist
   * @param drv
   */
  private saveEps(eplist: FarcEndpunkt[], drv: FarcDriveDocument): Promise<boolean> {
    this.log.debug("save EPs count=" + eplist.length + " for drive " + drv.displayname);
    return this.db.farcEndpunktModel.find({drive: drv._id}).exec().then( (dbEps) => {
      this.log.debug("EPs in DB: " + dbEps.length);
      const neweps: FarcEndpunkt[] = eplist.filter( (ep) => {
        const len = dbEps.length;
        dbEps = dbEps.filter( (dbep) => {
          if (ep.above.toLowerCase() === dbep.above.toLowerCase() &&
              ep.endpunkt.toLowerCase() === dbep.endpunkt.toLowerCase()) {
            if (drv.type === FarcDriveTypes.home) {
              // oe-id auf einheitlichen Typ festlegen, sonst macht der Vergleich Aerger
              const newoe: string = ep.oe ? ep.oe.toString() : "";
              const oldoe: string = dbep.oe ? dbep.oe.toString() : "";
              if (newoe !== oldoe) {
                // update set oe
                this.log.debug("ep.oe=" + newoe + " / DBep.oe=" + oldoe);
                this.db.farcEndpunktModel.findByIdAndUpdate(dbep._id,
                                                            {oe: ep.oe},
                                                            {new: true}).exec().then(() => {
                  this.log.debug("update OE for user " + ep.endpunkt);
                });  // TODO error handling
              }
            }
            return false;
          } else {
            return true;
          }
        });
        return len === dbEps.length;
      });
      this.log.debug("new EPs: " + neweps.length);
      this.log.debug("delete EPs: " + dbEps.length);
      // save neweps
      return this.db.farcEndpunktModel.create(neweps).then( (res) => {
        if (neweps) {
          this.eplog.info("== Neue Endpunkte auf " + drv.displayname);
          neweps.forEach((nep) => this.eplog.info("  " + nep.above + "/" + nep.endpunkt));
        }
        // delete dbEps
        if (dbEps) {
          this.eplog.info("== Nicht mehr vorhandene Endpunkte auf " + drv.displayname);
          dbEps.forEach((dep) => this.eplog.info("  " + dep.above + "/" + dep.endpunkt));
        }
        const dels: Array<Promise<any>> = [];
        dbEps.forEach( (delEp) => {
          dels.push(this.db.farcEndpunktModel.remove({_id: delEp._id}).exec());
        });
        return Promise.all(dels)
            .then( (result) => {
              this.log.debug("saveEps() end for " + drv.type);
              return true;
            })
            .catch( (err) => {
              this.log.error("error deleting EPs " + err);
              return false;
            });
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
      // nur "normale" User speichern
      // TODO regex evtl. in config
      if (u.cn.search(/^[aAsS]077\d{4}$/) >= 0) {
        const user: FarcUser = {
          uid    : u.cn.toUpperCase(),
          name   : u.sn,
          vorname: u.givenName,
          mail   : u.mail,
          roles  : u.memberOf ? [...u.memberOf] : [],  // sicherstellen, dass das immer ein Array ist
        };
        validusers.push(u.cn);
        users.push(user);
        this.saveUser(user);
      } else {
        this.log.debug("ignore user " + u.cn);
      }
    });

    // User, die nicht in der AD-Abfrage sind, aus der DB entfernen
    this.userDAO.find({ uid : { $nin: validusers } })
        .then( (result: FarcUserDocument[]) => {
          if (result) {
            result.forEach( (usr: FarcUserDocument) => {
              this.eplog.info("User nicht im AD - geloescht: " + usr.uid + " " + usr.name + ", " + usr.vorname);
              this.userDAO.delete(usr)
                  .catch( (e) => {
                    this.log.error("error deleting user " + usr.uid + " " + e);
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
    this.userDAO.findOne(user.uid)
        .then( (u: FarcUserDocument) => {
          if (u) {
            this.userDAO.updateUser(u, user)
                .catch((e) => {
                  this.log.error("error updating user " + user.uid + " " + e);
                });
          } else {
            this.userDAO.create([user])
                .catch((e2) => {
                  this.log.error("error creating user " + user.uid + " " + e2);
                });
          }
        })
        .catch( (err) => {
          this.log.error("error searching user " + user.uid);
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

}
