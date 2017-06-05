/**
 * Created by hb on 27.06.16.
 */

import * as express from "express";
// import * as session from "express-session";

import { RestApi } from "../../shared/ext";

/**
 *  NOT IN USE
 *  Zentraler Webservice fuer das session handling
 *
 */
export class SessionAPI implements RestApi {
  public get path(): string {
    return "/session";
  }
  private debug: boolean;

  private noLogonPaths = [
      "/ntlmuser",  // Aufruf v. IIS
  ];

  constructor() {
    // this.initRoutes(router);
  }

  public setDebug(dbg: boolean) {
    this.debug = dbg;
  }

  public initRoute(router: express.Router) {

    router.param("uid", (req, res, next, uid) => {
      // param wird hier aus dem request extrahiert und in get(), post() etc. verwendet
      // wird ueber den request weitergegeben (via ["name"] eintragen, vermeidet Fehler wg.
      // nicht vorhandener Eigenschaft.
      req["UID"] = uid;
      next();
    });

    router.use( (req: express.Request, res: express.Response, next) => {
      console.info("id=" + req["sessionID"]);
      console.dir(req["session"]);

      if (req["session"]["active"]) {
        console.info("session active");
        next();  // session vorhanden
      } else {
        if (this.checkPath(req)) {
          console.info("whitelist or new session");
          next();  // neue session oder Seite in Whitelist
        } else {
          console.info("no session");
          res.sendStatus(401);  // keine session -> Fehler
        }
      }
    });

    /*
    router.use( (req: express.Request, res: express.Response, next) => {
      // TODO Reihenfolge: session.status? y->next, n->header? y->new. n->401
      // fuer Test Check auf path und query -> /bootstrap?uid=blah
      //   Im production code besser nach header suchen
      //   Browser -> asp-script -> WS mit NTLM-User aufrufen -> WS liefert Token
      //    -> asp-script schickt Token -> Browser -> ng-app traegt Token im header ein
      //    -> WS prueft Token (timeout!) und erzeugt session
      if (req.path === "/bootstrap" && req.query.uid) {
        // Mit dem Eintragen eines Werts in das session-Objekt wird
        //  die session gestartet -> cookie
        req["session"]["uid"] = req.query.uid;
        console.info("set session.uid to " + req["session"]["uid"]);
        // wenn alles OK kann hier ein
        //   next()
        //   folgen
        res.send("new session");

      } else {
        // die session ist gueltig, wenn der oben eingetragene Wert
        //   vorhanden ist (evtl. bool ~session.init)
        if (!req["session"]["uid"]) {
          // ungueltig -> unauthorized / TODO einzelne Seiten ausnehmen?
          res.sendStatus(401);
        } else {
          next();
        }
      }
    });
  */

    router.route("/ntlmuser/:uid")
        .get((req: express.Request, res: express.Response) => {
          // TODO check uid && gen. token
          console.info("NTLM-User: " + req["UID"]);
          const logintoken = "aabbccddeeff";
          res.send("let LOGIN_TOKEN = '" + logintoken + "';");
        });

    router.route("/init")
        .get((req: express.Request, res: express.Response) => {
          // if (!req["session"]["uid"]) {
          //   // req["session"]["uid"] = req["UID"]; // initiiert cookie
          //   console.info("set session.uid to " + req["session"]["uid"]);
          // } else {
          //   console.info("session.uid exists " + req["session"]["uid"]);
          // }
          res.send("init");
        });
    router.route("/test")
        .get((req: express.Request, res: express.Response) => {
          // console.info("id=" + req["sessionID"]);
          // console.info("session.uid = " + req["session"]["uid"]);

          res.send("test");
        });

  }

  // diese API managt keine user session
  public getUserSession() {
    return null;
  }

  private checkPath(req: express.Request): boolean {
    // Pfad ohne Anmeldung?
    let rc: boolean = this.noLogonPaths.some( (e) => req.path.indexOf(e) === 0);  // starts with

    // ansonsten: token?
    if (!rc && req.header("x-login-token")) {
      console.info("checkPath: token-header - new session");
      // TODO token ueberpruefen timestamp etc./ UID eintragen
      console.info("token: " + req.header("x-login-token"));
      // session start
      req["session"]["active"] = rc = true;
    }
    console.info("checkPath returns " + rc);
    return rc;
  }

}
