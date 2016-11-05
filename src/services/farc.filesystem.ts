/**
 * Filesystem Zugriffe
 *
 * Created by hb on 04.09.16.
 */

import { fs } from "mz";
import * as path from "path";

import {
  FarcDriveDocument,
  FarcEndpunktDocument,
  FarcEntry,
  FarcEntryDocument,
  FarcEntryTypes,
  FarcSelectType,
} from "@hb42/lib-farc";

import {
  FarcDB,
} from "./";

interface DrvEP {
  drive: FarcDriveDocument;
  eps: FarcEndpunktDocument[];
}

export class FarcFilesystem {

  private startRead: number;  // DEBUG
  private epcount: number;
  private records: number;

  private ID: number;

  constructor(private db: FarcDB) {
    //
  }

  // TODO drive new/change/del
  // TODO ep new/change/del -> class

  /**
   * Endpunkte einlesen
   */
  public async read() {
    this.startRead = Date.now();  // DEBUG

    this.epcount = 400; // TODO berechnen
    this.records = 0;
    this.ID = 10000;   // TODO key f. EPs ab 0 generieren
    // alle EP synchron holen
    let drveplist: DrvEP[] = await this.getEPlist();
    drveplist.forEach( obj => {
      obj.eps.forEach( ep => {
        console.info("readEPSync " + ep.endpunkt);
        this.readEp(obj.drive, ep);
      });
    });
  }

  // ############ TEST
  // XXX Test Einlesen
  public getDirs() {
    this.startRead = Date.now();
    this.db.farcEndpunktModel.find({}, err2 => { ; })
        .exec((err3: Error, result: FarcEndpunktDocument[]) => {
          if (err3) {
            console.error("db error " + err3);
          } else {
            // console.info(result);
            console.info("found " + result.length + " EPs");
            result.forEach(ep => {
              this.getdirentries(ep._id);
            });
          }
        });
  }
  // ######### TEST
  public getdirentries(id) {
    this.db.farcEntryModel.find({parent: id}).exec().then( (res: FarcEntryDocument[]) => {
      res.forEach((item: FarcEntryDocument) => {
        if (item.type !== FarcEntryTypes.file) {
          console.info((Date.now() - this.startRead) + "  " + FarcEntryTypes[item.type] + " " + item.leaf + " "
                       + item.label + " (" + item.path.join("/") + ")");
          this.getdirentries(item._id);
        }
      });
    });
  }

  private getEPlist(): Promise<DrvEP[]> {
    return this.db.farcEntryModel.find().remove()  // alte EPs loeschen
        .then( r => this.db.farcDriveModel.find().exec() )   // alle Laufwerke
        .then( (drvs: FarcDriveDocument[]) => {
          return drvs.map( (drv: FarcDriveDocument) => { // EPs je Laufwerk
            return this.db.farcEndpunktModel.find({drive: drv.id}).exec().then( (eplist: FarcEndpunktDocument[]) => {
              return {drive: drv, eps: eplist};
            });
          });
        }).then( (promiselist: Promise<DrvEP>[]) => {
          return Promise.all(promiselist);
        })
        .catch( (err) => {
          console.info("Fehler beim Einlesen: " + err);
        });

  }

  /**
   * Endpunkt einlesen
   *
   * @param endpunkt - Endpunkt-Dokument
   */
  private async readEp(drive: FarcDriveDocument, endpunkt: FarcEndpunktDocument) {
    let epPath: string = [drive.sourcepath].concat(endpunkt.above).concat(endpunkt.endpunkt).join("/");

    // Startknoten fuer den Baum
    // let root = new farcEntryModel({
    let root: FarcEntry = {
      parent    : endpunkt.key,
      key       : this.ID++,
      label     : endpunkt.endpunkt,
      timestamp: null,
      size     : 0,
      type     : FarcEntryTypes.ep,
      arc      : drive.arc,
      path     : [drive.displayname].concat(endpunkt.above).concat(endpunkt.endpunkt),
      leaf     : true,
      selected : FarcSelectType.none,
    };
    let entries: FarcEntry[] = this.walk(epPath, root);
    entries.push(root);
    this.records += entries.length;
    this.epcount--;
    console.info(epPath + " #sum " + root.size);
    console.info("milis reading=" + (Date.now() - this.startRead) + " remaining: " + this.epcount
                 + " entries=" + entries.length + " db-count=" + this.records); // DEBUG

    // Das Speichern in der DB passiert erst, wenn die Einlese-Schleife durch ist, da hilft auch alle
    // Trickserei mit await nichts. Fuers Speichern braucht die node-Instanz dann sehr viel Speicher.
    // Deshalb node mit --max_old_space_size=32000 starten, das erlaubt node bis zu 32GB zu verwenden.
    // Wenn das Speichern direkt ueber den mongodb driver laeuft (farcEntryModel.collection...) ist
    // das mehr als genug, mongoose wuerde fuer farcEntryModel.insertMany ggf. auch das noch ueberschreiten.
    try {
      this.db.farcEntryModel.collection.insertMany(entries).then( rc => {
        console.info("insertMany t=" + (Date.now() - this.startRead) + " #" + rc.insertedCount);
      });
    } catch (exc) {
      console.info("insert exception " + exc);
    }
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
    list.forEach(filename => {
      let entry = path.resolve(dir, filename);
      try {
        let stat = fs.lstatSync(entry);
        if (stat.isDirectory()) {
          // parent ist kein Leaf
          leaf = false;
          let directory: FarcEntry = {
            parent   : parent.key,
            key      : this.ID++,
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
          let file: FarcEntry = {
            parent   : parent.key,
            key      : this.ID++,
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
        console.error("lstat-Fehler " + entry);
      }
    });
    parent.size = sum;
    parent.leaf = leaf;
    return entries;
  }

}
