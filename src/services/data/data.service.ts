import {
  LoggerService,
} from "@hb42/lib-server";

import {
  DataEventEmitter,
  DataServiceHandler,
  FarcFilesystem,
  FarcReadEps,
} from ".";

export class DataService {

  private log = LoggerService.get("farc-server.services.data.DataService");
  private readonly dataEventHandler: DataEventEmitter;

  constructor(private services: DataServiceHandler) {
    this.dataEventHandler = services.dataEventHandler;
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
    // event wird von readEps() ausgeloest
    this.dataEventHandler.on(this.dataEventHandler.evtReadDataReady, () => {
      this.log.info("... start reading entries ...");
      this.readFs();
    });

    // Event wird in DataServiceHandler behandelt
    // this.dataEventHandler.on(this.dataEventHandler.evtReadFsReady, () => {

    this.log.info("... start reading EPs ...");
    this.readEps();
  }

  /**
   * Rollen, User, EPs aus dem AD holen und in der DB ablegen.
   *
   */
  public readEps() {
    const epReader: FarcReadEps = new FarcReadEps(this.services);
    epReader.readEps();
  }

  /**
   * Verzeichnisse fuer alle Endpunkte einlesen
   *
   */
  public readFs() {
    const fsReader: FarcFilesystem = new FarcFilesystem(this.services);
    fsReader.read();
  }

}
