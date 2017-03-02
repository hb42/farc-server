/**
 * Client-Zugriffe auf Tree erledigen
 *
 * Created by hb on 04.09.16.
 */

// import * as R from "ramda";

import {
  ARCHIVE_NAME,
  FarcDriveDocument,
  FarcEndpunktDocument,
  FarcEntryDocument,
  FarcEntryTypes,
  FarcSelectType,
  FarcSession,
  FarcTreeNode,
} from "@hb42/lib-farc";

import {
  FarcDB,
} from "../backend";

export class FarcTree {

  private tree: FarcTreeNode[];  // Baum ab Drive bis EP (Rest holt Client bei Bedarf)

  constructor(private db: FarcDB) {
    this.makeTrees().then( (tree) => {
      this.tree = tree;
    });
  }

  /**
   * Baum ab Drive bis zu den EP zusammensetzen
   *
   * @returns {any}
   */
  public makeTrees(): Promise<FarcTreeNode[]> {
    // fn's deklarieren (kleiner Versuch im funktionalen Programmieren)
    const drives = (select) => this.db.farcDriveModel.find(select);
    const buildTrees = (drvs) => {
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
    return drives( {} ).then( (drvs) => buildTrees(drvs) );
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
    };

    return this.db.farcEndpunktModel.find({drive: drive._id}).exec().then((result) => {
      result.forEach( (ep: FarcEndpunktDocument) => {
        let node: FarcTreeNode = driveroot;
        // Pfad ab drive zum EP aufbauen
        const above: string[] = ep.above ? ep.above.split("/") : [];
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
        this.db.farcEntryModel.findOne({parent: ep._id, arc: archive}).exec().then( (epEntry: FarcEntryDocument) => {
          if (epEntry) {
            const epnode: FarcTreeNode = {
              entryid  : epEntry.key,
              label    : epEntry.label,
              timestamp: epEntry.timestamp,
              size     : epEntry.size,
              children : null, // null => Client muss Daten holen, keine Daten == <FarcTreeNode[]> []
              files    : null, // dto.
              entrytype: FarcEntryTypes.ep,
              arc      : epEntry.arc,
              path     : epEntry.path, // node.path.concat(ep.endpunkt),
              leaf     : epEntry.leaf,
              selected : FarcSelectType.none,
              type     : FarcEntryTypes[FarcEntryTypes.ep],
            };
            node.children.push(epnode);
          }
        });
      });
      return driveroot;
    });
  }

  public testQ() {
    //
  }

  public getTree(session: FarcSession): FarcTreeNode[] {
    // tree kopieren
    const tr = JSON.parse(JSON.stringify(this.tree));
    // TODO anhand session.roles EPs ein-/ausblenden
    //  -> .files = [], .children = [], leaf = true || .files = null, .children = null, .leaf ?

    return tr;
  }
  /**
   * Unterverzeichnisse fuer Knoten holen
   *
   * @param key - id des Knotens
   * @returns {Promise<FarcTreeNode[]>}
   */
  public getChildren(key: string): Promise<FarcTreeNode[]> {
    return this.getEntriesFor(key, FarcEntryTypes.dir);
  }

  /**
   * Dateien fuer einen Knoten holen
   *
   * @param key - id des Knotens
   * @returns {Promise<FarcTreeNode[]>}
   */
  public getFiles(key: string): Promise<FarcTreeNode[]> {
    return this.getEntriesFor(key, FarcEntryTypes.file);
  }

  /**
   * get drives -> admin
   * -> admin-modul?
   */
  public getDrives() {
    return this.db.farcDriveModel.find().exec();
  }

  /**
   * Eintraege fuer einen Knoten holen
   *
   * @param key - id des Knotens
   * @param typ - Knoten-Typ
   * @returns {Promise<FarcTreeNode[]>}
   */
  private getEntriesFor(key: string, typ: FarcEntryTypes): Promise<FarcTreeNode[]> {
    return this.db.farcEntryModel.find({parent: key, type: typ}).exec().then( (entries: FarcEntryDocument[]) => {
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
   * Unterverzeichnisebene unter path holen.
   */
  // FIXME verwendet: FarcTreeNode type, data (aendern!)/ FarcTreeDocument tree/ FarcEndpunktDocument roles
  // public getSubdirsFor(path: string[], userroles: string[]): Promise<FarcTreeNode>[] {
  //   let nodes: FarcTreeNode[] = this.findSubdirs(this.tree, path);
  //   return nodes.map( (n: FarcTreeNode, idx: number) => {
  //     // FIXME
  //     if (n.type === "e" && n.data.tree) {  // FIXME EP nicht in .data
  //       // EP aus der DB holen und in this.tree eintragen
  //       // TODO Benutzer-Rechte pruefen -> n.data.roles <-> userroles (evtl. in extra Obj. auslagern)
  //       // return farcTreeModel.findById(n.data.tree).exec().then( (tree: FarcTreeDocument) => {
  //       //   nodes[idx] = tree.tree;
  //       //   // FIXME data format/ transform
  //       //   return {
  //       //     label    : tree.tree.label,
  //       //     leaf     : tree.tree.children.length > 0 ? false : true,  // w/lazy loading
  //       //     timestamp: tree.tree.timestamp,
  //       //     size     : tree.tree.size,
  //       //     treesize : tree.tree.treesize,
  //       //     files    : tree.tree.files,
  //       //     type     : tree.tree.type,
  //       //     arc      : tree.tree.arc,
  //       //     path     : n.path,
  //       //   };
  //       // });
  //     } else {
  //       // vorhandenes dir liefern
  //       // TODO Benutzer-Rechte pruefen -> n.data.roles <-> userroles (evtl. in extra Obj. auslagern)
  //       return new Promise( (resolve, reject) => {
  //         // FIXME data format/ transform
  //         resolve( {
  //                    label    : n.label,
  //                    leaf     : n.children.length > 0 ? false : true,  // w/lazy loading
  //                    timestamp: n.timestamp,
  //                    size     : n.size,
  //                    files    : n.files,
  //                    type     : n.type,
  //                    arc      : n.arc,
  //                    path     : n.path,
  //                  } );
  //       });
  //     }
  //   });
  // }

  /*
   * Unterverzeichnisebene unter path holen.
   * Wenn path === [] || undefined wird die oberste Ebene geliefert
   */
  // FIXME verwendet FarcTreeNode label, children
  // private findSubdirs(tree: FarcTreeNode[], path: string[]): FarcTreeNode[] {
  //   if (!path) {
  //     return tree;
  //   }
  //   path.forEach(p => {
  //     if (tree) {
  //       let res: FarcTreeNode = tree.reduce((n1, n2) => n2.label === p ? n2 : n1, null);
  //       tree = res ? res.children : null;
  //     }
  //   });
  //   return tree;
  // }

}
