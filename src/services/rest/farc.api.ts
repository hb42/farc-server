/**
 * Created by hb on 29.05.16.
 */

import * as express from "express";

import {
  FarcConfigDAO,
} from "../../model";
import {
  confUSER,
  FarcDriveDocument,
  FarcEndpunktDocument,
  FarcOeDocument,
  FarcTreeNode,
  LoggerService,
  RestApi,
} from "../../shared/ext";
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

  public get path(): string {
    return "/farc";
  }
  private farcTree: FarcTree;
  private debug: boolean;
  private configDAO: FarcConfigDAO;
  private log = LoggerService.get("farc-server.services.rest.FarcAPI");

  constructor(private db: FarcDB) {
    this.farcTree = new FarcTree(db);
    // this.initRoutes(router);
    this.configDAO = new FarcConfigDAO(db);
    this.log.debug("c'tor FarcAPI");
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
          res.json(this.farcTree.getTree(this.getOE(req), this.getUID(req), this.isAdmin(req)));
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

    // --- OE-List ---
    //
    router.route("/oelist")
        .get((req: express.Request, res: express.Response) => {
          res.json(this.farcTree.getOeList(this.getOE(req), this.isAdmin(req)));
        });

    // --- Config ---
    //
    router.route("/config/:conf_name")
        .all((req: express.Request, res: express.Response, next) => {
          req["confName"] = req.params.conf_name;
          if (req["confName"] === confUSER) {
            req["confName"] = this.getUID(req);
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

    router.route("/whoami")
        .get((req: express.Request, res: express.Response) => {
          res.json({uid: this.getUID(req), name: req["session"]["user"]["u"]["name"],
                    vorname: req["session"]["user"]["u"]["vorname"], mail: req["session"]["user"]["u"]["mail"]});
        });
    // --- isAdmin ---
    //
    router.route("/isadmin")
        .get((req: express.Request, res: express.Response) => {
          res.json({isadmin: this.isAdmin(req)});
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

    // --- Endpunkt ---
    //
    router.route("/eps")
        .get((req: express.Request, res: express.Response) => {
          this.db.farcEndpunktModel.find().exec()
              .then((eps: FarcEndpunktDocument[]) => res.json(eps));
        })
        .post((req: express.Request, res: express.Response) => {
          const ep: FarcEndpunktDocument = req.body.endpunkt;
          const oe = req.body.oe;
          this.db.farcEndpunktModel.findById(ep._id).exec()
              .then( (epRec) => {
                epRec.oe = oe;
                epRec.save()
                    .then( (rc) => {  // rc == geaenderter EP
                      console.info("EP saved " + rc);
                      res.json(rc);
                    })
                    .catch( (err) => {
                      console.error("error updating EP " + ep.above + " " + ep.endpunkt);
                      res.json(err);
                    });
              });

        });

    // --- Vormerkungen ---
    //
    router.route("/vormerkung")
        .get((req: express.Request, res: express.Response) => {
          const uid = this.isAdmin(req) ? null : this.getUID(req);
          this.farcTree.getVormerkung(uid).then( (vor: FarcTreeNode[]) => {
            res.json(vor);
          });
        })
        .post((req: express.Request, res: express.Response) => {
          const vor: FarcTreeNode[] = req.body;
          this.farcTree.saveVormerkung(vor).then( (rc) => {
            res.json(rc);
          });
        });
  }

  private isAdmin(req: express.Request): boolean {
    return !!req["session"]["user"]["admin"];
  }

  private getUID(req: express.Request): string {
    return req["session"]["user"]["u"]["uid"];
  }

  private getOE(req: express.Request): string {
    return req["session"]["user"]["oe"]["name"];
  }

}
