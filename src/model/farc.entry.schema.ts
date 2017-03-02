/**
 * Created by hb on 03.09.16.
 */

import {
    Schema,
} from "mongoose";

/*
 Baum-Knoten  (kompatibel zu primeNG TreeNode)
 */
export let farcEntrySchema = new Schema ({
  parent       : String, // Number,
  key          : {type: String, index: {unique: true } },
  label        : String,    // file-/dir-name
  timestamp    : Number,     // milis
  size         : Number,
  type         : Number,    // Enum FarcEntryTypes,
  arc          : Boolean,    // archive j/n
  path         : [String],    // Pfad bis hierher
  leaf         : Boolean,      // true -> keine Unterverzeichnisse
  selected     : Number,  // Enum FarcSelectType
  selectUid    : String,         //   UID
  selectDate   : Number,        //   milis
  processDate  : Number,    // Verarbeitung millis
  processResult: String,    //   "OK" oder Fehlermeldung

});
