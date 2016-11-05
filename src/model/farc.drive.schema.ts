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
  displayname: String,
  sourcepath : String,
  arc        : Boolean,
  // archivepath: String,
  type       : Number,  // Enum FarcDriveTypes
});

