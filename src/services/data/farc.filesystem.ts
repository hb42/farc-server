/**
 * Filesystem Zugriffe
 *
 * Created by hb on 04.09.16.
 */

import * as fs from "fs";
import * as path from "path";
import * as util from "util";

// Promise-Versionen von fs.readdir() + fs.stat()
const readdir = util.promisify(fs.readdir);
const stat = util.promisify(fs.stat);

import {
  ARCHIVE_NAME,
  confTREEDATE,
  FarcDriveDocument,
  FarcEndpunktDocument,
  FarcEntry,
  FarcEntryDocument,
  FarcEntryTypes,
  FarcSelectType,
  setConfigValue,
} from "@hb42/lib-farc";
import {
  LoggerService,
} from "@hb42/lib-server";

import {
  DataEventEmitter,
  DataServiceHandler,
} from ".";
import {FarcConfigDAO} from "../../model";
import {
  FarcDB,
} from "../backend";

interface DrvEP {
  drive: FarcDriveDocument;
  eps: FarcEndpunktDocument[];
}

export class FarcFilesystem {

  private log = LoggerService.get("farc-server.services.data.FarcFilesystem");
  private epcount: number;
  private records: number;

  private saveEPs: boolean[] = [];
  private ID: number;

  private readonly db: FarcDB;
  private eventHandler: DataEventEmitter;

  constructor(private services: DataServiceHandler) {
    this.db = services.db;
    this.eventHandler = services.dataEventHandler;
  }

  /**
   * Endpunkte einlesen
   */
  public async read() {
    this.records = 0;
    this.ID = 10000;
    // alle EP synchron holen
    const drveplist: DrvEP[] = await this.getEPlist();
    this.epcount = 0;
    drveplist.forEach((d) => this.epcount += d.eps.length);
    this.epcount *= 2;

    const readPromises: Array<Promise<boolean>> = [];
    drveplist.forEach((drvep) => {
      if (this.services.checkPathForDrive(drvep.drive, true) && this.services.checkPathForDrive(drvep.drive, false)) {
        drvep.eps.forEach((ep) => {
          const epp = this.readEps(drvep.drive, ep);
          readPromises.push(epp);
        });
      } else {
        this.log.error("Fehler beim Zugriff auf Laufwerk " + drvep.drive.displayname);
        // TODO nicht alle Laufwerke eingelesen -> wo vermerken? (evtl. im drive-record?, dto. Erfolg)
      }
    });
    Promise.all(readPromises).then((rc: boolean[]) => {
      const result: boolean = rc.reduce((a, b) => a && b, true);
      this.log.info("END readEps result=" + result);
      if (!result) {
        this.log.error("Fehler beim Eintragen der Entries in die DB. Siehe Log.");
        // TODO errorEvent?
      }
      const configDAO: FarcConfigDAO = new FarcConfigDAO(this.db);
      // Einlesedatum speichern
      const treedate = setConfigValue(Date.now());
      configDAO.updateConfig(confTREEDATE, treedate).then(() => {
        this.eventHandler.emit(this.eventHandler.evtReadFsReady);
      });
    });
  }

  // ---- DEBUG ----
  private getdirentries(key: any) {
    this.db.farcEntryModel.find({parent: key}).exec().then((res: FarcEntryDocument[]) => {
      res.forEach((item: FarcEntryDocument) => {
        if (item.type !== FarcEntryTypes.file) {
          this.log.info(FarcEntryTypes[item.type]
                       + " " + item.path.join("/"));
          this.getdirentries(item.key);
        }
      });
    });
  }

  private testEps() {
    this.db.farcEndpunktModel.find().exec()
        .then((result: FarcEndpunktDocument[]) => {
          // this.log.info(result);
          this.log.info("found " + result.length + " EPs");
          result.sort((a, b) => (a.drive + a.above + a.endpunkt).localeCompare(b.drive + b.above + b.endpunkt));
          result.forEach((ep) => {
            // this.log.info("EP " + ep.drive + " " + ep.above + "/" + ep.endpunkt);
            this.getdirentries(ep._id.toString());
          });
        });
  }
  // ---- ----

  /**
   * Entries loeschen und Liste aus [Lauferk, Endpunkt[]] holen
   *
   * @returns {Promise<DrvEP[]>}
   */
  private getEPlist(): Promise<DrvEP[]> {
      // Verzeichnisse/Dateien loeschen
    return this.db.farcEntryModel.collection.drop()  // drop() ist schneller als .remove({})
        .then((drop) => this.db.farcEntryModel.collection.createIndex("key", {unique: true }))  // neuer index
        .then((ci1) => this.db.farcEntryModel.collection.createIndex("parent"))  // neuer index
        .then((ci2) => this.db.farcEntryModel.collection.createIndex("selected"))  // neuer index
          // alle Laufwerke holen
        .then((ci3) => this.db.farcDriveModel.find().exec())
        .then((drvs: FarcDriveDocument[]) =>
          drvs.map((drv: FarcDriveDocument) =>
              // Endpunkte je Laufwerk
            this.db.farcEndpunktModel.find({drive: drv._id}).exec()
                  // Objekt aus Laufwerk + EPs
                .then((eplist: FarcEndpunktDocument[]) => ({drive: drv, eps: eplist}))))
        .then((promiselist: Array<Promise<DrvEP>>) => Promise.all(promiselist))
        .catch((err) => {
          this.log.error("Fehler beim Einlesen der Endpunkte aus der DB: " + err);
          return [];
        });

  }

