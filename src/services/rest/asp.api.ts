/**
 * Created by hb on 29.05.16.
 */

import * as express from "express";
import * as request from "request";

import {
  authURL,
} from "@hb42/lib-common";
import {
  LoggerService,
  RestApi,
} from "@hb42/lib-server";

/**
 * Pseudo IIS
 *
 * Simuliert die NTLM-Abfrage auf dem IIS und liefert ein Token
 * als JavaScript-String.
 *
 */
export class AspAPI implements RestApi {
  public get path(): string {
    return "/asp";
  }
  private fakeUser: string;
  // { app1: { server: "http://server:port", url: "/ntlmlogin"}, }
  private services: any;

  private log = LoggerService.get("farc-servcer.services.rest.AspAPI");

  constructor() {
    // this.initRoutes(router);
  }

  public setUser(usr: string) {
    this.fakeUser = usr;
  }

  public setWebservice(services: any) {
    this.services = services;
  }

  public initRoute(router: express.Router) {

    router.route("/get")  // ?app=<app name>
        .get((req: express.Request, res: express.Response) => {

          const app = req.query["app"];
          this.log.info("asp.api: app=" + app);
          const uid = this.fakeUser;

          const authUrl = this.services[app].server + authURL; // + "?uid=" + uid;
          const result: any = {}; // = "let LOGIN_TOKEN="123456";";
          result["type"] = "NTLM";
          result["uid"] = uid;

          request({ url: authUrl, // URL to hit
                    method: "POST",
                    // Lets post the following key/values as form
                    json: result,
                  }, (error, response, body) => {
            if (error) {
              this.log.info("asp.api: error in request: " + error);
            } else {
              this.log.info(response.statusCode, body);
              res.send(JSON.stringify(body));
            }
          });
        });

  }

  // hier wird keine user session gebraucht
  public getUserSession() {
    return null;
  }

}
