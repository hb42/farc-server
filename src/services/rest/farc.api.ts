/**
 * Created by hb on 29.05.16.
 */

import * as express from "express";
import * as fs from "fs";
import * as os from "os";

import {
  confCRON, confEXECVORM, confMAXERL,
  confPACK, confREADTREE,
  confUSER,
  FarcDriveDocument,
  FarcEndpunktDocument,
  FarcOeDocument, FarcResultDocument,
  FarcTreeNode, getConfigValue,
} from "@hb42/lib-farc";
import {
  LoggerService,
  RestApi,
} from "@hb42/lib-server";

import {
  FarcSession,
} from ".";
import {
  FarcConfigDAO,
} from "../../model";
import {
  FarcDB,
  ServiceHandler,
} from "../backend";
import {
  DataEventEmitter,
  FarcTree,
} from "../data";

/**
 * REST-API fuer farc
 */
export class FarcAPI implements RestApi {

  public get path(): string {
    return "/farc";
  }
  private db: FarcDB;
  private farcTree: FarcTree;
  private debug: boolean;
  private configDAO: FarcConfigDAO;
  private dataEventHandler: DataEventEmitter;
  private log = LoggerService.get("farc-server.services.rest.FarcAPI");

  constructor(private services: ServiceHandler) {
    this.db = services.db;
    this.buildTree();
    this.configDAO = new FarcConfigDAO(services.db);
    this.log.debug("c'tor FarcAPI");
    // this.vormerkHandler = services.vormerkHandler;

    this.dataEventHandler = services.dataEventHandler;
    if (this.dataEventHandler.listenerCount(this.dataEventHandler.evtReadFsReady) > 0) {
      this.dataEventHandler.removeAllListeners(this.dataEventHandler.evtReadFsReady);
    }
    // Dateien wurden neu eingelesen
    this.dataEventHandler.on(this.dataEventHandler.evtReadFsReady, () => {
      this.log.info("Tree erneut einlesen");
      // buildTree() -> FarcTree c'tor sendet SSE "newtree"
      this.buildTree();
    });

  }

  public setDebug(dbg: boolean) {
    this.debug = dbg;
  }

  public buildTree() {
    this.farcTree = new FarcTree(this.services);
  }

