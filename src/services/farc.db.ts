/**
 * Created by hb on 23.10.16.
 */

import * as mongoose from "mongoose";

import {
    FarcDriveDocument,
    FarcEndpunktDocument,
    FarcEntryDocument,
    FarcTreeDocument,
    FarcUserDocument,
} from "@hb42/lib-farc";
import {
  MongoDB,
} from "@hb42/lib-server";

import {
  farcDriveSchema,
  farcEndpunktSchema,
  farcEntrySchema,
  farcTreeSchema,
  farUserSchema,
} from "../model";

export class FarcDB {

  private db: MongoDB;
  private farcDriveMod: mongoose.Model<FarcDriveDocument>;
  private farcEndpunktMod: mongoose.Model<FarcEndpunktDocument>;
  private farcEntryMod: mongoose.Model<FarcEntryDocument>;
  private farcTreeMod: mongoose.Model<FarcTreeDocument>;
  private farcUserMod: mongoose.Model<FarcUserDocument>;

  constructor(server: string, db: string, port: number, cred: any) {
    // DB-Connection
    this.db = new MongoDB(server, db, port, cred);
    this.makeModels();
  }

  public get mongo(): MongoDB {
    return this.db;
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
  public get farcTreeModel(): mongoose.Model<FarcTreeDocument> {
    return this.farcTreeMod;
  }
  public get farcUserModel(): mongoose.Model<FarcUserDocument> {
    return this.farcUserMod;
  }

  private makeModels() {
    this.farcDriveMod = this.db.getConnection()
                        .model<FarcDriveDocument>("DRIVE", farcDriveSchema, "farc_drive");

    this.farcEndpunktMod = this.db.getConnection()
                           .model<FarcEndpunktDocument>("EP", farcEndpunktSchema, "farc_endpunkt");

    this.farcEntryMod = this.db.getConnection()
                        .model<FarcEntryDocument>("ENTRY", farcEntrySchema, "farc_entry");

    this.farcTreeMod = this.db.getConnection()
                       .model<FarcTreeDocument>("TREE", farcTreeSchema, "farc_tree");

    this.farcUserMod = this.db.getConnection()
                       .model<FarcUserDocument>("USER", farUserSchema, "farc_user");
  }

}
