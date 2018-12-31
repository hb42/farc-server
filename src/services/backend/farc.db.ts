/**
 * Created by hb on 23.10.16.
 */

import * as mongoose from "mongoose";

import {
  FarcConfigDocument,
  FarcDriveDocument,
  FarcEndpunktDocument,
  FarcEntryDocument,
  FarcOeDocument,
  FarcResultDocument,
  FarcUserDocument,
} from "@hb42/lib-farc";
import {
  MongoDB,
} from "@hb42/lib-server";

import {
  farcConfigSchema,
  farcDriveSchema,
  farcEndpunktSchema,
  farcEntrySchema,
  farcOeSchema,
  farcResultSchema,
  farcUserSchema,
} from "../../model";

export class FarcDB {

  private readonly db: MongoDB;
  private farcConfigMod: mongoose.Model<FarcConfigDocument>;
  private farcDriveMod: mongoose.Model<FarcDriveDocument>;
  private farcEndpunktMod: mongoose.Model<FarcEndpunktDocument>;
  private farcEntryMod: mongoose.Model<FarcEntryDocument>;
  private farcOeMod: mongoose.Model<FarcOeDocument>;
  private farcUserMod: mongoose.Model<FarcUserDocument>;
  private farcResultMod: mongoose.Model<FarcResultDocument>;

  constructor(server: string, db: string, port: number, cred: mongoose.ConnectionOptions) {
    // DB-Connection
    this.db = new MongoDB(server, db, port, cred);
    this.makeModels();
  }

  public get mongo(): MongoDB {
    return this.db;
  }
  public get farcConfigModel(): mongoose.Model<FarcConfigDocument> {
    return this.farcConfigMod;
  }
  public get farcDriveModel(): mongoose.Model<FarcDriveDocument> {
    return this.farcDriveMod;
  }
  public get farcEndpunktModel(): mongoose.Model<FarcEndpunktDocument> {
    return this.farcEndpunktMod;
  }
  public get farcEntryModel(): mongoose.Model<FarcEntryDocument> {
    return this.farcEntryMod;
  }
  public get farcOeModel(): mongoose.Model<FarcOeDocument> {
    return this.farcOeMod;
  }
  public get farcUserModel(): mongoose.Model<FarcUserDocument> {
    return this.farcUserMod;
  }
  public get farcResultModel(): mongoose.Model<FarcResultDocument> {
    return this.farcResultMod;
  }

  private makeModels() {
    this.farcConfigMod = this.db.getConnection()
                        .model<FarcConfigDocument>("CONFIG", farcConfigSchema, "farc_config");

    this.farcDriveMod = this.db.getConnection()
                        .model<FarcDriveDocument>("DRIVE", farcDriveSchema, "farc_drive");

    this.farcEndpunktMod = this.db.getConnection()
                           .model<FarcEndpunktDocument>("EP", farcEndpunktSchema, "farc_endpunkt");

    this.farcEntryMod = this.db.getConnection()
                        .model<FarcEntryDocument>("ENTRY", farcEntrySchema, "farc_entry");

    this.farcOeMod = this.db.getConnection()
                       .model<FarcOeDocument>("OE", farcOeSchema, "farc_oe");

    this.farcUserMod = this.db.getConnection()
                       .model<FarcUserDocument>("USER", farcUserSchema, "farc_user");

    this.farcResultMod = this.db.getConnection()
                         .model<FarcResultDocument>("RESULT", farcResultSchema, "farc_result");
  }

}