  public initRoute(router: express.Router) {

    this.log.info("farc.api init router");
    // DEBUG
    router.use((req: express.Request, res: express.Response, next) => {
      // do logging
      // if (this.debug) {
      //   this.log.log("Router " );
      //   this.log.log("-----------------------");  // z.B. http://localhost:1234/api/test?a=A&b=B
      //   this.log.log("authenticatedUser: ");
      //   this.log.dir(req.authenticatedUser);      // undefined ?
      //   this.log.log("protocol: ");
      //   this.log.dir(req.protocol);               // "http"
      //   this.log.log("hostname: ");
      //   this.log.dir(req.hostname);               // "localhost"
      //   this.log.log("baseUrl: ");
      //   this.log.dir(req.baseUrl);                // "/api"
      //   this.log.log("path: ");
      //   this.log.dir(req.path);                   // "/test"
      //   this.log.log("query: ");
      //   this.log.dir(req.query);                  // { a: "A", b: "B" }
      //   this.log.log("url: ");
      //   this.log.dir(req.url);                    // "/test?a=A&b=B"
      //   this.log.log("originalUrl: ");
      //   this.log.dir(req.originalUrl);            // "/api/test?a=A&b=B"
      //   this.log.log("method: ");
      //   this.log.dir(req.method);                 // "GET"
      //   this.log.log("headers: ");
      //   this.log.dir(req.headers);                // { host: ..., connection: ..., etc. }
      //   this.log.log("params: ");
      //   this.log.dir(req.params);                 // { }
      //
      // }

      // let testHeader = req.headers["x-session-id"];
      // if (testHeader) {
      //   // check value -> session handler
      //   this.log.info("[API] test header: " + testHeader);
      //   next(); // make sure we go to the next routes and don"t stop here
      // } else {
      //   this.log.info("[API] header not found!");
      //   res.sendStatus(403); // zu 401 aendern
      // }

      next();

    });

    router.route("/test")
        .get(async (req: express.Request, res: express.Response) => {
          const conf = await this.configDAO.findConfig(confMAXERL);
          const days = conf ? getConfigValue(conf) : 90;
          this.log.debug("##TEST## testing for " + days + " days");
          this.log.debug("##TEST## typeof days: " + typeof days);
          const maxdate = new Date().getTime() - days * 24 * 60 * 60 * 1000;
          this.db.farcResultModel.find({processDate: {$lt: maxdate}}).exec()
              .then((results: FarcResultDocument[]) => {
                if (results) {
                  this.log.debug("##TEST## count: " + results.length);
                  res.json(results);
                } else {
                  this.log.debug("##TEST## nothing found ");
                  res.json("nothing found");
                }
          });
          // // alles einlesen
          // this.services.readAll();
          // // nicht auf's Einlesen warten
          // res.json("runnning ... ");
          // this.services.sendSSE("SSE test " + new Date().toLocaleString());
          // res.json("sent SSE");
        });

    // --- Tree ---
    //
    // Baum bis zu den EPs holen
    router.route("/tree")
        .get((req: express.Request, res: express.Response) => {
          const sess: FarcSession = this.getSessionData(req);
          res.json(this.farcTree.getTree(sess.oe, sess.uid, sess.admin));
        });
    // naechste Verzeichnisebene holen (req.body -> {entryid: id})
    router.route("/children/:entryid")
        .get((req: express.Request, res: express.Response) => {
          this.farcTree.getChildren(req.params.entryid).then((nodes: FarcTreeNode[]) => res.json(nodes));
        });
    // Dateien fuer Verzeichnis holen (req.body -> {entryid: id})
    router.route("/files/:entryid")
        .get((req: express.Request, res: express.Response) => {
          this.log.debug("## GET /files/" + req.params.entryid);
          this.farcTree.getFiles(req.params.entryid).then((nodes: FarcTreeNode[]) => {
            this.log.debug("## GET return " + nodes.length + " entries");
            res.json(nodes);
          });
        });

    // --- OE-List ---
    //
    router.route("/oelist")
        .get((req: express.Request, res: express.Response) => {
          const sess: FarcSession = this.getSessionData(req);
          res.json(this.farcTree.getOeList(sess.oe, sess.admin));
        });

    // --- Config ---
    //
    router.route("/config/:conf_name")
        .all((req: express.Request | any, res: express.Response, next) => {
          req["confName"] = req.params.conf_name;
          // wenn hier ein confName "USER_xxxx" auftaucht, auf den aktuellen Benutzer
          // umsetzen. Koennte ein Fehler sein oder ein Manipulationsversuch. So bekommt
          // der User immer nur seine eigenen Daten.
          if (req["confName"] === confUSER || req["confName"].startsWith("USER_")) {
            req["confName"] = "USER_" + this.getSessionData(req).uid;
          }
          if (req["confName"] === confPACK) {
            const pack = JSON.parse(fs.readFileSync("./package.json", "utf8"));
            // Ueberfluessiges rauswerfen, die Anwendung bekommt Version, Author, etc.
            delete pack.scripts;
            delete pack.dependencies;
            delete pack.devDependencies;
            delete pack.repository;
            delete pack.publishConfig;
            pack["versions"] = [ os.type() + " " + os.release(),
                                "node.js " + process.versions.node,
                                "MongoDB " + this.db.mongo.mongodbVersion];
            res.json(pack);
          } else {
            next();
          }
        })
        .get((req: express.Request | any, res: express.Response) => {
          this.configDAO.findConfig(req["confName"]).then((val) => res.json(val));
        })
        .post((req: express.Request | any, res: express.Response) => {
          const conf: any = req.body;
          this.configDAO.updateConfig(req["confName"], conf).then((val) => {
            // TODO DEBUG
            if (req["confName"] === confCRON || req["confName"] === confREADTREE || req["confName"] === confEXECVORM) {
              this.log.debug("CRON POST /config/" + req["confName"] + " val=" + conf);
              this.services.setCron();
            }
            res.json(val.value);
          });
        })
        .delete((req: express.Request | any, res: express.Response) => {
          this.configDAO.delete(req["confName"]).then((rc) => res.json(rc));
        });

    // --- Drive ---
    //
    router.route("/drives")
        .get((req: express.Request, res: express.Response) => {
          this.farcTree.getDrives().then((drvs: FarcDriveDocument[]) => res.json(drvs));
        })
        .post((req: express.Request, res: express.Response) => {
          if (!this.getSessionData(req).admin) {
            return;
          }
          const drive: FarcDriveDocument = req.body;
          this.log.info(drive);
          if (drive._id) {
            this.db.farcDriveModel.findByIdAndUpdate(drive._id,
                                                     {
                                                       displayname : drive.displayname,
                                                       source_path : drive.source_path,
                                                       archive_path: drive.archive_path,
                                                       type        : drive.type,
                                                       user_s      : drive.user_s,
                                                       pwd_s       : drive.pwd_s,
                                                       user_a      : drive.user_a,
                                                       pwd_a       : drive.pwd_a,
                                                     }, {new: true}).exec()
                .then((result: FarcDriveDocument) => {
                  this.log.info("post save");
                  this.log.info(result);
                  res.json(result);
                })
                .catch((err) => {
                  this.log.info("error saving drive " + err);
                  res.json(err);  // TODO besseres Fehlerhandling
                });
          } else {
            this.db.farcDriveModel.create(drive)
                .then((result) => {
                  this.log.info("post create");
                  this.log.info(result);
                  res.json(result);
                })
                .catch((err) => {
                  this.log.info("error creating drive " + err);
                  res.json(err);  // TODO besseres Fehlerhandling
                });
          }
        })
        // Laufwerk loeschen (incl. EPs f. drive)
        // TODO f.delete besser param in url, nicht body!
        .delete((req: express.Request, res: express.Response) => {
          if (!this.getSessionData(req).admin) {
            return;
          }
          const drive: FarcDriveDocument = req.body;
          this.log.info(drive);
          this.log.info(req);
          this.db.farcDriveModel.findByIdAndRemove(drive._id).exec()
              .then((r) => {
                this.db.farcEndpunktModel.remove({drive: drive._id}).exec()
                    .then((ep) => {
                      res.json(r);
                    })
                    .catch((eperr) => {
                      this.log.info("error deleting EPs " + eperr);
                      res.json(eperr);
                    });
              })
              .catch((err) => {
                this.log.info("error deleting drive " + err);
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
          if (!this.getSessionData(req).admin) {
            return;
          }
          const oe: FarcOeDocument = req.body;
          if (oe._id) {
            // this.db.farcOeModel.findByIdAndUpdate(oe._id, -> klappt nicht - Fehler wg. roles: FarcRole[]
            this.db.farcOeModel.findById(oe._id).exec()
                .then((oeRec: FarcOeDocument) => {
                  oeRec.roles = oe.roles;
                  oeRec.name = oe.name;
                  oeRec.save()
                      .then((ob) => {
                        this.log.info("OE saved");
                        this.log.info(ob);
                        res.json(ob);
                      })
                      .catch((er) => {
                        this.log.error("error saving OE " + oe.name);
                        res.json(er);
                      });
                })
                .catch((err) => {
                  this.log.error("error finding OE " + oe.name);
                  res.json(err);
                });
          } else {
            this.db.farcOeModel.create(oe)
                .then((result) => {
                  this.log.info("post create");
                  this.log.info(result);
                  res.json(result);
                })
                .catch((err) => {
                  this.log.info("error creating OE " + err);
                  res.json(err);  // TODO besseres Fehlerhandling
                });
          }
        })
        .delete((req: express.Request, res: express.Response) => {
          if (!this.getSessionData(req).admin) {
            return;
          }
          const oe: FarcOeDocument = req.body;
          this.db.farcOeModel.findByIdAndRemove(oe._id).exec()
              .then((r) => {
                res.json(r);
              })
              .catch((err) => {
                this.log.info("error deleting OE " + err);
                res.json(err);
              });
        });

    // --- Endpunkt ---
    //
    router.route("/eps")
        .get((req: express.Request, res: express.Response) => {
          this.db.farcEndpunktModel.find().lean().exec()
              .then((eps: FarcEndpunktDocument[]) => res.json(eps));
        })
        // OE fuer EP aendern
        .post((req: express.Request, res: express.Response) => {
          if (!this.getSessionData(req).admin) {
            return;
          }
          const ep: FarcEndpunktDocument = req.body.endpunkt;
          const oe = req.body.oe;
          this.db.farcEndpunktModel.findById(ep._id).exec()
              .then((epRec) => {
                if (epRec) {
                  epRec.oe = oe;
                  epRec.save()
                      .then((rc) => {  // rc == geaenderter EP
                        this.log.info("EP saved " + rc);
                        res.json(rc);
                      })
                      .catch((err) => {
                        this.log.error("error updating EP " + ep.above + " " + ep.endpunkt);
                        res.json(err);
                      });
                } else {
                  this.log.error("error finding record for EP-id " + ep._id);
                  res.json("Endpunkt nicht in DB gefunden.");
                }
              });

        });

    // --- Vormerkungen ---
    //
    router.route("/vormerkung")
        .get((req: express.Request, res: express.Response) => {
          const sess: FarcSession = this.getSessionData(req);
          this.farcTree.getVormerkung(sess.uid, sess.admin).then((vor: FarcTreeNode[]) => {
            res.json(vor);
          });
        })
        .post((req: express.Request, res: express.Response) => {
          const vor: FarcTreeNode[] = req.body;
          this.farcTree.saveVormerkung(vor).then((rc) => {
            res.json(rc);
          });
        });

    router.route("/execvorm/:entryid")
        .get((req: express.Request, res: express.Response) => {
          // const vor: FarcTreeNode = req.body;
          // TODO FS
          this.services.execVormerk(req.params.entryid).then((rc) => {
            res.json(rc);
          });
          // this.vormerkHandler.runVormerkSingle(req.params.entryid).then((rc) => {
          //   res.json(rc);
          // });
        });

    router.route("/result")
        .get((req: express.Request, res: express.Response) => {
          const sess: FarcSession = this.getSessionData(req);
          this.farcTree.getResult(sess.uid, sess.admin).then((vor: FarcResultDocument[]) => {
            res.json(vor);
          });
        })
        .delete((req: express.Request, res: express.Response) => {
          const result: FarcResultDocument = req.body;
          this.db.farcResultModel.findByIdAndRemove(result._id).exec()
              .then((r) => {
                res.json("OK");
              })
              .catch((err) => {
                this.log.info("error deleting Result " + err);
                res.json(err);
              });
        });

    // --- Einlesen ---
    //
    router.route("/readall")
        .get((req: express.Request, res: express.Response) => {
          // Filesystem einlesen
          this.services.readFS();
          // nicht auf's Einlesen warten
          res.json("Einlesen aller Laufwerke gestartet ... ");
        });

    router.route("/readvorm")
        .get((req: express.Request, res: express.Response) => {
          // alle Vormerkungen ausfuehren
          this.services.readVorm();
          // nicht auf die Fertigstellung warten
          res.json("Die Vormerkungen werden ausgeführt ... ");
        });

  }

  private getSessionData(req: express.Request | any): FarcSession {
    return req["session"]["data"];
  }

}
