import {
  confADMINMAIL,
  confMAILFROM,
  confMAXERL,
  FarcDriveDocument,
  FarcEntryDocument,
  FarcEntryTypes,
  FarcResultDocument,
  FarcSelectType,
  FarcUserDocument,
  getConfigValue,
} from "@hb42/lib-farc";
import {LoggerService} from "@hb42/lib-server";

import {execFile} from "child_process";
import * as fs from "fs";

import {DataServiceHandler} from ".";
import {FarcConfigDAO} from "../../model";
import {FarcDB} from "../backend";

interface Command {
  drive: FarcDriveDocument;
  entrydocument: FarcEntryDocument;
  command: string;
  sourceprefix: string;
  targetprefix: string;
  path: string;
  isdir: boolean;
  item: string;
  success?: boolean;
  log?: string;
}

interface PathEntry {
  name: string;
  relpath: string;
  timestamp: number;
  size: number;
}

interface ResultGroup {
  _id: string;  // group by UID
  entries: FarcResultDocument[];
}

export class FarcVormerkung {

  // div. Konstanten
  public readonly MOVE = "move";
  public readonly COPY = "copy";
  public readonly DELETE = "delete";
  public readonly WIN_SHELL = "C:/WINDOWS/System32/WindowsPowerShell/v1.0/powershell.exe";
  public readonly WIN_SCRIPT =  "./resource/farcExec.ps1";
  public readonly WIN_PRE_SCRIPT =  "./resource/farcPreRead.ps1";
  public readonly LINUX_SHELL = "/bin/bash";
  public readonly LINUX_SCRIPT = "./resource/farcExec.sh"; // TODO noch zu erstellen (hat Zeit)

  private readonly db: FarcDB;
  private configDAO: FarcConfigDAO;

  private log = LoggerService.get("farc-server.services.data.FarcVormerkung");

  constructor(private services: DataServiceHandler) {
    this.db = services.db;
    this.configDAO = new FarcConfigDAO(this.db);
  }

  /**
   * Alle in der DB gespeicherten Vormerkungen starten
   *
   */
  public async runVormerkAll() {
    const result: FarcResultDocument[] = await this.runVormerk();
    this.services.dataEventHandler.emit(this.services.dataEventHandler.evtVormerkReady);
    this.cutResultList();
    this.mailResult(result);
  }

  /**
   * Einzelne Vormerkung starten
   *
   * @param entryid {string} - FarcEntry.key
   * @returns {Promise<string>}
   */
  public async runVormerkSingle(entryid: string): Promise<string> {
    const entry: FarcEntryDocument | null = await this.db.farcEntryModel.findOne({key: entryid}).exec();
    if (entry) {
      const result: FarcResultDocument[] = await this.runVormerk(entry);
      if (result.length !== 1) {
        this.log.error("Vormerkungs-Verarbeitung fuer " + entry.path.join("/") +
                           (entry.type === FarcEntryTypes.file ? entry.label : "") +
                           " liefert undefiniertes Ergebnis (length <> 1)!");
        return "Fehler bei der Verarbeitung";
      }
      const res: FarcResultDocument = result[0];
      let msg = "";
      msg += res.success ? "Erfolg: " : "Fehler beim ";
      msg += res.selected === FarcSelectType.toArchive ? "Archivieren "
          : res.selected === FarcSelectType.fromArchive ? "Zurücksichern " : "Löschen ";
      msg += "von ";
      msg += [...res.path, res.label].join("/");
      return msg;
    } else {
      return "Fehler: kein Datensatz gefunden";
    }
  }

  /**
   * Externes Script starten bevor das Einlesen beginnt
   *
   * Hier koennen z.B. DB-Dumps gestartet werden.
   */
  public async runPreReadScript() {
    if (this.services.isWindows) {  // Windows -> PowerShell
      const args: string[] = ["-NonInteractive", "-NoProfile",
        "-file", this.WIN_PRE_SCRIPT,
        "-user", this.services.config.farcDBuser,
        "-pass", this.services.config.farcDBpwd];
      try {
        const rc: string = await this.execScript(this.WIN_SHELL, args);
        this.log.debug("PreScript output=");
        this.log.debug(rc);
        return rc;
      } catch (err) {
        this.log.debug("ERROR running PreScript");
        this.log.debug(err.message);
        return err.message;
      }
    } else {  // TODO linux-Handling
      this.log.error("PreScript kann im Moment nur unter Windows ausgefuehrt werden.");
    }
  }

