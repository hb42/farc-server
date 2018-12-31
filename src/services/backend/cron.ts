import { CronJob, CronTime, time } from "cron";

export class Cron {

  private static checkCronString(cronTime: string): CronTime | null {
    try {
      return time(cronTime);
    } catch (err) {
      console.error("invalid CronTime string: " + cronTime);
      return null;
    }
  }

  private cronJob: CronJob;

  private time: string;
  private cmd: () => void;

  constructor(onTick: () => void) {
    this.cmd = onTick;
  }

  public isValid(): boolean {
    return this.cronJob && !!this.cronJob.running;
  }

  public setTime(cronTime: string) {
    const ct: CronTime | null = Cron.checkCronString(cronTime);
    if (ct) {
      this.time = cronTime;
      if (this.isValid()) {
        this.cronJob.stop();
        this.cronJob.setTime(ct);
      } else {
        this.cronJob = new CronJob(cronTime, this.cmd);
      }
    }
  }

  public setCommand(cmd: () => void) {
    if (this.isValid()) {
      this.cronJob.stop();
    }
    this.cmd = cmd;
    this.setTime(this.time);
  }

  public switch(onOff: boolean): boolean {
    if (onOff) {
      this.setTime(this.time);
      if (this.isValid()) {
        this.cronJob.start();
      }
    } else {
      if (this.isValid()) {
        this.cronJob.stop();
      }
    }
    return this.isValid();
  }
}
