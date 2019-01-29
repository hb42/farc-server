/**
 * Client-Zugriffe auf Tree erledigen
 *
 */

import {
  ARCHIVE_NAME,
  FarcDriveDocument,
  FarcDriveTypes,
  FarcEndpunktDocument,
  FarcEntryDocument,
  FarcEntryTypes,
  FarcOeDocument, FarcResultDocument,
  FarcSelectType,
  FarcTreeNode, sseNEWTREE,
} from "@hb42/lib-farc";
import {
  LoggerService,
} from "@hb42/lib-server";

import {
  FarcDB,
  ServiceHandler,
} from "../backend";

export class FarcTree {

  public noOE = "Keine Zuordnung";

  private log = LoggerService.get("farc-server.services.data.FarcTree");
  private db: FarcDB;
  private tree: FarcTreeNode[];  // Baum ab Drive bis EP (Rest holt Client bei Bedarf)

  private oelist: FarcTreeNode[] = [];

  constructor(private services: ServiceHandler) {
    this.log.debug("start makeTrees");
    this.db = services.db;
    this.makeTrees().then((tree) => {
      this.tree = tree;
      this.log.debug("calc");
      this.calcSize();
      this.log.debug("end makeTrees");
      // Signal an Client
      this.services.sendSSE("new tree", sseNEWTREE);
    });
  }

