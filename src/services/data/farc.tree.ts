/**
 * Client-Zugriffe auf Tree erledigen
 *
 * Created by hb on 04.09.16.
 */

// import * as R from "ramda";

import {
  ARCHIVE_NAME,
  FarcDriveDocument,
  FarcDriveTypes,
  FarcEndpunktDocument,
  FarcEntryDocument,
  FarcEntryTypes,
  FarcOeDocument,
  FarcSelectType,
  FarcTreeNode,
  LoggerService,
} from "../../shared/ext";
import {
  FarcDB,
} from "../backend";
import {
  FarcSession,
} from "../rest";

export class FarcTree {

  public noOE = "Keine Zuordnung";

  private log = LoggerService.get("farc-server.services.data.FarcTree");
  private tree: FarcTreeNode[];  // Baum ab Drive bis EP (Rest holt Client bei Bedarf)

  private oelist: FarcTreeNode[] = [];

  constructor(private db: FarcDB) {
    this.log.debug("start makeTrees");
    this.makeTrees().then( (tree) => {
      this.tree = tree;
      this.log.debug("calc");
      this.calcSize();
      this.log.debug("end makeTrees");
    });
  }

  // DEBUG output
  public debug() {
      const pc = (node: FarcTreeNode, tab: string) => {
        if (node.children) {
          node.children.sort( (a: FarcTreeNode, b: FarcTreeNode) => a.label.localeCompare(b.label) );
          node.children.forEach( (ch) => {
            this.log.trace(tab + ch.label + " (" + ch.size + ")");
            pc(ch, tab + "  ");
          });
        }
      };
      this.tree.forEach( (node: FarcTreeNode) => {
        this.log.trace(node.label);
        pc(node, "  ");
      });

  }
  /**
   * Baum ab Drive bis zu den EP zusammensetzen
   *
   * @returns {any}
   */
  public makeTrees(): Promise<FarcTreeNode[]> {
    // fn's deklarieren (kleiner Versuch im funktionalen Programmieren)
    const drives = (select: any) => this.db.farcDriveModel.find(select);
    const buildTrees = (drvs: FarcDriveDocument[]) => {
      const promises: Array<Promise<FarcTreeNode>> = [];
      // Promise.all(drvs.map((drv: FarcDriveDocument) => this.makeDriveTree(drv)))
      drvs.forEach( (drv: FarcDriveDocument) => {
        promises.push(this.makeDriveTree(drv, false));
        promises.push(this.makeDriveTree(drv, true));
      });
      return Promise.all(promises);
    };
    // fn chain mit Ramda
    // const gettree = R.bind( R.pipeP(drives, buildTrees), this ); // IDE zeigt Fehler, typings nicht aktuell/Fehler
    // return gettree({});

    // chaining ohne Ramda
    return drives( {} ).then( (drvs) => buildTrees(drvs) )
        .then( (tree) => {
          this.makeOElist();
          return tree.sort( (d1, d2) => {
            // Laufwerke sortieren
            if (d1.arc === d2.arc) {
              return d1.label.localeCompare(d2.label);
            } else {
              return d1.arc ? 1 : -1;
            }
          });
        });
  }

