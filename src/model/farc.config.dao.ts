import {
  FarcConfig,
  FarcConfigDocument, getConfigValue, setConfigValue,
} from "@hb42/lib-farc";
import { LoggerService } from "@hb42/lib-server";

import {
  FarcDB,
} from "../services";

export class FarcConfigDAO {

  private db: FarcDB;

  private log = LoggerService.get("farc-server.model.FarcConfigDAO");

  constructor(private farcdb: FarcDB) {
    this.log.info("c'tor FarcConfigDao");
    this.db = farcdb;
  }

  public findConfig(confName: string): Promise<any> {
    return this.findConf(confName).then((conf) => {
      if (conf) {
        return getConfigValue(conf.value);
      } else {
        return null;
      }
    });
  }

  public updateConfig(confName: string, newValue: any): Promise<FarcConfigDocument> {
    const newval = setConfigValue(newValue);
    return this.findConf(confName).then((val: FarcConfigDocument) => {
      if (val) {
        val.value = newval;
        return val.save();
      } else {
        return this.create({name: confName, value: newval});
      }
    });
  }

  public find(condition: object): Promise<FarcConfigDocument[]> {
    return this.db.farcConfigModel.find(condition).exec();
  }

  public create(conf: FarcConfig): Promise<FarcConfigDocument> {
    conf.value = setConfigValue(conf.value);
    return this.db.farcConfigModel.create(conf);
  }

  public delete(confName: string): Promise<any> {  // { result: { ok: 1, n: 1 }, connection: ..
    return this.db.farcConfigModel.remove({name: confName}).exec();
  }

  private findConf(confName: string): Promise<FarcConfigDocument | null> {
    // empty result -> null (kein error)
    return this.db.farcConfigModel.findOne({name: confName}).exec()
        .then((conf) => {
          if (conf !== null && conf !== undefined) {
            return conf;
          } else {
            return null;
          }
        });
  }

}
