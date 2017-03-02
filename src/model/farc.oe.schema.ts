/**
 * Created by hb on 19.08.16.
 */

import {
  Schema,
} from "mongoose";

import {
  FarcRole,
} from "@hb42/lib-farc";

/*
 OEs bzw. Abteilungen fuer die Endpunkt-Zuordnung
 */
export let farcOeSchema = new Schema({  // schema
  name: String,  // OE-Bezeichnung
  roles: [ {name: String, dn: String} ], // AD-Rollen mit displayName + distinguishedName
  // roles: FarcRole[],
});
