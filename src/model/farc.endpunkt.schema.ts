/**
 * Created by hb on 19.08.16.
 */

import {
    Schema,
} from "mongoose";

/*
 Endpunkt
 */
export let farcEndpunktSchema = new Schema({  // schema
  endpunkt: String,  // Dir-Name
  above   : String,   // Pfad ueber EP (no leading, trailing slash)
  size    : Number,  // = tree.tree.treesize
  // roles   : [String],
  // arc     : Boolean,
  // tree    : {type: Schema.Types.ObjectId, ref: "TREE"},
  drive   : Schema.Types.ObjectId,
  // drive   : {type: Schema.Types.ObjectId, ref: "DRIVE"}, // ->  .find().populate("drive").
  // epid    : String,   // id f. EP -> daten: Name der AD-Gruppe, home: dir-Name, inst: Pfad (backslash?)
  // key     : Number,
  oe      : Schema.Types.ObjectId, // -> farc.oe.schema
});
