/**
 * Dataservice-Handler
 *
 * Pseudo-DI fur die Server-Objekte. Diese Klasse wird einmalig beim Start der
 * Anwendung instantiiert. Das Objekt verwaltet diverse Singletons, die uebergreifend
 * gebraucht werden. Das Objekt wird per Constructor in die jeweiligen Server-
 * Objekte weitergereicht.
 *
 */

import { FarcDriveDocument } from "@hb42/lib-farc";
import { ADService, LoggerService } from "@hb42/lib-server";
import * as child_process from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as process from "process";

import {
  Communication,
  DataEventEmitter, DataService,
  FarcVormerkung, ipcEXEC, ipcEXECRES,
  ipcREADALL, ipcREADFS, ipcREADTREE, ipcREADVORM, ipcVORMREADY,
} from ".";

import {
  FarcDB,
  Mailer,
} from "../backend";

export class DataServiceHandler {

  public readonly db: FarcDB;
  public readonly vormerkHandler: FarcVormerkung;
  public readonly dataEventHandler: DataEventEmitter;
  public readonly mailer: Mailer;
  public readonly AD: ADService;

  public get isWindows(): boolean {
    return os.platform() === "win32";
  }

  public get isLinux(): boolean {
    return os.platform() === "linux";
  }

  public get isLDarwin(): boolean {
    return os.platform() === "darwin";
  }

  private log = LoggerService.get("farc-server.services.data.DataServiceHandler");

  constructor(public config: any) {
    // DB-Connection
    this.db = new FarcDB(config.mongodbServer, config.mongodbDB, config.mongodbPort,
                              { user: config.farcDBuser, pass: config.farcDBpwd });
    this.vormerkHandler = new FarcVormerkung(this);
    this.dataEventHandler = new DataEventEmitter();
    this.mailer = new Mailer(this);
    this.AD = new ADService();

    this.initCommunication();

  }

  /**
   * source- oder archivepath des Laufwerks ueberpruefen
   *
   * Wenn der Pfad nicht existiert wird in Windows versucht mit net use eine
   * Verbindung herzustellen (falls die Felder user+pwd befuellt sind). Unter
   * Linux/macOS sollte sich das Betriebssystem darum kuemmern (/etc/fstab),
   * dass die noetigen Mountpoints vorhanden sind.
   *
   * Liefert true, wenn der Pfad vorhanden ist und false, wenn der Pfad
   * nicht vorhanden ist bzw. net use fehlgeschlagen ist.
   *
   * @param drive - Laufwerksobjekt
   * @param archive - soll der Archivpfad geprueft werden (true) oder der Sourcepfad (false)?
   */
  public checkPathForDrive(drive: FarcDriveDocument, archive: boolean): boolean {
    let checkpath = archive ? drive.archive_path : drive.source_path;
    // zur Sicherheit nochmal backslash eliminieren
    checkpath = checkpath.replace(/\\/g, "/");
    const checkuser = archive ? drive.user_a : drive.user_s;
    const checkpwd = archive ? drive.pwd_a : drive.pwd_s;

    let  rc = false;

    if (!fs.existsSync(checkpath)) {  // kein Zugriff
      if (this.isWindows) { // checks fuer Windows
        if (checkuser && checkpwd) {
          // checkpath auf //server/share reduzieren
          let share = checkpath.replace(/^(\/\/[^\/]+\/[^\/]+).*/, "$1");
          // fuer Windows slash auf backslash umsetzen
          share = share.replace(/\//g, "\\");
          try {
            const result: Buffer = child_process.execFileSync("net",
                                                              ["use", share, checkpwd, "/user:" + checkuser],
                                                              {timeout: 10000});
            rc = true;
          } catch (err) { // net use liefert rc != 0 || timeout
            rc = false;
            this.log.error("Fehler bei net use " + share + ": " + err.message);
          }
        } else {  // kein User => kein net use
          rc = false;
        }
      } else { // checks fuer Linux/macOS
        // evtl. mount -a ?
        rc = false;
      }
    }  else { // Pfad vorhanden
      rc = true;
    }

    return rc;
  }

  // IPC mit dem Hauptprozess
  private initCommunication() {
    let readall = false;

    if (this.dataEventHandler.listenerCount(this.dataEventHandler.evtReadFsReady) > 0) {
      this.dataEventHandler.removeAllListeners(this.dataEventHandler.evtReadFsReady);
    }
    // Dateien wurden neu eingelesen
    this.dataEventHandler.on(this.dataEventHandler.evtReadFsReady, () => {
      this.log.info("Einlesen beendet - signal build tree");
      // @ts-ignore
      process.send({msg: ipcREADTREE, payload: null});
    });
    if (this.dataEventHandler.listenerCount(this.dataEventHandler.evtVormerkReady) > 0) {
      this.dataEventHandler.removeAllListeners(this.dataEventHandler.evtVormerkReady);
    }
    // Vormerkungen erledigt, ggf. readFS
    this.dataEventHandler.on(this.dataEventHandler.evtVormerkReady, () => {
      this.log.info("Vormerkungen erledigt");
      // vor dem Einlesen ein externes Script aufrufen
      this.vormerkHandler.runPreReadScript();

      if (readall) {  // readall | readfilesystem
        this.log.debug("CRON do read all");
        // DEBUG EP-Tabelle neu aufbauen
        // this.db.farcEndpunktModel.remove({}).then(() => { // DEBUG
          // Daten einlesen
        const dataservice = new DataService(this);
        dataservice.readAll();
        // });  // DEBUG
      } else {
        // @ts-ignore
        process.send({msg: ipcVORMREADY, payload: null});
      }

    });
    process.on("message", (message: Communication) => {
      this.log.debug("IPC: process.on " + message.msg);
      switch (message.msg) {
        case ipcEXEC:
          // message.payload -> entrid
          this.vormerkHandler.runVormerkSingle(message.payload).then((rc) => {
            // @ts-ignore
            process.send({msg: ipcEXECRES, payload: rc});
          });
          break;
        case ipcREADALL:
          readall = true;
          this.log.debug("CRON event readall");
          this.vormerkHandler.runVormerkAll(); // -> evtVormerkReady  // DEBUG
          break;
        case ipcREADFS:
          this.log.debug("CRON event readfilesystem");
          readall = true;
          this.dataEventHandler.emit(this.dataEventHandler.evtVormerkReady);
          break;
        case ipcREADVORM:
          this.log.debug("CRON readvormerk");
          readall = false;
          this.vormerkHandler.runVormerkAll();  // DEBUG
          break;
        default:
          this.log.debug("IPC: unhandled message " + message);
          break;
      }
    });
  }

}
