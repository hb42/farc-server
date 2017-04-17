/**
 * Filesystem Zugriffe
 *
 * Created by hb on 04.09.16.
 */

// import { fs } from "mz";
import * as fs from "fs";
import * as path from "path";

import {
  DataEventEmitter,
} from ".";
import {
  ARCHIVE_NAME,
  FarcDriveDocument,
  FarcEndpunktDocument,
  FarcEntry,
  FarcEntryDocument,
  FarcEntryTypes,
  FarcSelectType,
  LoggerService,
} from "../../shared/ext";
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

  private ID: number;

  constructor(private eventHandler: DataEventEmitter, private db: FarcDB) {
    //
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
    drveplist.forEach( (d) => this.epcount += d.eps.length);
    this.epcount *= 2;

    let readPromises: Array<Promise<boolean>> = [];
    drveplist.forEach( (drvep) => {
      drvep.eps.forEach( (ep) => {
        const epp = this.readEps(drvep.drive, ep);
        readPromises = [...readPromises, ...epp];
      });
    });
    Promise.all(readPromises).then( (rc: boolean[]) => {
      const result: boolean = rc.reduce( (a, b) => a && b );
      this.log.info("END readEps result=" + result);
      if (result) {
        this.eventHandler.emit(this.eventHandler.evtReadFsReady);
        // DEBUG
        // this.testEps();
      } else {
        this.log.error("Fehler beim Eintragen der Entries in die DB. Siehe Log.");
        // TODO errorEvent?
      }
    });
  }

  // ---- DEBUG ----
  private getdirentries(key) {
    this.db.farcEntryModel.find({parent: key}).exec().then((res: FarcEntryDocument[]) => {
      res.forEach((item: FarcEntryDocument) => {
        if (item.type !== FarcEntryTypes.file) {
          console.info(FarcEntryTypes[item.type]  
                       + " " + item.path.join("/"));
          this.getdirentries(item.key);
        }
      });
    });
  }

  private testEps() {
    this.db.farcEndpunktModel.find().exec()
        .then((result: FarcEndpunktDocument[]) => {
          // console.info(result);
          console.info("found " + result.length + " EPs");
          result.sort((a, b) => (a.drive + a.above + a.endpunkt).localeCompare(b.drive + b.above + b.endpunkt));
          result.forEach((ep) => {
            // console.info("EP " + ep.drive + " " + ep.above + "/" + ep.endpunkt);
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

    return this.db.farcEntryModel.collection.drop()  // drop() ist schneller als .remove({})
        .then( (drop) => this.db.farcEntryModel.collection.createIndex("key", {unique: true }) )  // neuer index
        .then( (ci1) => this.db.farcEntryModel.collection.createIndex("parent") )  // neuer index
        .then( (ci2) => this.db.farcEntryModel.collection.createIndex("selected") )  // neuer index
        .then( (ci3) => this.db.farcDriveModel.find().exec() )  // alle Laufwerke
        .then( (drvs: FarcDriveDocument[]) =>
          drvs.map((drv: FarcDriveDocument) =>
            this.db.farcEndpunktModel.find({drive: drv._id}).exec() // EPs je Laufwerk
                .then( (eplist: FarcEndpunktDocument[]) => ({drive: drv, eps: eplist}) ) ) )
        .then( (promiselist: Array<Promise<DrvEP>>) => Promise.all(promiselist) )
        .catch( (err) => {
          this.log.error("Fehler beim Einlesen der Endpunkte aus der DB: " + err);
        });

  }

  /**
   * Endpunkt einlesen (source + archive)
   *
   * @param endpunkt - Endpunkt-Dokument
   */
  private readEps(drive: FarcDriveDocument, endpunkt: FarcEndpunktDocument): Array<Promise<boolean>> {
    let epPath: string = drive.sourcepath
        + (endpunkt.above ? "/" + endpunkt.above : "")
        + "/" + endpunkt.endpunkt;
    const pSrc: Promise<boolean> = this.readEP(endpunkt, false, epPath, drive.displayname);
    epPath = drive.archivepath
        + (endpunkt.above ? "/" + endpunkt.above : "")
        + "/" + endpunkt.endpunkt;
    const pArc: Promise<boolean> = this.readEP(endpunkt, true, epPath, ARCHIVE_NAME + drive.displayname);
    return [pSrc, pArc];
  }

  private readEP(ep: FarcEndpunktDocument, archive: boolean, epPath: string, drivename: string): Promise<boolean> {
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
    };
    const entries: FarcEntry[] = this.walk(epPath, root);
    entries.push(root);
    this.records += entries.length;
    this.epcount--;
    this.log.debug("sum=" + root.size + " entries=" + entries.length + " remaining=" + this.epcount
                   + " db-count=" + this.records);

    // Das Speichern in der DB passiert erst, wenn die Einlese-Schleife durch ist, da hilft auch alle
    // Trickserei mit await nichts. Fuers Speichern braucht die node-Instanz dann viel Speicher.
    // Deshalb node mit --max_old_space_size=8000 starten, das erlaubt node bis zu 8GB zu verwenden.
    // Wenn das Speichern direkt ueber den mongodb driver laeuft (farcEntryModel.collection...) ist
    // das mehr als genug, mongoose wuerde fuer farcEntryModel.insertMany 32GB oder mehr brauchen.

    return this.db.farcEntryModel.collection.insertMany(entries)
        .then( (rc) => {
          this.log.debug("insertMany count: " + rc.insertedCount);
          return true;
        })
        .catch( (exc) => {
          this.log.error("insert exception " + exc);
          return false;
        });
  }

  /**
   * Pfad rekursiv einlesen
   * Filesystem-Zugriffe sind synchron, da async hier nichts hilft (das wuerde
   * hunderte von Threads starten, die sich gegenseitig ausbremsen).
   *
   * @param dir - Pfad zum einzulesenden Verzeichnis
   * @param parent - uebergeordnetes Verzeichnis
   * @returns FarcEntry[] - Array der eingelesenen Dateien + Verzeichnisse
   */
  private walk(dir: string, parent: FarcEntry): FarcEntry[] {
    // flag f. parent
    let leaf: boolean = true;
    let entries: FarcEntry[] = [];
    let sum = 0;
    let list: string[];
    try {
      list = fs.readdirSync(dir);
    } catch (e) {
      list = [];
    }
    list.forEach( (filename) => {
      const entry = path.resolve(dir, filename);
      try {
        const stat = fs.lstatSync(entry);
        if (stat.isDirectory()) {
          // parent ist kein Leaf
          leaf = false;
          const directory: FarcEntry = {
            parent   : parent.key,
            key      : "" + this.ID++,
            label    : filename,
            timestamp: stat.mtime.getTime(),  // als mili speichern
            size     : 0,
            type     : FarcEntryTypes.dir,
            arc      : parent.arc,
            path     : parent.path.concat(filename),
            leaf     : true,
            selected : FarcSelectType.none,
          };
          entries.push(directory);
          // Rekursion
          entries = entries.concat(this.walk(entry, directory));
          sum += directory.size;
        } else {
          const file: FarcEntry = {
            parent   : parent.key,
            key      : "" + this.ID++,
            label    : filename,
            timestamp: stat.mtime.getTime(),
            size     : stat.size,
            type     : FarcEntryTypes.file,
            arc      : parent.arc,
            path     : parent.path,
            selected : FarcSelectType.none,
          };
          entries.push(file);
          sum += file.size;
        }
      } catch (e) {
        this.log.error("lstat-Fehler in walk() fuer " + entry);
      }
    });
    parent.size = sum;
    parent.leaf = leaf;
    return entries;
  }

}
