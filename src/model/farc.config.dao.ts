/**
 * Created by hb on 06.02.17.
 */

import {
  FarcDB,
} from "../services";
import {
  FarcConfig,
  FarcConfigDocument,
} from "../shared/ext";

export class FarcConfigDAO {

  constructor(private db: FarcDB) {
    console.info("c'tor FarcConfigDao");
  }

  public findConfig(confName: string): Promise<any> {
    return this.findConf(confName).then( (conf) => {
      if (conf) {
        return conf.value;
      } else {
        return null;
      }
    });
  }

  public updateConfig(confName: string, newValue: any): Promise<FarcConfigDocument> {
    return this.findConf(confName).then( (val: FarcConfigDocument) => {
      if (val) {
        val.value = newValue;
        return val.save();
      } else {
        return this.create({name: confName, value: newValue});
      }
    });
  }

  public find(condition: object): Promise<FarcConfigDocument[]> {
    return this.db.farcConfigModel.find(condition).exec();
  }

  public create(conf: FarcConfig): Promise<FarcConfigDocument> {
    return this.db.farcConfigModel.create(conf);
  }

  public delete(confName: string): Promise<any> {  // { result: { ok: 1, n: 1 }, connection: ..
    return this.db.farcConfigModel.remove({name: confName}).exec();
  }

  private findConf(confName: string): Promise<FarcConfigDocument> {
    // empty result -> null (kein error)
    return this.db.farcConfigModel.findOne({name: confName}).exec()
        .then( (conf) => {
          if (conf !== null && conf !== undefined ) {
            return conf;
          } else {
            return null;
          }
        });
  }

}