  /**
   * Endpunkte fuer ein Laufwerk aus DB holen und zusammensetzen
   *
   * @returns Promise<FarcTreeNode>
   */
  public makeDriveTree(drive: FarcDriveDocument, archive: boolean): Promise<FarcTreeNode> {
    const drivename = archive ? ARCHIVE_NAME + drive.displayname : drive.displayname;
    const driveroot: FarcTreeNode = {
      label     : drivename,
      timestamp: null,
      size     : 0,
      children : [] as FarcTreeNode[],
      files    : null,
      entrytype: FarcEntryTypes.strukt,
      arc      : archive,
      path     : [drivename],
      entryid  : null,
      leaf     : false,
      selected : FarcSelectType.none,
      type     : FarcEntryTypes[FarcEntryTypes.strukt],
      drive    : drive.type,
    };

    return this.db.farcEndpunktModel.find({drive: drive._id}).exec().then((result) => {
      return Promise.all(result.map( (ep: FarcEndpunktDocument) => {
        // this.log.trace(drivename + ": " + ep.above + "/" + ep.endpunkt)
        let node: FarcTreeNode = driveroot;
        // Pfad ab drive zum EP aufbauen
        const above: string[] = ep.above ? ep.above.split("/") : [];
        above.push(ep.endpunkt);
        above.forEach( (dir) => {
          const ch: FarcTreeNode[] = node.children.filter( (n) => dir === n.label );
          if (ch && ch.length === 1) {
            node = ch[0];
          } else {
            const child: FarcTreeNode = {
              label     : dir,
              timestamp: null,
              size     : 0,
              children : [] as FarcTreeNode[],
              files    : null,
              entrytype: FarcEntryTypes.strukt,
              arc      : archive,
              path     : node.path.concat(dir),
              entryid  : null,
              leaf     : false,
              selected : FarcSelectType.none,
              type     : FarcEntryTypes[FarcEntryTypes.strukt],
            };
            node.children.push(child);
            node = child;
          }
        });
        return this.db.farcEntryModel.findOne({parent: ep._id.toString(), arc: archive}).exec()
            .then( (epEntry: FarcEntryDocument) => {
          if (epEntry) {
            // Endpunkt
            node.entryid = epEntry.key;
            node.timestamp = epEntry.timestamp;
            node.size = epEntry.size;
            node.children = null;
            node.files = null;
            node.entrytype = FarcEntryTypes.ep;
            node.arc = epEntry.arc;
            node.leaf = epEntry.leaf;
            node.type = FarcEntryTypes[FarcEntryTypes.ep];
            // if (ep.oe) {
            return this.db.farcOeModel.findById(ep.oe).exec()
                  .then( (oe: FarcOeDocument) => {
                    node.oe = oe ? oe.name : this.noOE;
                    if (!node.arc) {
                      this.oelist.push({
                        entryid:  node.entryid,
                        label:    node.label,
                        size:     node.size,
                        children: [],
                        path:     node.path,
                        oe:       node.oe,
                                       });
                    }
                  });
            // } else {  // no OE
            //   if (!node.arc) {
            //     node.oe = "";
            //     this.oelist.push(node);
            //   }
            // }
          }
        });
      }) ).then( () => driveroot );
    });
  }

  public testQ() {
    //
  }

  public getTree(useroe: string, userid: string, admin: boolean): FarcTreeNode[] {
    // tree kopieren
    const tr = JSON.parse(JSON.stringify(this.tree));
    if (!admin) {
      this.setUserFor(tr, useroe, userid);
    }
    return tr;
  }
  /**
   * Unterverzeichnisse fuer Knoten holen
   *
   * @param key - id des Knotens
   * @returns {Promise<FarcTreeNode[]>}
   */
  public getChildren(key: string): Promise<FarcTreeNode[]> {
    return this.getEntriesFor({parent: key, type: FarcEntryTypes.dir});
  }

  /**
   * Dateien fuer einen Knoten holen
   *
   * @param key - id des Knotens
   * @returns {Promise<FarcTreeNode[]>}
   */
  public getFiles(key: string): Promise<FarcTreeNode[]> {
    return this.getEntriesFor({parent: key, type: FarcEntryTypes.file});
  }

  /**
   * get drives -> admin
   * -> admin-modul?
   */
  public getDrives() {
    return this.db.farcDriveModel.find().exec();
  }

  public getOeList(useroe: string, admin: boolean) {
    const ol: FarcTreeNode[] = JSON.parse(JSON.stringify(this.oelist));
    if (!admin) {
      ol.forEach( (o) => {
        if (o.label !== useroe) {
          o.children = [];
        }
      });
    }
    return ol;
  }

  /**
   * Vormerkungen eines Benutzers holen.
   * Wenn uid == null werden alle Vormerkungen geliefert.
   *
   * @param uid - User-ID
   * @returns {Promise<FarcTreeNode[]>}
   */
  public getVormerkung(uid: string): Promise<FarcTreeNode[]> {
    const search = uid ? {selectUid: uid, selected: {$gt: 0} } : {selected: {$gt: 0} };
    return this.getEntriesFor(search);
  }

