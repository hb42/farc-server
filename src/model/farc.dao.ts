import {
    FarcEndpunktDocument,
} from "@hb42/lib-farc";
import { LoggerService } from "@hb42/lib-server";

import {
  FarcDB,
  ServiceHandler,
} from "../services";

export class FarcDAO {

  private db: FarcDB;

  private log = LoggerService.get("farc-server.model.FarcDAO");

  constructor(private services: ServiceHandler) {
    this.db = services.db;
  }

  public getEps(): Promise<FarcEndpunktDocument[]> {
    this.log.info("farcService.getEps() ");
    return this.db.farcEndpunktModel.find({}).exec();
  }
}
