/**
 * Created by hb on 29.05.16.
 */

import * as express from "express";

import {FarcTreeNode} from "@hb42/lib-farc";
import { RestApi } from "@hb42/lib-server";

import {
  FarcDB,
  FarcFilesystem,
  FarcTree,
} from "../services";

/**
 * REST-API fuer farc
 */
export class FarcAPI implements RestApi {
  private farcTree: FarcTree;
  private debug: boolean;

  constructor(private db: FarcDB) {
    this.farcTree = new FarcTree(db);
    // this.initRoutes(router);

  }

  public setDebug(dbg: boolean) {
    this.debug = dbg;      
  }
  
  public initRoute(router: express.Router) {
    console.info("farc.api init router");
    // DEBUG
    router.use( (req: express.Request, res: express.Response, next) => {
      // do logging
      // if (this.debug) {
      //   console.log("Router " );
      //   console.log("-----------------------");  // z.B. http://localhost:1234/api/test?a=A&b=B
      //   console.log("authenticatedUser: ");
      //   console.dir(req.authenticatedUser);      // undefined ?
      //   console.log("protocol: ");
      //   console.dir(req.protocol);               // "http"
      //   console.log("hostname: ");
      //   console.dir(req.hostname);               // "localhost"
      //   console.log("baseUrl: ");
      //   console.dir(req.baseUrl);                // "/api"
      //   console.log("path: ");
      //   console.dir(req.path);                   // "/test"
      //   console.log("query: ");
      //   console.dir(req.query);                  // { a: "A", b: "B" }
      //   console.log("url: ");
      //   console.dir(req.url);                    // "/test?a=A&b=B"
      //   console.log("originalUrl: ");
      //   console.dir(req.originalUrl);            // "/api/test?a=A&b=B"
      //   console.log("method: ");
      //   console.dir(req.method);                 // "GET"
      //   console.log("headers: ");
      //   console.dir(req.headers);                // { host: ..., connection: ..., etc. }
      //   console.log("params: ");
      //   console.dir(req.params);                 // { }
      //
      // }

      // let testHeader = req.headers["x-session-id"];
      // if (testHeader) {
      //   // check value -> session handler
      //   console.info("[API] test header: " + testHeader);
      //   next(); // make sure we go to the next routes and don"t stop here
      // } else {
      //   console.info("[API] header not found!");
      //   res.sendStatus(403); // zu 401 aendern
      // }

      next();

    });

    router.route("/test")
        .get((req: express.Request, res: express.Response) => {
          // let result = this.farcDAO.getEps();
          //
          // console.info("/test " + result);
          // result.then(r => {
          //   console.info("@then");
          //   res.json(r);
          //
          // });
          this.farcTree.testQ(); // .then( rc => console.dir(rc) );

        });

    // Baum bis zu den EPs holen
    router.route("/tree")
        .get((req: express.Request, res: express.Response) => {
          res.json(this.farcTree.getTree(<any> req["session"]));
        });
    // naechste Verzeichnisebene holen (req.body -> {entryid: id})
    router.route("/children")
        .post((req: express.Request, res: express.Response) => {
          this.farcTree.getChildren(req.body.entryid).then( (nodes: FarcTreeNode[]) => res.json(nodes));
        });
    // Dateien fuer Verzeichnis holen (req.body -> {entryid: id})
    router.route("/files")
        .post((req: express.Request, res: express.Response) => {
          this.farcTree.getFiles(req.body.entryid).then( (nodes: FarcTreeNode[]) => res.json(nodes));
        });
    // router.route("/fulltree")
    //     .get((req: express.Request, res: express.Response) => {
    //       this.farcReadDir.makeTrees().then( tree => { res.json(tree); });
    //
    //     });

    router.route("/readtree")
        .get((req: express.Request, res: express.Response) => {
          let fs: FarcFilesystem = new FarcFilesystem(this.db);
          fs.read();
          res.json("read dirs running...");
           // TODO refresh browser
        });

    // router.route("/subdir")
    //     .post((req: express.Request, res: express.Response) => {
    //       console.info("/testpath");
    //       console.dir(req.body);
    //       // TODO hier waere zu pruefen, ob req.body.path vorhanden und gueltiges array
    //       // TODO Session-Zugriff zentralisieren
    //       Promise.all(this.farcReadDir.getSubdirsFor(req.body.path, req["session"]["user"].roles))
    //           .then( (nodes: FarcTreeNode[]) => { res.json(nodes); } );
    //       // this.farcReadDir.getSubdirsFor(req.body.path).then( rc => { console.dir(rc); res.json(rc)} );
    //
    //     });
  }

}
