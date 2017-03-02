/**
 * Created by hb on 06.02.17.
 */

import {
  FarcConfig,
  FarcConfigDocument,
} from "@hb42/lib-farc";

import {
  FarcDB,
} from "../services";

export class FarcConfigDAO {

  constructor(private db: FarcDB) {
    console.info("c'tor FarcConfigDao");
  }

  public findConfig(confName: string): Promise<any> {
    // empty result -> null (kein error)
    return this.db.farcConfigModel.findOne({name: confName}).exec()
        .then( (conf) => {
          if (conf !== null && conf !== undefined ) {
            return conf.value;
          } else {
            return null;
          }
        });
  }

  public updateConfig(confName: string, newValue: any): Promise<FarcConfigDocument> {
    return this.findConfig(confName).then( (val) => {
      if (val) {
        return this.db.farcConfigModel.findOneAndUpdate({name: confName}, { value: newValue }, {new: true} ).exec();
      } else {
        return this.create({name: confName, value: newValue});
      }
    });
  }

  public find(condition: Object): Promise<FarcConfigDocument[]> {
    return this.db.farcConfigModel.find(condition).exec();
  }

  public create(conf: FarcConfig): Promise<FarcConfigDocument> {
    return this.db.farcConfigModel.create(conf);
  }

  public delete(confName: string): Promise<any> {  // { result: { ok: 1, n: 1 }, connection: ..
    return this.db.farcConfigModel.remove({name: confName}).exec();
  }

}
