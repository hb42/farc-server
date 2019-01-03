/**
 * Service-Handler
 *
 * Pseudo-DI fur die Server-Objekte. Diese Klasse wird einmalig beim Start der
 * Anwendung instantiiert. Das Objekt verwaltet diverse Singletons, die uebergreifend
 * gebraucht werden. Das Objekt wird per Constructor in die jeweiligen Server-
 * Objekte weitergereicht.
 *
 */

import { checkCronTime, confCRON, confEXECVORM, confREADTREE, getConfigValue, sseNEWVORM } from "@hb42/lib-farc";
import * as child_process from "child_process";
import * as os from "os";

import { LoggerService, Webserver } from "@hb42/lib-server";
import { FarcConfigDAO } from "../../model";

import {
  Communication,
  DataEventEmitter, ipcEXEC, ipcEXECRES, ipcREADALL, ipcREADFS, ipcREADTREE, ipcREADVORM, ipcVORMREADY,
} from "../data";

import {
  Cron,
  FarcDB,
} from "../";

export class ServiceHandler {

  public readonly db: FarcDB;
  public readonly dataEventHandler: DataEventEmitter;
  private readonly cron: Cron;

  private readonly EXTERNAL_PROCESS = "data.service.js";

  private DataHandler: child_process.ChildProcess;
  public get DATA(): child_process.ChildProcess {
    return this.DataHandler;
  }

  // configMode: jeder User hat Admin-Rechte (fuer die Ersteinrichtung)
  //             wird in der config-Datei gesetzt
  private readonly configmode: boolean = false;
  public get configMode(): boolean {
    return this.configmode;
  }

  public get isWindows(): boolean {
    return os.platform() === "win32";
  }

  public get isLinux(): boolean {
    return os.platform() === "linux";
  }

  public get isLDarwin(): boolean {
    return os.platform() === "darwin";
  }

  private webserver: Webserver;

  private configDAO: FarcConfigDAO;

  private log = LoggerService.get("farc-server.services.backend.ServiceHandler");

  constructor(public config: any) {
    // DB-Connection
    this.db = new FarcDB(config.mongodbServer, config.mongodbDB, config.mongodbPort,
                              { user: config.farcDBuser, pass: config.farcDBpwd });
    this.startDataProcess();
    this.dataEventHandler = new DataEventEmitter();
    // this.mailhandler = new Mailer(this);

    if (config.configMode) {
      this.configmode = true;
      this.log.warn("*** ACHTUNG: Programm befindet sich im Konfigurations-Modus, ALLE User haben Admin-Rechte! ***");
    }

    this.cron = new Cron();
    this.configDAO = new FarcConfigDAO(this.db);
    this.setCron();
  }

  /**
   * Webserver-Instanz eintragen
   *
   * @param srv
   */
  public setWebserver(srv: Webserver) {
    this.webserver = srv;
  }

  /**
   * Daten via SSE an den Client senden
   *
   * @param data
   * @param event
   * @param id
   */
  public sendSSE(data: any, event?: string, id?: string | number) {
    if (this.webserver.getSSE()) {
      this.webserver.getSSE().send(data, event, id);
    } else {
      this.log.error("Fuer den Webserver ist kein SSE eingerichtet!");
    }
  }

  public execVormerk(entryid: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.DataHandler.send({msg: ipcEXEC, payload: entryid});
      this.DataHandler.on("message", (message: Communication) => {
        switch (message.msg) {
          case ipcEXECRES:
            this.log.info("execVormerk(): result " + message.payload);
            resolve(message.payload);
            break;
        }
      });
    });
  }

  public setCron() {
    this.log.debug("CRON setCron()");
    let doRead: boolean;
    let doVormerk: boolean;

    this.configDAO.findConfig(confCRON).then((val) => {
      const time = checkCronTime(getConfigValue(val));
      // time-string wird beim Eintragen/Lesen in der Config geprueft
      this.cron.setTime(time ? "0 " + time[2] + " " + time[1] + " * * *" : "");
      this.configDAO.findConfig(confREADTREE).then((read) => {
        doRead = getConfigValue(read);
        this.log.debug("CRON filesystem=" + doRead);
        this.configDAO.findConfig(confEXECVORM).then((vorm) => {
          doVormerk = getConfigValue(vorm);
          this.log.debug("CRON vormerk=" + doVormerk);
          if (doRead || doVormerk) {
            this.log.debug("CRON doRead || doVormerk");
            if (doRead && doVormerk) {
              this.log.debug("CRON doRead && doVormerk");
              this.cron.setCommand(this.readAll);
            } else if (doRead) {
              this.log.debug("CRON doRead");
              this.cron.setCommand(this.readFS);
            } else {
              this.log.debug("CRON doVormerk");
              this.cron.setCommand(this.readVorm);
            }
            this.log.debug("CRON start");
            this.cron.start();
          } else {
            this.cron.stop();
          }
        });
      });
    });
  }

  public readAll = () => {
    this.DataHandler.send({msg: ipcREADALL, payload: null});
  }
  public readFS = () => {
    this.log.debug("CRON send message " + ipcREADFS);
    this.DataHandler.send({msg: ipcREADFS, payload: null});
  }
  public readVorm = () => {
    this.DataHandler.send({msg: ipcREADVORM, payload: null});
  }

  private startDataProcess() {
    this.log.info("FORKING DataHandler");
    this.DataHandler = child_process.fork(this.EXTERNAL_PROCESS, [], {silent: false});

    this.DataHandler.on("message", (message: Communication) => {
      switch (message.msg) {
        // Einlesen beendet, Tree muss neu aufgebaut werden
        case ipcREADTREE:
          this.dataEventHandler.emit(this.dataEventHandler.evtReadFsReady);
          break;
        case ipcVORMREADY:
          this.sendSSE("Vormerkungen erledigt", sseNEWVORM);
          break;
        default:
          break;
      }
    });
  }

}