  // DEBUG output
  public debug() {
      const pc = (node: FarcTreeNode, tab: string) => {
        if (node.children) {
          node.children.sort((a: FarcTreeNode, b: FarcTreeNode) =>
                                 a.label ? (b.label ? a.label.localeCompare(b.label) : 1) : (b.label ? -1 : 0));
          node.children.forEach((ch) => {
            this.log.trace(tab + ch.label + " (" + ch.size + ")");
            pc(ch, tab + "  ");
          });
        }
      };
      this.tree.forEach((node: FarcTreeNode) => {
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
      drvs.forEach((drv: FarcDriveDocument) => {
        promises.push(this.makeDriveTree(drv, false));
        promises.push(this.makeDriveTree(drv, true));
      });
      return Promise.all(promises);
    };
    return drives({})
        .then((drvs) => buildTrees(drvs))
        .then((tree) => {
          this.makeOElist();
          return tree.sort((d1, d2) => {
            // Laufwerke sortieren
            if (d1.arc === d2.arc) {
              return d1.label ? (d2.label ? d1.label.localeCompare(d2.label) : 1) : (d2.label ? -1 : 0);
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
      timestamp: undefined,
      size     : 0,
      children : [] as FarcTreeNode[],
      files    : undefined,
      entrytype: FarcEntryTypes.strukt,
      arc      : archive,
      path     : [drivename],
      entryid  : undefined,
      leaf     : false,
      selected : FarcSelectType.none,
      type     : FarcEntryTypes[FarcEntryTypes.strukt],
      drive    : drive.type,
    };

    return this.db.farcEndpunktModel.find({drive: drive._id}).lean().exec().then((result) => {
      return Promise.all(result.map((ep: FarcEndpunktDocument) => {
        let node: FarcTreeNode = driveroot;
        // Pfad ab drive zum EP aufbauen
        const above: string[] = ep.above ? ep.above.split("/") : [];
        above.push(ep.endpunkt);
        above.forEach((dir) => {
          const ch: FarcTreeNode[] = node.children ? node.children.filter((n) => dir === n.label) : [];
          if (ch && ch.length === 1) {
            node = ch[0];
          } else {
            const child: FarcTreeNode = {
              label     : dir,
              timestamp: undefined,
              size     : 0,
              children : [] as FarcTreeNode[],
              files    : undefined,
              entrytype: FarcEntryTypes.strukt,
              arc      : archive,
              path     : node.path ? node.path.concat(dir) : [],
              entryid  : undefined,
              leaf     : false,
              selected : FarcSelectType.none,
              type     : FarcEntryTypes[FarcEntryTypes.strukt],
            };
            if (!node.children) {
              node.children = [];
            }
            node.children.push(child);
            node = child;
          }
        });
        return this.db.farcEntryModel.findOne({parent: ep._id.toString(), arc: archive}).lean().exec()
            .then((epEntry: FarcEntryDocument) => {
          if (epEntry) {
            // Endpunkt
            node.entryid = epEntry.key;
            node.timestamp = epEntry.timestamp ? epEntry.timestamp : undefined;
            node.size = epEntry.size;
            node.children = undefined;
            node.files = undefined;
            node.entrytype = FarcEntryTypes.ep;
            node.arc = epEntry.arc;
            node.leaf = epEntry.leaf;
            node.type = FarcEntryTypes[FarcEntryTypes.ep];
            return this.db.farcOeModel.findById(ep.oe).lean().exec()
                  .then((oe: FarcOeDocument) => {
                    node.oe = oe ? oe.name : this.noOE;
                    if (!node.arc) {
                      this.oelist.push({
                        entryid:  node.entryid,
                        label:    node.label,
                        size:     node.size,
                        children: [],
                        path:     node.path,
                        oe:       node.oe,
                        type:     node.type,
                                       });
                    }
                  });
          }
        });
      })).then(() => driveroot);
    });
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
    this.log.debug("## start getFiles");
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
      ol.forEach((o) => {
        if (o.label !== useroe) {
          o.children = [];
        }
      });
    }
    return ol;
  }

  /**
   * Vormerkungen eines Benutzers holen.
   * Wenn admin werden alle Vormerkungen geliefert.
   *
   * @param uid - User-ID
   * @param admin
   * @returns {Promise<FarcTreeNode[]>}
   */
  public getVormerkung(uid: string, admin: boolean): Promise<FarcTreeNode[]> {
    const search = admin ? {selected: {$gt: 0} } : {selectUid: uid, selected: {$gt: 0} } ;
    return this.getEntriesFor(search);
  }

  /**
   * Vormerkungen speichern
   *
   * @param vor
   * @returns {Promise<string>}
   */
  public saveVormerkung(vor: FarcTreeNode[]): Promise<string> {
    const result: Array<Promise<string>> = vor.map((v) => {
      return this.db.farcEntryModel.findOne({key: v.entryid}).exec().then((entry) => {
        if (entry) {
          entry.selectDate = v.selectDate;
          entry.selectUid = v.selectUid;
          entry.selected = v.selected;
          return entry.save()
              .then((rc) => "OK")
              .catch((e) => "Fehler beim Speichern von " + v.label + " " + e);
        } else {
          return "Kein Datensatz für " + v.label;
        }
      });
    });
    return Promise.all(result).then((res) => {
      let ret = "";
      res.forEach((s) => {
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
   * Ergebnisse eines Benutzers holen.
   * Wenn admin werden alle Ergebnisse geliefert.
   *
   * @param uid - User-ID
   * @param admin
   * @returns {Promise<FarcResultDocument[]>}
   */
  public getResult(uid: string, admin: boolean): Promise<FarcResultDocument[]> {
    const search = admin ? {selected: {$gt: 0} } : {selectUid: uid, selected: {$gt: 0} } ;
    return this.db.farcResultModel.find(search).lean().exec().then((entries: FarcResultDocument[]) => {
      return entries;
    });
  }

  /**
   * Eintraege fuer einen Knoten holen
   *
   * @returns {Promise<FarcTreeNode[]>}
   * @param search - Bedingungen
   */
  private getEntriesFor(search: any): Promise<FarcTreeNode[]> {
    return this.db.farcEntryModel.find(search).lean().exec().then((entries: FarcEntryDocument[]) => {
      return entries.map((entry: FarcEntryDocument) => {
        return {
          entryid:    entry.key,
          label:      entry.label,
          timestamp:  entry.timestamp ? entry.timestamp : undefined,
          size:       entry.size,
          children:   undefined,
          files:      undefined,
          entrytype:  entry.type,
          arc:        entry.arc,
          path:       entry.path,
          leaf:       entry.leaf,
          selected:   entry.selected,
          selectUid:  entry.selectUid,
          selectDate: entry.selectDate,
          type:       FarcEntryTypes[entry.type],
        };
      });
    }).catch((e) => {
      this.log.info("**** ERROR " + e);
      return [];
    });
  }

  /*
    EP-size nach oben aufsummieren
   */
  private calcSize() {
    this.tree.forEach((drv) => {
      drv.size = drv.children ? this.recurseCalc(drv.children) : 0;
    });
  }
  private recurseCalc(nodes: FarcTreeNode[]): number {
    return nodes.reduce((s: number, n: FarcTreeNode) => {
      if (n.children) {
        n.size = this.recurseCalc(n.children);
      }
      s += n.size ? n.size : 0;
      return s;
    }, 0);
  }

  private setUserFor(tree: FarcTreeNode[], oe: string, userid: string) {
    tree.forEach((drv) => {
      if (drv.drive === FarcDriveTypes.home) {
        const user = userid ? userid.toUpperCase() : "";
        if (drv.children) {
          drv.children = drv.children.filter((c) => user === c.label ? c.label.toUpperCase() : "");
        }
      } else {
        this.recurseUser(drv.children ? drv.children : [], oe);
      }
    });
  }
  private recurseUser(nodes: FarcTreeNode[], oe: string) {
    nodes.forEach((n) => {
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
    this.oelist.sort((a, b) => a.oe ? (b.oe ? a.oe.localeCompare(b.oe) : 1) : (b.oe ? -1 : 0));
    let lookup = "nasenbaer";
    let oes: FarcTreeNode[] = this.oelist.filter((o) => {
      if (lookup !== o.oe) {
        lookup = o.oe ? o.oe : "";
        return true;
      }
      return false;
    });
    oes = oes.map((oe) => {
      return {
        label:    oe.oe,
        size:     0,
        children: [],
        oe:       oe.oe,
        type     : FarcEntryTypes[FarcEntryTypes.strukt],
      };
    });
    oes.forEach((oe) => {
      oe.children = this.oelist.filter((node) => oe.label === node.oe);
      oe.size = oe.children.reduce((n: number, node: FarcTreeNode) => n += (node.size ? node.size : 0), 0);
      oe.children.forEach((node) => {
        node.label = node.path ? node.path.reduce((s: string, p: string) => s += p + "\\", "") : "";
      });
      oe.children.sort((a, b) => a.label ? (b.label ? a.label.localeCompare(b.label) : 1) : (b.label ? -1 : 0));
    });
    this.oelist = oes;
    this.log.debug("done building OE-List");
  }

}
