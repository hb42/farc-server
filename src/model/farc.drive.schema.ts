/**
 * Created by hb on 19.08.16.
 */

import {
    Schema,
} from "mongoose";

/*
 Laufwerk-Daten
 */
export let farcDriveSchema = new Schema({
  displayname: String,  // source-Name (z.B. J:)
  sourcepath : String,
  archivepath: String,
  type       : Number,  // Enum FarcDriveTypes
});
