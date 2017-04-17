/**
 * Created by hb on 29.05.16.
 */

import * as express from "express";
// import * as http from "http";
import * as request from "request";

import {
    authURL,
    RestApi,
} from "../../shared/ext";

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

          let app = req.query["app"];
          console.info("asp.api: app=" + app);
          let uid = this.fakeUser;

          let authUrl = this.services[app].server + authURL; // + "?uid=" + uid;
          let result = {}; // = "let LOGIN_TOKEN="123456";";
          result["type"] = "NTLM";
          result["uid"] = uid;

          request({ url: authUrl, // URL to hit
                    method: "POST",
                    // Lets post the following key/values as form
                    json: result,
                  }, (error, response, body) => {
            if (error) {
              console.info("asp.api: error in request: " + error);
            } else {
              console.info(response.statusCode, body);
              res.send(JSON.stringify(body));
            }
          });

          // http.get( url, (response) => {
          //    response.on("data", (data) => {
          //      result += data.toString();
          //    });
          //    response.on("end", () => {
          //      res.send(result);
          //    });
          //  });

        });

  }

  // hier wird keine user session gebraucht
  public getUserSession() {
    return null;
  }

}