  /**
   * Vormerkungen speichern
   *
   * @param vor
   * @returns {Promise<T>}
   */
  public saveVormerkung(vor: FarcTreeNode[]): Promise<string> {
    const result: Array<Promise<string>> = vor.map( (v) => {
      return this.db.farcEntryModel.findOne({key: v.entryid}).exec().then( (entry) => {
        if (entry) {
          entry.selectDate = v.selectDate;
          entry.selectUid = v.selectUid;
          entry.selected = v.selected;
          return entry.save()
              .then( (rc) => "OK")
              .catch( (e) => "Fehler beim Speichern von " + v.label + " " + e);
        } else {
          return "Kein Datensatz für " + v.label;
        }
      });
    });
    return Promise.all(result).then( (res) => {
      let ret = "";
      res.forEach( (s) => {
        if (s !== "OK") {
          ret += s + "/ ";
        }
      });
      if (ret === "") {
        ret = "OK";
      }
      return ret;
    });
  }

  /**
   * Eintraege fuer einen Knoten holen
   *
   * @param key - id des Knotens
   * @param typ - Knoten-Typ
   * @returns {Promise<FarcTreeNode[]>}
   */
  private getEntriesFor(search: any): Promise<FarcTreeNode[]> {
    return this.db.farcEntryModel.find(search).exec().then( (entries: FarcEntryDocument[]) => {
      return entries.map( (entry: FarcEntryDocument) => {
        return {
          entryid:    entry.key,
          label:      entry.label,
          timestamp:  entry.timestamp,
          size:       entry.size,
          children:   null,
          files:      null,
          entrytype:  entry.type,
          arc:        entry.arc,
          path:       entry.path,
          leaf:       entry.leaf,
          selected:   entry.selected,
          selectUid:  entry.selectUid,
          selectDate: entry.selectDate,
          type:       FarcEntryTypes[entry.type],
        } as FarcTreeNode;
      });
    }).catch( (e) => console.info("**** ERROR " + e));
  }

  /*
    EP-size nach oben aufsummieren
   */
  private calcSize() {
    this.tree.forEach( (drv) => {
      drv.size = this.recurseCalc(drv.children);
    });
  }
  private recurseCalc(nodes: FarcTreeNode[]): number {
    return nodes.reduce( (s: number, n: FarcTreeNode) => {
      if (n.children) {
        n.size = this.recurseCalc(n.children);
      }
      s += n.size;
      return s;
    }, 0);
  }

  private setUserFor(tree: FarcTreeNode[], oe: string, userid: string) {
    tree.forEach( (drv) => {
      if (drv.drive === FarcDriveTypes.home) {
        const user = userid.toUpperCase();
        drv.children = drv.children.filter( (c) => user === c.label.toUpperCase() );
      } else {
        this.recurseUser(drv.children, oe);
      }
    });
  }
  private recurseUser(nodes: FarcTreeNode[], oe: string) {
    nodes.forEach( (n) => {
      if (n.children) {
        this.recurseUser(n.children, oe);
      } else {
        if (n.oe) {
          if (n.oe !== oe) {
            //  -> .files = [], .children = [], leaf = true
            n.files = [];
            n.children = [];
            n.leaf = true;
          }
        }
      }
    });
  }

  private makeOElist() {
    this.oelist.sort( (a, b) => a.oe.localeCompare(b.oe));
    let lookup = "nasenbaer";
    let oes: FarcTreeNode[] = this.oelist.filter( (o) => {
      if (lookup !== o.oe) {
        lookup = o.oe;
        return true;
      }
      return false;
    });
    oes = oes.map( (oe) => {
      return {
        label:    oe.oe,
        size:     0,
        children: [],
        oe:       oe.oe,
        type     : FarcEntryTypes[FarcEntryTypes.strukt],
      };
    });
    oes.forEach( (oe) => {
      oe.children = this.oelist.filter( (node) => oe.label === node.oe );
      oe.size = oe.children.reduce( (n: number, node: FarcTreeNode) => n += node.size, 0);
      oe.children.forEach( (node) => {
        node.label = node.path.reduce( (s: string, p: string) => s += p + "\\", "");
      });
      oe.children.sort( (a, b) => a.label.localeCompare(b.label));
    });
    this.oelist = oes;
    console.debug("done building OE-List");
  }

}
