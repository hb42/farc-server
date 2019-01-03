import {LoggerService} from "@hb42/lib-server";
import { CronJob, CronTime, time } from "cron";

/**
 * Cron Jobs steuern
 *
 * Wrapper fuer https://github.com/kelektiv/node-cron
 */
export class Cron {

  private static checkCronString(cronTime: string): CronTime | null {
    try {
      return time(cronTime);
    } catch (err) {
      console.error("invalid CronTime string: " + cronTime);
      return null;
    }
  }

  private log = LoggerService.get("farc-server.services.backend.Cron");

  private cronJob: CronJob | null;

  private time: string;
  private cmd: () => void;

  constructor() {
    this.time = "0 0 0 * * *";
    this.cmd = () => { /* nop */ };
  }

  /**
   * Zeit fuer den Cron Job setzen
   *
   * Der Wert wird nur gespeichert. Keine Aenderung am ggf. laufenden cron service.
   * Wert wird erst mit start() eingetragen.
   *
   * @param cronTime - cron string
   */
  public setTime(cronTime: string) {
    const ct: CronTime | null = Cron.checkCronString(cronTime);
    this.log.debug("cron: setTime time=" + ct);
    if (ct) {
      this.time = cronTime;
    } else {
      this.log.error("invalid CrontTime string, cannot set time");
    }
  }

  /**
   * Kommando fuer den Cron Job setzen
   *
   * Der Wert wird nur gespeichert. Keine Aenderung am ggf. laufenden cron service.
   * Wert wird erst mit start() eingetragen.
   *
   * @param cmd - function, die zur eingestellten Zeit augefuehrt wird
   */
  public setCommand(cmd: () => void) {
    this.cmd = cmd;
  }

  /**
   * Aktuelle Cron-Zeit und Kommando setzen und neuen cron service starten
   *
   */
  public start() {
    this.stop();
    this.cronJob = new CronJob(this.time, this.cmd);
    this.cronJob.start();
  }

  /**
   * cron service entfernen
   */
  public stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }
  }

}
