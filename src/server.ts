/*
 * farc-server
 *
 * Date-Archiv-Server mit REST-API und Routinen fuers Einlesen der Endpunkte.
 *
 */

import "reflect-metadata";

import * as fs from "fs";

import {
  authURL,
} from "@hb42/lib-common";
import {
  LoggerService,
  Webserver,
} from "@hb42/lib-server";

import {
  AspAPI,
  configFile,
  FarcAPI,
  FarcUserCheck,
  ServiceHandler,
} from "./services";

/*
 Mehr Threads fuer fs und mongo(?) bereitstellen (default 4)
 -> http://stackoverflow.com/questions/22644328/when-is-the-thread-pool-used
 (alt.(?): --v8-pool-size=)
 */
process.env.UV_THREADPOOL_SIZE = "127";

// Standard-Logfile
LoggerService.init("resource/log4js-server.json");
const log = LoggerService.get("farc-server.main");

// aus Webpack via DefinePlugin
// declare const WEBPACK_DATA;
// const metadata = WEBPACK_DATA.metadata;
// process.env.ENV = metadata.ENV;
// process.env.NODE_ENV = metadata.NODE_ENV;
// let configfile = metadata.CONFIGFILE;
// configfile = "./resource/" + configfile;

const config = JSON.parse(fs.readFileSync(configFile, "utf8"));

// Services und config-data
const services = new ServiceHandler(config);

// FARC-Server
const farcserver = new Webserver(config.restAPIport, "farc", new FarcUserCheck(services, config.jwtTimeoutSec));
farcserver.setCorsOptions({origin: config.webapp, credentials: true});
farcserver.addApi(new FarcAPI(services));
farcserver.setSSE("farc");
farcserver.setDebug(true);
farcserver.start();
services.setWebserver(farcserver);

// wird nur gebraucht, wenn kein IIS vorhanden
if (!config.IIS) {
// fake IIS
  const fakeIISserver = new Webserver(config.restAPIport + 42, "asp");
  const asp = new AspAPI();
  asp.setUser("v998dpve\\s0770007");
  asp.setWebservice({ farc: {server: config.restAPI, url: authURL} });
  fakeIISserver.setDebug(true);
  fakeIISserver.addApi(asp);
  fakeIISserver.setCorsOptions({origin: config.webapp, credentials: true});
  fakeIISserver.setStaticContent("");
  fakeIISserver.start();
}

// FARC-static Webapp-Server als Alternative zu electron
if (config.static) {
  const staticserver = new Webserver(config.restAPIport - 100, "farc-static");
  staticserver.setFaviconPath("./resource/favicon.ico");
  staticserver.setStaticContent("./static");
  staticserver.setStaticUrl("/");
  staticserver.start();
}

// Beim Beenden aufraeumen
const runonexit = (evt: any) => {
  log.info("terminating on " + evt);
  services.DATA.kill(evt);  // Prozess wird automatisch beendet?
  services.db.mongo.close().then((mesg) => {
    log.info(mesg);
    LoggerService.shutdown();
    process.exit(0);
  });
};

process.once("SIGINT", runonexit);
process.once("SIGTERM", runonexit);
process.once("SIGUSR2", runonexit);
process.once("exit", runonexit);
