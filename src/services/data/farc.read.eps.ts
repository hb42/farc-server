/**
 * Endpunkte einlesen
 *
 * Created by hb on 04.03.17.
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
  ADService,
  LoggerService,
} from "@hb42/lib-server";

import {
  DataEventEmitter,
  DataServiceHandler,
} from ".";
import {
  FarcConfigDAO,
  FarcUserDAO,
} from "../../model";
import {
  FarcDB,
} from "../backend";

// TODO Fehler beim Einlesen sammeln und per Mail an Admin senden
//      ausserdem gibt's hier eine Reihe von Strings die externalisiert werden sollten

export class FarcReadEps {
  // zweite Ebene fuer INST-Endpunkte
  // TODO in config-DB auslagern
  private static instSubdir: string[] = ["VRZDaten", "SPKDaten"];

  // lokale Dateien fuer die AD-Daten fuer offline-Tests
  private static uname = "ad_users.json";
  private static ename = "ad_eps.json";
  private static rname = "ad_roles.json";

  private static evtProcess = "processADdata";

  private log = LoggerService.get("farc-server.services.data.FarcReadEps");

  // eingelesene Daten vom AD
  private adUsers: any;
  private adEps: any;
  private adRoles: any;

  private dataDrive: FarcDriveDocument | null;
  private homeDrive: FarcDriveDocument | null;
  private instDrive: FarcDriveDocument | null;

  private db: FarcDB;
  private userDAO: FarcUserDAO;
  private configDAO: FarcConfigDAO;
  private AD: ADService;

  private readonly testEnv: boolean;
  private eventHandler: DataEventEmitter;

  private emptyPromise: Promise<boolean> = new Promise((reolve, reject) => {
    reolve(false);
  });

  constructor(private services: DataServiceHandler) {
    this.db = services.db;
    this.testEnv = services.config.TESTENV;
    this.eventHandler = services.dataEventHandler;
    this.AD = services.AD;
    this.userDAO = new FarcUserDAO(services.db);
    this.configDAO = new FarcConfigDAO(services.db);
  }

  /**
   * Einlesen der Endpunkte starten
   */
  public async readEps() {
    this.adUsers = null;
    this.adRoles = null;
    this.adEps = null;
    this.dataDrive = null;
    this.homeDrive = null;
    this.instDrive = null;
    // this.initEventHandling();

    // Laufwerke holen
    const drvs = await this.getDrives();
    if (drvs) {
      try {
        // alles, was vom AD gebraucht wird
        await this.readADdata();
        // speichern + Endpunkte einlesen triggern
        this.processADdata();
      } catch (e) {
        this.log.error("Endpunkte nicht vollstaendig eingelesen. Fehler: " + e.message);
      }
    }
  }

  /**
   * alle drei Laufwerke holen
   */
  private getDrives(): Promise<boolean> {
    return this.db.farcDriveModel.find().exec()
        .then((drvs: FarcDriveDocument[]) => {
          drvs.forEach((drv) => {
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
          return true;
        })
        .catch((err) => {
          this.log.error("error reading drives " + err);
          this.dataDrive = null;
          this.instDrive = null;
          this.homeDrive = null;
          return false;
        });
  }

  /**
   * Endpunkte, User und Rollen aus dem AD holen
   *
   * TODO strings auslagern, evtl. interfaces f. query results
   */
  private async readADdata() {
    if (!this.testEnv) {
      this.log.debug("## ReadEps from AD");
      try {
        // Verbindung zum AD
        await this.AD.bind(this.services.config.ldapURL,
                           this.services.config.ldapAdmin,
                           this.services.config.ldapPwd);

        // Benutzer holen (incl. direkte Rollen)
        this.adUsers =
            await this.AD.query("OU=E077,OU=Kunden,dc=v998dpve,dc=v998,dc=intern",
                                {
                                  filter    : "(&(objectCategory=person)(objectClass=user))",
                                  scope     : "sub",
                                  paged     : true,
                                  attributes: ["cn", "sn", "givenName", "displayName", "mail", "memberOf"],
                                });
        this.log.debug("Active Directory users " + this.adUsers.length);
        this.saveAD(FarcReadEps.uname, this.adUsers);

        // Endpunkte holen
        this.adEps = [];
        const eproles: any[] =
            await this.AD.query("OU=Dateisystemzugriff,OU=Gruppen,OU=E077,OU=Kunden,dc=v998dpve,dc=v998,dc=intern",
                                {
                                  filter    : "(&(objectCategory=group)(objectClass=group))",
                                  scope     : "sub",
                                  paged     : true,
                                  attributes: ["cn", "displayName", "description"],
                                });
        const pattern = /^.nd_V998DPVE(\\E077\\Daten)?\\{1,2}/i;
        eproles.forEach((epr) => {
          const path = epr.displayName;
          if (path.match(pattern)) {
            const ep = path.replace(pattern, "").replace(/\\/g, "/"); // .toLowerCase();
            this.adEps.push(ep);
          }
        });
        this.log.debug("Active Directory Endpunkte " + this.adEps.length);
        this.saveAD(FarcReadEps.ename, this.adEps);

        // Rollen holen
        this.adRoles =
            await this.AD.query("OU=AnwenderRollen,OU=Gruppen,OU=E077,OU=Kunden,dc=v998dpve,dc=v998,dc=intern",
                                {
                                  filter    : "(&(objectCategory=group)(objectClass=group))",
                                  scope     : "sub",
                                  paged     : true,
                                  attributes: ["cn", "displayName", "description"],
                                });
        this.log.debug("Active Directory Rollen " + this.adRoles.length);
        this.saveAD(FarcReadEps.rname, this.adRoles);

        // Verbindung zum AD trennen
        this.AD.unbind();
      } catch (err) {
        throw(new Error("Fehler beim Einlesen der Daten aus dem AD - " + err));
      }
    } else {  /* fuer Tests ohne AD, Daten aus .json-files holen */
      this.log.debug("## ReadEps from file");
      timers.setTimeout(() => {  // Verzoegerung, um AD-Delay zu simulieren
        this.eventHandler.emit(this.eventHandler.evtReadAdUsers,
                                   JSON.parse(fs.readFileSync("resource/" + FarcReadEps.uname, "utf8")).data);
        this.eventHandler.emit(this.eventHandler.evtReadAdEps,
                                   JSON.parse(fs.readFileSync("resource/" + FarcReadEps.ename, "utf8")).data);
        this.eventHandler.emit(this.eventHandler.evtReadAdRoles,
                                   JSON.parse(fs.readFileSync("resource/" + FarcReadEps.rname, "utf8")).data);
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

    obj.forEach((r: any) => {
      roles.push({name: r.displayName, dn: r.dn});
    });
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

    Promise.all(saves).then((sav: boolean[]) => {
      const result: boolean = sav.reduce((a, b) => a && b);
      if (result) {
        this.log.info("EPs erfolgreich gespeichert");
        this.eventHandler.emit(this.eventHandler.evtReadDataReady);
      } else {
        this.log.error("Fehler beim Speichern der EPs in saveEndpunkte()");
      }
    });
  }

  /**
   * Endpunkte fuer DATEN mit Liste aus dem AD updaten
   */
  private saveDataEps(eps: any): Promise<boolean> {
    if (!this.dataDrive) {
      this.log.error("Kein Laufwerk 'data'");
      return this.emptyPromise;
    }
    if (this.services.checkPathForDrive(this.dataDrive, true)
        && this.services.checkPathForDrive(this.dataDrive, false)) {
      this.log.debug("saveDataEps: " + this.dataDrive.displayname);
      const eplist: FarcEndpunkt[] = this.makeEpList(eps, this.dataDrive);
      this.log.debug("ep.length: " + eplist.length);
      return this.saveEps(eplist, this.dataDrive);
    } else {
      this.log.error("Shares fuer Laufwerk 'data' nicht erreichbar.");
      return this.emptyPromise;
    }
  }

  /**
   * Endpunkte fuer HOME mit Liste der User aus dem AD updaten
   */
  private saveUserEps(users: FarcUser[]): Promise<boolean> {
    if (!this.homeDrive) {
      this.log.error("Kein Laufwerk 'home'");
      return this.emptyPromise;
    }
    if (this.services.checkPathForDrive(this.homeDrive, true)
        && this.services.checkPathForDrive(this.homeDrive, false)) {
      this.log.debug("saveUserEps: " + this.homeDrive.displayname);
      const eplist: FarcEndpunkt[] = this.makeEpList(users.map((u) => u.uid), this.homeDrive);
      return this.setHomeOe(eplist, users).then((res: boolean) => {
        if (res) {
          this.log.debug("ep.length: " + eplist.length);
          // @ts-ignore
          return this.saveEps(eplist, this.homeDrive);
        } else {
          return false;
        }
      });
    } else {
      this.log.error("Shares fuer Laufwerk 'home' nicht erreichbar.");
      return this.emptyPromise;
    }
  }

  /**
   * Endpunkte fuer INST mit den vorhandenen Verzeichnissen updaten
   */
  private saveInstEps(): Promise<boolean> {
    if (!this.instDrive) {
      this.log.error("Kein Laufwerk 'inst'");
      return this.emptyPromise;
    }
    if (this.services.checkPathForDrive(this.instDrive, true)
        && this.services.checkPathForDrive(this.instDrive, false)) {
      this.log.debug("saveInstEps: " + this.instDrive.displayname);
      const eps: string[] = this.getInstEps(this.instDrive);
      const eplist: FarcEndpunkt[] = this.makeEpList(eps, this.instDrive);
      this.log.debug("ep.length: " + eplist.length);
      return this.saveEps(eplist, this.instDrive);
    } else {
      this.log.error("Shares fuer Laufwerk 'inst' nicht erreichbar.");
      return this.emptyPromise;
    }
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
    eps.forEach((ep: string) => {
      // node.filesystem versteht auch unter Windows Pfade mit slashes => backslash ist verzichtbar
      ep = ep.replace(/\\/g, "/");
      // nur EPs, die auch im filesystem (source) existieren
      if (this.checkFS(ep, drv)) {
        const path = ep.split("/");
        const epname: string | undefined = path.pop();
        const endpunkt: FarcEndpunkt = {
          endpunkt: epname ? epname : "", // .toLowerCase(),
          above   : path.join("/").toLowerCase(), // immer lowercase bis EP
          drive   : drv._id,
          oe      : undefined,
        };
        eplist.push(endpunkt);
      } else {
        this.log.error("Endpunkt nicht im Dateisystem vorhanden: [" + drv.displayname + "] " + ep);
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
    const rc: boolean = drv.type === FarcDriveTypes.inst ? true : fs.existsSync(drv.source_path + "/" + path);
    if (rc) {
      // create archive EP if not exist
      path.split("/").reduce((p, folder) => {
        p += "/" + folder;
        if (!fs.existsSync(drv.archive_path + p)) {
          try {
            fs.mkdirSync(drv.archive_path + p);
          } catch (err) {
            this.log.error("Fehler beim Anlegen des Archiv-Endpunkts " + drv.archive_path + p + ": " + err.message);
          }
        }
        return p;
      }, "");
    }
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
    let eplist: string[] = this.getDirList(drv.source_path);
    eplist = eplist.filter((dirname) =>
                                !FarcReadEps.instSubdir.find((d) => d.toLowerCase() === dirname.toLowerCase()));
    FarcReadEps.instSubdir.forEach((sub) => {
      let sublist = this.getDirList(drv.source_path + "/" + sub);
      sublist = sublist.map((d) => sub + "/" + d);
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
    return list.filter((filename) => {
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
        .then((oes) => {
          eplist.forEach((ep) => {
            const user: FarcUser | undefined = users.find((u) => u.uid.toLowerCase() === ep.endpunkt.toLowerCase());
            if (user) {
              // Benutzerrollen mit den bei der OE eingetragenen Rollen abgleichen
              const oe: FarcOeDocument | undefined = oes.find((o) => {
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
              this.log.info("Kein User fuer EP " + ep.endpunkt);
            }
          });
          return true;
        })
        .catch ((err) => {
          this.log.error("error reading OEs " + err);
          return false;
        });
  }

  /**
   * Endpunkte aus eplist in DB speichern, sofern neu. Fuer HOME-EPs OE updaten.
   * Nicht in eplist vorhandene Datensaetze werden geloescht.
   *
   * @param eplist
   * @param drv
   */
  private saveEps(eplist: FarcEndpunkt[], drv: FarcDriveDocument): Promise<boolean> {
    this.log.debug("save EPs count=" + eplist.length + " for drive " + drv.displayname);
    return this.db.farcEndpunktModel.find({drive: drv._id}).exec().then((dbEps) => {
      this.log.debug("EPs in DB: " + dbEps.length);
      const neweps: FarcEndpunkt[] = eplist.filter((ep) => {
        const len = dbEps.length;
        dbEps = dbEps.filter((dbep) => {
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
      return this.db.farcEndpunktModel.create(neweps).then((res) => {
        if (neweps) {
          this.log.info("== Neue Endpunkte auf " + drv.displayname);
          neweps.forEach((nep) => this.log.info("  " + nep.above + "/" + nep.endpunkt));
        }
        // delete dbEps
        if (dbEps) {
          this.log.info("== Nicht mehr vorhandene Endpunkte auf " + drv.displayname);
          dbEps.forEach((dep) => this.log.info("  " + dep.above + "/" + dep.endpunkt));
        }
        const dels: Array<Promise<any>> = [];
        dbEps.forEach((delEp) => {
          dels.push(this.db.farcEndpunktModel.remove({_id: delEp._id}).exec());
        });
        return Promise.all(dels)
            .then((result) => {
              this.log.debug("saveEps() end for " + drv.type);
              return true;
            })
            .catch((err) => {
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
    const validusers: string[] = [];
    const users: FarcUser[] = [];
    obj.forEach((u: any) => {
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
        .then((result: FarcUserDocument[]) => {
          if (result) {
            result.forEach((usr: FarcUserDocument) => {
              this.log.info("User nicht im AD - geloescht: " + usr.uid + " " + usr.name + ", " + usr.vorname);
              this.userDAO.delete(usr)
                  .catch((e) => {
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
        .then((u: FarcUserDocument) => {
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
        .catch((err) => {
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
    if (!this.testEnv) {
      const exp = {data: dat};
      fs.writeFileSync(fname, JSON.stringify(exp, null, 2));
    }
  }

}
