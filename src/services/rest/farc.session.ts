/**
 * Created by hb on 10.04.17.
 */

import {
  FarcOeDocument,
  FarcUserDocument,
} from "../../shared/ext";
/**
 * Userdaten im Session-Objekt -> req["session"]["user"]
 */
export interface FarcSession {
  u: FarcUserDocument;
  oe: FarcOeDocument;
  admin: boolean;
}
