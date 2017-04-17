/**
 * Created by hb on 25.05.16.
 */

import {
  FarcDB,
} from "../services";
import {
    FarcEndpunktDocument,
} from "../shared/ext";

// let Schema = mongoose.Schema;
// let ObjectId = Schema.Types.ObjectId;

export class FarcDAO {

  constructor(private db: FarcDB) {
    //
  }

  public getEps(): Promise<FarcEndpunktDocument[]> {
    console.info("farcService.getEps() ");
    return this.db.farcEndpunktModel.find({}).exec();
    // return this.model.EP.find(err => {
    //   if (err) {
    //     console.log("error @find " + err);
    //   } else {
    //     console.log("@find");
    //   }
    // }).exec(err => {
    //   if (err) {
    //     console.log("error @exec " + err);
    //   } else {
    //     console.log("@exec ");
    //     // return result;
    //   }
    // });
  }
};
