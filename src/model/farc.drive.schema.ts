import {
    Schema,
} from "mongoose";

/*
 Laufwerk-Daten
 */
export let farcDriveSchema = new Schema({
  displayname : String,  // source-Name (z.B. J:)
  source_path : String,  // Mountpoint || UNC
  archive_path: String,
  type        : Number,  // Enum FarcDriveTypes
  user_s      : String,  // Windows: share-user + pasword f. source || null
  pwd_s       : String,
  user_a      : String,  // Windows: share-user + pasword f. archive || null
  pwd_a       : String,

});