  /**
   * Endpunkt-Einlesen starten (source + archive)
   *
   * @param drive - Laufwerk-Dokument
   * @param endpunkt - Endpunkt-Dokument
   */
  private async readEps(drive: FarcDriveDocument, endpunkt: FarcEndpunktDocument): Promise<boolean> {
    let epPath: string = drive.source_path
        + (endpunkt.above ? "/" + endpunkt.above : "")
        + "/" + endpunkt.endpunkt;
    const srcResult: boolean = await this.readEP(endpunkt, false, epPath, drive.displayname);
    epPath = drive.archive_path
        + (endpunkt.above ? "/" + endpunkt.above : "")
        + "/" + endpunkt.endpunkt;
    const arcResult: boolean = await this.readEP(endpunkt, true, epPath, ARCHIVE_NAME + drive.displayname);
    return srcResult && arcResult;
  }

  /**
   * Endpunkt-Baum einlesen
   *
   * @param ep - Endpunkt
   * @param archive - ja/nein
   * @param epPath - physischer Pfad
   * @param drivename - Laufwerk
   */
  private async readEP(ep: FarcEndpunktDocument, archive: boolean,
                       epPath: string, drivename: string): Promise<boolean> {
    this.log.info("reading " + epPath + " ...");
    const above: string[] = ep.above ? ep.above.split("/") : [];
    const root: FarcEntry = {
      parent    : ep._id.toString(),
      key       : "" + this.ID++,
      label     : ep.endpunkt,
      timestamp: null,
      size     : 0,
      type     : FarcEntryTypes.ep,
      arc      : archive,
      path     : [drivename, ...above, ep.endpunkt],
      leaf     : true,
      selected : FarcSelectType.none,
      drive    : ep.drive,
    };
    // Endpunk einlesen
    return this.walk(epPath, root)
        .then((entries) => {
          entries.push(root);
          this.records += entries.length;
          this.epcount--;
          this.log.debug("sum=" + root.size + " entries=" + entries.length + " remaining=" + this.epcount
                         + " db-count=" + this.records);
          // Baum unter Endpunkt speichern
          return this.db.farcEntryModel.collection.insertMany(entries)
              .then((rc) => {
                this.log.debug("insertMany count: " + rc.insertedCount);
                return true;
              })
              .catch((exc) => {
                this.log.error("insert exception " + exc);
                return false;
              });
        });
  }

  /**
   * Pfad rekursiv einlesen
   *
   * @param dir - Pfad zum einzulesenden Verzeichnis
   * @param parent - uebergeordnetes Verzeichnis
   * @returns Promise<FarcEntry[]> - Array der eingelesenen Dateien + Verzeichnisse
   */
  private async walk(dir: string, parent: FarcEntry): Promise<FarcEntry[]> {
    // flag f. parent
    let leaf: boolean = true;
    // let entries: FarcEntry[] = [];
    let sum = 0;
    // Verzeichniseintraege
    let list: string[];
    try {
      list = await readdir(dir);
    } catch (err) {
      this.log.error("Error at readdir(" + dir + ") - " + err.message);
      list = [];
    }
    // alle Eintraege bearbeiten
    const entries: any[] = await Promise.all(list.map(async (filename) => {
      let rc: FarcEntry[];
      // vollstaendiger Pfad
      const entry = path.resolve(dir, filename);
      // Attribute des Eintrags holen
      let direntry;
      try {
        direntry = await stat(entry);
      } catch (err) {
        this.log.error("Error at stat(" + entry + ") - " + err.message);
        return [];
      }
      if (direntry.isDirectory()) { // Eintrag ist Verzeichnis
        // parent ist kein Leaf
        leaf = false;
        const directory: FarcEntry = {
          parent   : parent.key,
          key      : "" + this.ID++,
          label    : filename,
          timestamp: direntry.mtime.getTime(),  // als mili speichern
          size     : 0,
          type     : FarcEntryTypes.dir,
          arc      : parent.arc,
          path     : parent.path.concat(filename),
          leaf     : true,
          selected : FarcSelectType.none,
          drive    : parent.drive,
        };
        // Inhalt des Unterverzeichnisses rekursiv holen
        const recurse: FarcEntry[] = await this.walk(entry, directory);
        // Ergebnis ist dieses Verzeichnis + alles, was darunter ist
        rc = [directory, ...recurse];
        sum += directory.size;
      } else { // Datei
        const file: FarcEntry = {
          parent   : parent.key,
          key      : "" + this.ID++,
          label    : filename,
          timestamp: direntry.mtime.getTime(),
          size     : direntry.size,
          type     : FarcEntryTypes.file,
          arc      : parent.arc,
          path     : parent.path,
          selected : FarcSelectType.none,
          drive    : parent.drive,
        };
        // Datensatz fuer die Datei liefern
        rc = [file];
        sum += file.size;
      }
      return rc;
    }));
    parent.size = sum;
    parent.leaf = leaf;
    // flatten array
    return entries.reduce((prev, curr) => prev.concat(curr), []);
  }

}
