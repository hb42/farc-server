
/**
 * Modul fuer Dateisystem-/AD-Zugriffe
 *
 * Das Modul wird vom Hauptprozess aus per fork() gestartet, damit die
 * Dateisystemoperationen nicht den Webserver ausbremsen.
 *
 */
import * as fs from "fs";
import * as process from "process";
import * as v8 from "v8";

import { LoggerService } from "@hb42/lib-server";

import { configFile } from "./services";
import { DataServiceHandler } from "./services/data";

// import config
const config = JSON.parse(fs.readFileSync(configFile, "utf8"));

// Standard-Logfile-Konfig
LoggerService.init("resource/log4js-data.json");
const log = LoggerService.get("farc-server.DataService.main");

log.info("filesystem+AD module starting");
log.info(v8.getHeapStatistics());

// main
const services = new DataServiceHandler(config);

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