  /**
   * Einzelne (entry) oder alle Vormerkungen (entry == undefined) ausfuehren
   *
   * @param entry - FarcEntry | undefined
   * @returns {Promise<FarcResultDocument[]>}
   */
  private async runVormerk(entry?: FarcEntryDocument): Promise<FarcResultDocument[]> {
    const cmds: Command[] = await this.commandList(entry);
    let wait = 0;
    const delay = 200; // cmds um 200 millis versetzt starten
    const results: FarcResultDocument[] = await Promise.all(cmds.map(async (cmd) => {
      wait += delay;
      return new Promise<FarcResultDocument>((resolve, reject) => {
        setTimeout(async () => {
          const result: FarcResultDocument = await this.run(cmd);
          resolve(result);
        }, wait);
      });
    }));
    return results;
  }

  /**
   * Auszufuehrende Aktionen fuer eine einzelne (entry) oder alle Vormerkungen (entry == undefined) generieren.
   *
   * @param entry - FarcEntry | undefined
   * @returns {Promise<Command[]>}
   */
  private async commandList(entry?: FarcEntryDocument): Promise<Command[]> {
    let commands: Command[];
    if (entry) {
      commands = await this.buildCommandList([entry]);
    } else {
      const selected: FarcEntryDocument[] = await this.db.farcEntryModel.find({selected: {$gt: 0}}).exec();
      commands = await this.buildCommandList(selected);
    }
    return commands;
  }

  /**
   * Eine Liste der auszufuehrenden Aktionen bauen.
   *
   * @param entries {FarcEntryDocument[]} - vorgemerkte FarcEntry
   * @returns {Promise<Command[]>}
   */
  private async buildCommandList(entries: FarcEntryDocument[]): Promise<Command[]> {
    const drives: FarcDriveDocument[] = await this.db.farcDriveModel.find().exec();
    const commands: Command[] = [];
    entries.forEach((entry: FarcEntryDocument) => {
      const drv: FarcDriveDocument | undefined = drives.find((d) => d._id.equals(entry.drive));
      if (drv) {
        // Zugriff auf shares?
        if (this.services.checkPathForDrive(drv, true) && this.services.checkPathForDrive(drv, false)) {
          const dir = entry.type === FarcEntryTypes.dir;
          const relpath = /*dir ? entry.path.slice(1, -1).join("/") :*/ entry.path.slice(1).join("/");
          let sourcedrive = "";
          let targetdrive = "";
          let cmd = "";
          switch (entry.selected) {
            case FarcSelectType.toArchive:
              sourcedrive = drv.source_path;
              targetdrive = drv.archive_path;
              cmd = this.MOVE;
              break;
            case FarcSelectType.fromArchive:
              sourcedrive = drv.archive_path;
              targetdrive = drv.source_path;
              cmd = this.COPY;
              break;
            case FarcSelectType.del:
              sourcedrive = entry.arc ? drv.archive_path : drv.source_path;
              targetdrive = "n/a";
              cmd = this.DELETE;
              break;
            default:
              this.log.error("unkown selectType " + entry.selected);
          }
          commands.push({
            drive        : drv,
            entrydocument: entry,
            command      : cmd,
            sourceprefix : sourcedrive,
            targetprefix : targetdrive,
            path         : relpath,
            isdir        : dir,
            item         : entry.label,
          });
        } else {
          this.log.error("Shares fuer Laufwerk " + drv.displayname + " nicht erreichbar.");
        }
      } else {
        // kein Laufwerk fuer entry - sollte nicht vorkommen
        this.log.error("No drive for entry " + entry.path.join("/") + "/" + entry.label
                       + " (arc=" + entry.arc + ")");
      }
    });
    return commands;
  }

  /**
   * Script fuer eine Vormerkung starten und das Ergebnis speichern
   *
   * @param cmd {Command} - auszufuehrende Vormerkung
   * @returns {Promise<FarcResultDocument>}
   */
  private async run(cmd: Command): Promise<FarcResultDocument> {
    // alten Stand festhalten
    const checkData: PathEntry[] = this.getCheckData(cmd);
    // Operation ausfuehren, liefert das log des externen scripts
    const command: Command = await this.execCommand(cmd);
    // Erfolg ueberpruefen
    const check = this.checkResult(command, checkData);
    if (check) {
      command.success = false;
      command.log = check + "\n\n" + command.log;
    } else {
      command.success = true;
    }
    const result: FarcResultDocument = await this.saveResult(command);
    return result;
  }

