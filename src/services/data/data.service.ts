/**
 * Created by hb on 31.12.16.
 */

import {
  DataEventEmitter,
  FarcFilesystem,
  FarcReadEps,
} from ".";
import {
  LoggerService,
} from "../../shared/ext";
import {
  FarcDB,
} from "../backend";

export class DataService {

  private log = LoggerService.get("farc-server.services.data.DataService");
  private dataEventHandler: DataEventEmitter;

  constructor(private db: FarcDB, private spk: boolean) {
    this.dataEventHandler = new DataEventEmitter();
  }

  /**
   * Liefert den EventEmitter.
   *
   * @returns {DataEventEmitter}
   */
  public getEvent(): DataEventEmitter {
    return this.dataEventHandler;
  }

  /**
   * Endpunkte und Entries einlesen (Einsprung fuer cron job)
   */
  public readAll() {
    if (this.dataEventHandler.listenerCount(this.dataEventHandler.evtReadDataReady) > 0) {
      this.dataEventHandler.removeAllListeners(this.dataEventHandler.evtReadDataReady);
    }
    this.dataEventHandler.on(this.dataEventHandler.evtReadDataReady, () => {
      this.log.info("... start reading entries ...");
      this.readFs();
    });

    if (this.dataEventHandler.listenerCount(this.dataEventHandler.evtReadFsReady) > 0) {
      this.dataEventHandler.removeAllListeners(this.dataEventHandler.evtReadFsReady);
    }
    this.dataEventHandler.on(this.dataEventHandler.evtReadFsReady, () => {
      // push info "new tree"
      this.log.debug("event evtReadFsReady");
    });

    this.log.info("... start reading EPs ...");
    this.readEps();
  }

  /**
   * Rollen, User, EPs aus dem AD holen und in der DB ablegen.
   *
   */
  public readEps() {
    const reader: FarcReadEps = new FarcReadEps(this.dataEventHandler, this.db, this.spk);
    reader.readEps();
  }

  /**
   * Verzeichnisse fuer alle Endpunkte einlesen
   *
   */
  public readFs() {
    const reader: FarcFilesystem = new FarcFilesystem(this.dataEventHandler, this.db);
    reader.read();
  }

}
