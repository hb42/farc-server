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
  drive   : Schema.Types.ObjectId,
  oe      : Schema.Types.ObjectId, // -> farc.oe.schema
});