  /**
   * Script-Kommandozeile in Abhängigkeit von Betriebssystem zusammenbauen
   *
   * @param cmd {Command} - auszufuehrende Vormerkung
   * @returns {Promise<Command>} - command + execution log
   */
  private async execCommand(cmd: Command): Promise<Command> {
    // TODO Param als globale const
    if (this.services.isWindows) {  // Windows -> PowerShell
      const args: string[] = ["-NonInteractive", "-NoProfile",
                              "-file", this.WIN_SCRIPT,
                              "-source", cmd.sourceprefix + "/" + cmd.path,
                              "-target", cmd.targetprefix + "/" + cmd.path,
                              "-type", cmd.command];
      if (!cmd.isdir) {
        args.push("-file", cmd.item);
      }
      try {
        const rc: string = await this.execScript(this.WIN_SHELL, args);
        cmd.success = true;
        cmd.log = rc;
        this.log.debug("output=");
        this.log.debug(rc);
        return cmd;
      } catch (err) {
        cmd.success = false;
        cmd.log = err;
        this.log.debug("ERROR");
        this.log.debug(err);
        return cmd;
      }
    } else {  // TODO linux-Handling
      this.log.error("Zur Zeit ist Vormerkungs-Handling nur unter Windows moeglich.");
      cmd.success = false;
      cmd.log = "FEHLER: Falsches Betriebssystem. Vormerkungen koennen nur unter Windows ausgefuehrt werden.";
      return cmd;
    }
  }

