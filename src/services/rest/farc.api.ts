/**
 * Created by hb on 29.05.16.
 */

import * as express from "express";

import {
  confUSER,
  FarcDriveDocument,
  FarcOeDocument,
  FarcTreeNode,
} from "@hb42/lib-farc";
import { RestApi } from "@hb42/lib-server";

import {
  FarcConfigDAO,
} from "../../model";
import {
  FarcDB,
} from "../backend";
import {
  FarcFilesystem,
  FarcTree,
} from "../data";

/**
 * REST-API fuer farc
 */
export class FarcAPI implements RestApi {
  private farcTree: FarcTree;
  private debug: boolean;
  private configDAO: FarcConfigDAO;

  constructor(private db: FarcDB) {
    this.farcTree = new FarcTree(db);
    // this.initRoutes(router);
    this.configDAO = new FarcConfigDAO(db);

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

    // --- Tree ---
    //
    // Baum bis zu den EPs holen
    router.route("/tree")
        .get((req: express.Request, res: express.Response) => {
          res.json(this.farcTree.getTree(req["session"] as any));
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
          const fs: FarcFilesystem = new FarcFilesystem(this.db);
          fs.read();
          res.json("read dirs running...");
           // TODO refresh browser
        });

    // --- Config ---
    //
    router.route("/config/:conf_name")
        .all((req: express.Request, res: express.Response, next) => {
          req["confName"] = req.params.conf_name;
          if (req["confName"] === confUSER) {
            req["confName"] = req["session"]["user"]["uid"];
          }
          next();
        })
        .get((req: express.Request, res: express.Response) => {
          this.configDAO.findConfig(req["confName"]).then( (val) => res.json(val) );
        })
        .post((req: express.Request, res: express.Response) => {
          const conf: any = req.body;
          this.configDAO.updateConfig(req["confName"], conf).then( (val) => res.json(val.value) );
        })
        .delete((req: express.Request, res: express.Response) => {
          this.configDAO.delete(req["confName"]).then( (rc) => res.json(rc) );
        });

    // --- Drive ---
    //
    router.route("/drives")
        .get((req: express.Request, res: express.Response) => {
          this.farcTree.getDrives().then((drvs: FarcDriveDocument[]) => res.json(drvs));
        })
        .post((req: express.Request, res: express.Response) => {
          const drive: FarcDriveDocument = req.body;
          console.dir(drive);
          if (drive._id) {
            this.db.farcDriveModel.findByIdAndUpdate(drive._id,
                                                     {
                                                       displayname: drive.displayname,
                                                       sourcepath : drive.sourcepath,
                                                       archivepath: drive.archivepath,
                                                       type       : drive.type,
                                                     }, {new: true}).exec()
                .then((result: FarcDriveDocument) => {
                  console.info("post save");
                  console.dir(result);
                  res.json(result);
                })
                .catch((err) => {
                  console.info("error saving drive " + err);
                  res.json(err);  // TODO besseres Fehlerhandling
                });
          } else {
            this.db.farcDriveModel.create(drive)
                .then( (result) => {
                  console.info("post create");
                  console.dir(result);
                  res.json(result);
                })
                .catch( (err) => {
                  console.info("error creating drive " + err);
                  res.json(err);  // TODO besseres Fehlerhandling
                });
          }
        })
        // Laufwerk loeschen (incl. EPs f. drive)
        .delete((req: express.Request, res: express.Response) => {
          const drive: FarcDriveDocument = req.body;
          console.info(drive);
          console.dir(req)
          this.db.farcDriveModel.findByIdAndRemove(drive._id).exec()
              .then( (r) => {
                this.db.farcEndpunktModel.remove({drive: drive._id}).exec()
                    .then( (ep) => {
                      res.json(r);
                    })
                    .catch( (eperr) => {
                      console.info("error deleting EPs " + eperr);
                      res.json(eperr);
                    });
              })
              .catch( (err) => {
                console.info("error deleting drive " + err);
                res.json(err);
              });
        });

    // --- OE ---
    //
    router.route("/oes")
        .get((req: express.Request, res: express.Response) => {
          this.db.farcOeModel.find().exec()
              .then((oes: FarcOeDocument[]) => res.json(oes));
        })
        .post((req: express.Request, res: express.Response) => {
          const oe: FarcOeDocument = req.body;
          if (oe._id) {
            // this.db.farcOeModel.findByIdAndUpdate(oe._id, -> klappt nicht - Fehler wg. roles: FarcRole[]
            this.db.farcOeModel.findById(oe._id).exec()
                .then( (oeRec: FarcOeDocument) => {
                  oeRec.roles = oe.roles;
                  oeRec.name = oe.name;
                  oeRec.save()
                      .then( (ob) => {
                        console.info("OE saved");
                        console.dir(ob);
                      })
                      .catch( (er) => {
                        console.error("error saving OE " + oe.name);
                        res.json(er);
                      });
                })
                .catch( (err) => {
                  console.error("error finding OE " + oe.name);
                  res.json(err);
                });
          } else {
            this.db.farcOeModel.create(oe)
                .then( (result) => {
                  console.info("post create");
                  console.dir(result);
                  res.json(result);
                })
                .catch( (err) => {
                  console.info("error creating OE " + err);
                  res.json(err);  // TODO besseres Fehlerhandling
                });
          }
        })
        .delete((req: express.Request, res: express.Response) => {
          const oe: FarcOeDocument = req.body;
          this.db.farcOeModel.findByIdAndRemove(oe._id).exec()
              .then( (r) => {
                res.json(r);
              })
              .catch( (err) => {
                console.info("error deleting OE " + err);
                res.json(err);
              });
        });
  }

}
