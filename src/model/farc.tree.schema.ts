/**
 * Created by hb on 19.08.16.
 */

import {
    Schema,
} from "mongoose";

/*
 Baum-Knoten  (kompatibel zu primeNG TreeNode)
 */
let farcTreeNode = new Schema ({  // sub document
  label        : String,    // TreeNode -> file-/dir-name
  timestamp    : Date,
  size         : Number,
  treesize     : Number,
  children     : Array, // [treeNode] - kann nicht auf sich selbst zeigen (TreeNode)
  files        : Array,    // [treeNode] - kann nicht auf sich selbst zeigen
  type         : String,     // "S" - Strukturverzeichnis
                             // "E" - Endpunkt
                             // "D" - Verzeichnis
                             // "F" - Datei
  arc          : Boolean,    // archive j/n
  path         : [String],    // Pfad bis hierher
  data         : Object,          // TreeNode -> ignore
  icon         : String,          // TreeNode -> run time
  expandedIcon : String,  // TreeNode -> run time
  collapsedIcon: String, // TreeNode -> run time
  leaf         : Boolean,      // TreeNode w/ lazy loading -> run time
});

/*
 eingelesener Baum fuer Endpunkt (mit backlink auf EP)
 */
export let farcTreeSchema = new Schema({  // schema
  endpunkt: { type: Schema.Types.ObjectId/*, ref: "EP"*/ },  // Ref auf endpunktSchema
  tree: farcTreeNode,
});