  /**
   * Script ausfuehren
   *
   * @param cmd {string} - Programm
   * @param args {string[]} - Kommandozeilen-Parameter
   * @returns {Promise<string>} - Ausgabe des Programms
   */
  private execScript(cmd: string, args: string[]): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      execFile(cmd, args,
               {maxBuffer: 1024 * 1024},
               (error, stdout, stderr) => {
                 // resolve({rc: error, out: stdout/*.split(/\r?\n/)*/});
                 if (error) {
                   const std = "" + stdout + "\n" + stderr;
                   reject(error.message ? error.message + "\n\n" + std : std);
                 } else {
                   resolve("" + stdout);
                 }
               });
    });
  }

  /**
   * Ergebnis der Operation in der Datenbank ablegen und Vormerkungs-Status zuruecksetzen.
   *
   * @param cmd {Command} - Vormerkung incl. log des Programmlaufs
   * @returns {Promise<FarcResultDocument>} - gespeichertes Ergebnis
   */
  private async saveResult(cmd: Command): Promise<FarcResultDocument> {
    let saveresult: FarcResultDocument;
    try {
      saveresult = await this.db.farcResultModel.create({
                                                          path       : cmd.entrydocument.path,
                                                          label      : cmd.isdir ? "*" : cmd.entrydocument.label,
                                                          arc        : cmd.entrydocument.arc,
                                                          selected   : cmd.entrydocument.selected,
                                                          selectUid  : cmd.entrydocument.selectUid,
                                                          selectDate : cmd.entrydocument.selectDate,
                                                          processDate: new Date().getTime(),
                                                          success    : cmd.success,
                                                          log        : cmd.log,
                                                          size       : cmd.entrydocument.size,
                                                        });
    } catch (rErr) {
      this.log.info("error creating ResultEntry " + rErr);
    }
    cmd.entrydocument.selected = FarcSelectType.none;
    try {
      const docsave: FarcEntryDocument = await cmd.entrydocument.save();
    } catch (eErr) {
      this.log.error("Fehler beim Update des Vormerkungs-Status fuer " + cmd.entrydocument.path.join("/"));
    }
    // @ts-ignore
    return saveresult;
  }

  /**
   * Ergebnis des Vormerkungslaufs an die Benutzer mailen.
   *
   * @param results {FarcResultDocument[]} - die Ergebnisse
   */
  private async mailResult(results: FarcResultDocument[]) {
    const sender = await this.configDAO.findConfig(confMAILFROM);
    if (!sender) {
      this.log.error("Fehler: Keine Mails moeglich - Absender-Mail nicht konfiguriert");
      return;
    }
    // Ergebnisse nach User aufbereiten {"uid": FarcResultDocument[], ...}
    const userResults: any = {};
    // Fehler fuer Mail an admin sammeln {"uid": string[], ...}
    const adminResults: any = {};
    results.forEach((res) => {
      if (!userResults[res.selectUid]) {
        userResults[res.selectUid] = [];
      }
      userResults[res.selectUid].push(res);
    });

    this.log.debug("mailResult userResults");
    Promise.all(Object.keys(userResults).map(async (usr) => {
      this.log.debug("mailResult foreach user: " + usr);
      try {
        const user: FarcUserDocument | null = await this.db.farcUserModel.findOne({uid: usr}).exec();
        if (user) {
          const moved: string[] = [];
          const copied: string[] = [];
          const deleted: string[] = [];
          const errormsg: string[] = [];
          userResults[usr].forEach((res: FarcResultDocument) => {
            if (res.success) {
              switch (res.selected) {
                case FarcSelectType.toArchive:
                  moved.push([...res.path, res.label].join("/"));
                  break;
                case FarcSelectType.fromArchive:
                  copied.push([...res.path, res.label].join("/"));
                  break;
                case FarcSelectType.del:
                  deleted.push([...res.path, res.label].join("/"));
                  break;
              }
            } else {
              errormsg.push("Fehler für: " + [...res.path, res.label].join("/") + "<br>" +
                                "<pre>" + res.log + "</pre>");
            }
          });
          let body = "<p>Sehr geehrter Benutzer des Datei-Archivs,</p>" +
              "<p>im Datei-Archiv wurden für Sie die folgenden Aktionen ausgeführt.</p>";
          if (moved.length) {
            body += "<p>Ins Archiv verschoben wurden:</p><ul>";
            moved.forEach((m) => body += "<li>" + m + "</li>");
            body += "</ul>";
          }
          if (copied.length) {
            body += "<p>Vom Archiv zurückkopiert wurden:</p><ul>";
            copied.forEach((c) => body += "<li>" + c + "</li>");
            body += "</ul>";
          }
          if (deleted.length) {
            body += "<p>Gelöscht wurden:</p><ul>";
            deleted.forEach((d) => body += "<li>" + d + "</li>");
            body += "</ul>";
          }
          if (errormsg.length) {
            body += "<p style='color: red'>Es sind Fehler aufgetreten:</p>";
            errormsg.forEach((e) => body += "<pre>" + e + "</pre><hr>");
            // Fehler auch an admin
            adminResults[usr] = errormsg;
          }
          this.services.mailer.sendStatusMail(sender, user.mail, body, "Datei-Archiv-Status");
        } else { // user is null
          this.log.error("Vormerkungs-Ergebnis fuer unbekannten Benutzer: " + usr);
        }
      } catch (e) {
        this.log.error("Fehler beim Lesen des Benutzers fuer Vormerkungs-Ergebnisse User=" + usr + ", " + e.message);
      }
    })).then(async (a) => {
      if (Object.keys(adminResults).length > 0) {
        let body = "<p>Bei der Vormerkungs-Verarbeitung sind im Datei-Archiv Fehler aufgetreten:</p>";
        Object.keys(adminResults).forEach((usr) => {
          body += "<p>Benutzer " + usr + ":</p>";
          adminResults[usr].forEach((err: string) => body += "<pre>" + err + "</pre><hr>");
          body += "<p></p>";
        });
        const admMail = await this.configDAO.findConfig(confADMINMAIL);
        if (admMail) {
          this.services.mailer.sendStatusMail(sender, admMail, body, "Datei-Archiv Fehler-Protokoll");
        } else {
          this.log.error("Fehler: Konnte Vormerk-Fehler nicht an Admin mailen - keine Admin-E-Mail konfiguriert.");
        }
      }

    });
  }

  /**
   * Liste der Vormerkungs-Ergebnisse auf x Tage reduzieren.
   *
   * Anzahl Tage, die aufgehoben werden, kommt aus Config-DB (default 90).
   */
  private async cutResultList() {
    try {
      const conf = await this.configDAO.findConfig(confMAXERL);
      const days = conf ? getConfigValue(conf) : 90;
      const maxdate = new Date().getTime() - days * 24 * 60 * 60 * 1000;
      const rc = await this.db.farcResultModel.deleteMany({processDate: {$lt: maxdate}}).exec();
      if (rc.ok) {
        this.log.debug("Erledige Vormerkungen geloescht: " + rc.n);
      } else {
        this.log.debug("Keine erledigten Vormerkungen gefunden.");
      }
    } catch (e) {
      this.log.error("Fehler beim Loeschen aus FarcResult: " + e.message);
    }
  }

  // --- check ---

  /**
   * Nachsehen, ob die Aktion erfolgreich war und ggf. passende
   * Fehlermeldung liefern.
   *
   * @param cmd
   * @param check
   * @returns {string} => empty == success
   */
  private checkResult(cmd: Command, check: PathEntry[]): string {
    if ((cmd.command === "move" || cmd.command === "copy")) {
      const result: PathEntry[] = this.targetCheck(check, cmd);
      if (result.length > 0) {
        let rc = (cmd.command === "move" ? "Verschieben ins Archiv unvollständig. "
            : "Zurücksichern aus dem Archiv unvollständig. ")
            + result.length + " Dateien/Verzeichnisse fehlen:";
        result.forEach((r) => rc += "<br>" + r.relpath + "/" + r.name);
        return rc;
      }
    }
    if (cmd.command === "move" || cmd.command === "delete") {
      if (this.existSource(cmd)) {
        return (cmd.command === "move" ? "Verschieben ins Archiv unvollständig. "
            + (cmd.isdir ? "Quellverzeichnis" : "Quelldatei")
            + " konnte nicht gelöscht werden"
            : (cmd.isdir ? "Verzeichnis" : "Datei")
            + " konnte nicht gelöscht werden");
      }
    }
    return "";
  }

  /**
   * Zu verschiebendes/kopierendes Verzeichnis/Datei einlesen, fuer den Vergleich mit
   * dem Ergebnis der Operation.
   *
   * @param cmd
   * @returns {PathEntry[]}
   */
  private getCheckData(cmd: Command): PathEntry[] {
    // this.log.debug("fetch vgl. " + cmd.sourceprefix + "/" + cmd.path + "/" + cmd.item);
    if (cmd.isdir) {
      return this.walkTree(cmd.sourceprefix, cmd.path + "/" + cmd.item);
    } else {
      return this.walkFile(cmd.sourceprefix, cmd.path, cmd.item);
    }
  }
  /**
   * Ziel mit dem Original (s. getCheckData()) vergleichen.
   *
   * @param check
   * @param cmd
   * @returns {PathEntry[]} abweichende Verzeichniseintraege => length 0 == success
   */
  private targetCheck(check: PathEntry[], cmd: Command): PathEntry[] {
    const rc: PathEntry[] = [];
    // this.log.debug("check vgl with " + cmd.targetprefix + "/" + cmd.path + "/" + cmd.item );
    check.forEach((p) => {
      try {
        const stat = fs.lstatSync(cmd.targetprefix + "/" + p.relpath + "/" + p.name);
        // Vergleich der file time nur auf volle Sekunden, damit Filesystem-Ungereimtheiten
        // ausgeblendet werden
        // Vergleich ist nur fuer Datei sinnvoll, weil rsync auf dem filer keinen
        // timestamp setzen kann
        if (stat.isFile()
            && (Math.floor(stat.mtime.getTime() / 1000) !== Math.floor(p.timestamp / 1000)
                || stat.size !== p.size)
        ) {
          // this.log.debug("vgl error: time1=" + (stat.mtime.getTime() / 1000) + " time2=" + (p.timestamp / 1000) +
          // " size1=" + stat.size + " size2=" + p.size);
          rc.push(p);
        }
      } catch (e) {
        // nicht vorhanden
        // this.log.debug("vgl not exist " + cmd.targetprefix + "/" + p.relpath + "/" + p.name);
        rc.push(p);
      }
    });
    return rc;
  }
  /**
   * Existiert Quell-Datei/Verzeichnis?
   *
   * @param cmd
   * @returns {boolean}
   */
  private existSource(cmd: Command): boolean {
    this.log.debug(" check exist " + cmd.sourceprefix + "/" + cmd.path + "/" + cmd.item);
    try {
      fs.accessSync(cmd.sourceprefix + "/" + cmd.path + "/" + cmd.item);
      return true;
    } catch (e) {
      return false;
    }
  }

  // liefert flat array fuer Baum unter base/dir
  private walkTree(base: string, dir: string): PathEntry[] {
    const fullpath = base + "/" + dir;
    let entries: PathEntry[] = [];
    let list: string[];
    try {
      list = fs.readdirSync(fullpath);
    } catch (e) {
      list = [];
    }
    list.forEach((filename) => {
      try {
        const entry = dir + "/" + filename;
        const stat = fs.lstatSync(base + "/" + entry);
        // this.log.debug("VGL: " + entry);
        if (stat.isDirectory()) {
          const directory: PathEntry = {
            name: filename,
            relpath: dir,
            timestamp: stat.mtime.getTime(),
            size: stat.size,
          };
          entries.push(directory);
          // Rekursion
          entries = entries.concat(this.walkTree(base, entry));
        } else {
          entries.push({
            name: filename,
            relpath: dir,
            timestamp: stat.mtime.getTime(),
            size: stat.size,
          });
        }
      } catch (e) {
        // noop
      }
    });
    return entries;
  }
  private walkFile(base: string, dir: string, file: string): PathEntry[] {
    const entry: PathEntry[] = [];
    try {
      const stat = fs.lstatSync(base + "/" + "/" + dir + "/" + file);
      entry.push({
        name: file,
        relpath: dir,
        timestamp: stat.mtime.getTime(),
        size: stat.size,
      });
    } catch (e) {
      // noop
    }
    return entry;
  }

}
