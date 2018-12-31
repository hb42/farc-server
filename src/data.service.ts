
/**
 * Modul fuer Dateisystem-/AD-Zugriffe
 *
 * Das Modul wird vom Hauptprozess aus per fork() gestartet, damit die
 * Dateisystemoperationen nicht den Webserver ausbremsen.
 *
 */
import * as fs from "fs";
import * as process from "process";

import { LoggerService } from "@hb42/lib-server";

import { configFile } from "./services";
import { DataServiceHandler } from "./services/data";

// aus Webpack via DefinePlugin
// declare const WEBPACK_DATA;
// const metadata = WEBPACK_DATA.metadata;
// process.env.ENV = metadata.ENV;
// process.env.NODE_ENV = metadata.NODE_ENV;

// let configfile = metadata.CONFIGFILE;
const config = JSON.parse(fs.readFileSync(configFile, "utf8"));

// Standard-Logfile-Konfig
LoggerService.init("resource/log4js-data.json");
const log = LoggerService.get("farc-server.DataService.main");

// main
const services = new DataServiceHandler(config);

log.info("filesystem+AD module running");

const runonexit = (evt: any) => {
  log.info("DataProcess: terminating on  " + evt);
  services.db.mongo.close().then((mesg) => {
    log.info(mesg);
    LoggerService.shutdown();
    // process.exit(0);
  });
};

process.on("SIGINT", runonexit);
process.on("SIGTERM", runonexit);
process.on("SIGUSR2", runonexit);
process.on("exit", runonexit);
