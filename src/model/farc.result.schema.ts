/**
 * Created by hb on 18.06.17.
 */

import {
  Schema,
} from "mongoose";

/*
 Ergebnis der Vormerkung
 */
export let farcResultSchema = new Schema ({
                                            path         : [String],
                                            label        : String,    // file-name|*
                                            arc          : Boolean,    // archive j/n
                                            selected     : Number,  // Enum FarcSelectType
                                            selectUid    : String,         //   UID
                                            selectDate   : Number,        //   milis
                                            processDate  : Number,    // Verarbeitung millis
                                            success      : Boolean,
                                            log          : String,  // log|error des scripts
                                            size         : Number, // Datei-/Verzeichnis-Groesse
                                         });
