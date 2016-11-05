// <reference path="_include.ts" />
/**
 * Created by hb on 05.06.16.
 */

import {
    FarcDriveDocument,
    FarcDriveTypes,
} from "@hb42/lib-farc";

import {
  farcDriveModel,
  farcEndpunktModel,
  farcEntryModel,
} from "./model";
import {
  ADService,
} from "./services";

export class FarcMockup {

  constructor() {
  //
  }

  /*
    DB initialisieren & Laufwerke anlegen
   */
  public makeDrive(spk: boolean): Promise<any> {
    // alle Eintraege loeschen
    return farcEntryModel.find().remove().then( e0 => {
      // alle EP loeschen
      return farcEndpunktModel.find().remove();
    }).then(e1 => {
      // alle Laufwerke loeschen
      return farcDriveModel.find().remove();
    }).then(e2 => {
      let promises = [];
      if (spk) {
        promises.push(new farcDriveModel({
          displayname: "J:",
          sourcepath : "/srv/VRZ/dfsroot/E077/daten",
          arc        : false,
          type       : FarcDriveTypes.daten,
        }).save());
        promises.push(new farcDriveModel({
          displayname: "Archiv für J:",
          sourcepath : "/srv/samba/_archive/daten",
          arc        : true,
          type       : FarcDriveTypes.daten,
        }).save());

        promises.push(new farcDriveModel({
          displayname: "I:",
          sourcepath : "/srv/VRZ/dfsroot/E077/Inst",
          arc        : false,
          type       : FarcDriveTypes.inst,
        }).save());
        promises.push(new farcDriveModel({
          displayname: "Archiv für I:",
          sourcepath : "/srv/samba/_archive/inst",
          arc        : true,
          type       : FarcDriveTypes.inst,
        }).save());

        promises.push(new farcDriveModel({
          displayname: "U:",
          sourcepath : "/srv/VRZ/dfsroot/E077/Home",
          arc        : false,
          type       : FarcDriveTypes.home,
        }).save());
        promises.push(new farcDriveModel({
          displayname: "Archiv für U:",
          sourcepath : "/srv/samba/_archive/home",
          arc        : true,
          type       : FarcDriveTypes.home,
        }).save());

      } else {   // lokale Tests
        new farcDriveModel({
          displayname: "Macintosh HD",
          sourcepath : "/Users/hb", // Home, Inst
          arc        : false,
          type       : FarcDriveTypes.daten,  // HOME, DATA, INST
        }).save().then((drv: FarcDriveDocument) => {
          this.makeEps(drv);
        });
        new farcDriveModel({
          displayname: "Macintosh HD Archiv",
          sourcepath : "/Users/hb/tmp",
          arc        : true,
          type       : FarcDriveTypes.daten,
        }).save().then((drv: FarcDriveDocument) => {
          this.makeEps(drv);
        });
      }
      return promises;
    }).then( saves => {
      return Promise.all(saves).then( r => "OK");
    });

  }

  public readEPs() {
    let AD: ADService = new ADService();
    farcDriveModel.find({type: FarcDriveTypes.daten}).exec().then( rc => {
      if (rc.length === 2) {
        AD.updateEps(rc[0], rc[1]);

      } else {
        console.info("data drive count not 2 (" + rc.length + ")");
      }
    });

  }

  private makeEps(drv: FarcDriveDocument) {
    new farcEndpunktModel({
      endpunkt: "ng2test2",
      above: ["Workspaces", "JavaScript"],
      size: 0,
      drive: drv.id,
      arc: drv.arc,
      key: "e077ggx-ng2test2",
    }).save();
    new farcEndpunktModel({
      endpunkt: "ng2-book",
      above: ["Workspaces", "JavaScript"],
      size: 0,
      drive: drv.id,
      arc: drv.arc,
      key: "e077ggx-ng2-book",
    }).save();
  }

}
