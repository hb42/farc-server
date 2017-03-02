/*
 * Mini REST-Server fuer Tests gegen mongoDB
 * (incl. CORS)
 *
 * s.a. https://dzone.com/articles/getting-started-with-nodejs-express-and-mongoose
 */

// f. server rendering
import "reflect-metadata";

import * as fs from "fs";
// import * as fse from "fs-extra";
import * as timers from "timers";

import {
  FarcDrive,
  FarcDriveTypes,
} from "@hb42/lib-farc";

import {
  farcPwd,
  farcUser,
} from "@hb42/lib-passwd";
import {
  Webserver,
} from "@hb42/lib-server";

// import {FarcMockup} from "./farc.mockup";
import {
  AspAPI,
  DataService,
  FarcAPI,
  FarcDB,
  // FarcFilesystem,
  FarcUserCheck,
} from "./services";

// import {
//   FarcEntry,
//   FarcEntryTypes,
// } from "./common/farc/model";
//
// import {
//   farcEntryModel,
// } from "./model";

// aus Webpack via DefinePlugin
declare var WEBPACK_DATA;
const metadata = WEBPACK_DATA.metadata;
process.env.ENV = metadata.ENV;
process.env.NODE_ENV = metadata.NODE_ENV;

/*
 Mehr Threads fuer fs und mongo(?) bereitstellen (default 4)
 -> http://stackoverflow.com/questions/22644328/when-is-the-thread-pool-used
 (alt.(?): --v8-pool-size=)
 */
process.env.UV_THREADPOOL_SIZE = 127;
console.dir(process.env);
// config file
let configfile = metadata.CONFIGFILE;
configfile = "./resource/" + configfile;
const config = JSON.parse(fs.readFileSync(configfile, "utf8"));

// let mysql = new MySQL("localhost", "farc", "farc", "farcpw");

// DB-Connection
const db = new FarcDB(config.mongodbServer, config.mongodbDB, config.mongodbPort,
    { user: farcUser, pass: farcPwd } );

// // FARC-Server starten
const farcserver = new Webserver(metadata.PORT, "farc", new FarcUserCheck(db));

farcserver.setFaviconPath("./resource/favicon.ico");
farcserver.addApi("/farc", new FarcAPI(db));
farcserver.setDebug(true);
farcserver.start();

// wird nur gebraucht, wenn kein IIS vorhanden
if (!metadata.SPK) {
// fake IIS
  const fakeIISserver = new Webserver(metadata.PORT + 42, "asp");
  const asp = new AspAPI();
  asp.setUser("v998dpve\\s0770001");
  asp.setWebservice({
                      farc: {server: "http://localhost:23000", url: "/authenticate"},
                    });
  fakeIISserver.setDebug(true);
  fakeIISserver.addApi("/asp", asp);
  fakeIISserver.setCorsOptions({ origin: "http://localhost:23000", credentials: true });
  fakeIISserver.setStaticContent(null);

  fakeIISserver.start();
}

// let items = []; // files, directories, symlinks, etc
// fse.walk("/Users/hb/Workspaces/JavaScript")
//     .on("data", (item) => {
//       console.info(item.stats.isDirectory() + " " + item.path);
//       items.push(item.path);
//     })
//     .on("end", () => {
//       console.info("---");
//       console.dir(items); // => [ ... array of files]
//     });

/* initialisieren */
// let mo: FarcMockup = new FarcMockup();
// mo.makeDrive(metadata.SPK).then( () => mo.readEPs() );

/* user, etc. aus AD einlesen TODO als cron job konstruieren */
timers.setTimeout( () => {
  // alle vorhandenen Daten loeschen (dauert ein paar Minuten!)
  // const promiselist = [];
  // promiselist.push(db.farcEndpunktModel.find().remove().exec());
  // promiselist.push(db.farcOeModel.find().remove().exec());
  // promiselist.push(db.farcDriveModel.find().remove().exec());
  // promiselist.push(db.farcEntryModel.find().remove().exec());
  // promiselist.push(db.farcUserModel.find().remove().exec());
  // Promise.all(promiselist).then( () => {
  //   // Drives anlegen
  //   const drives: FarcDrive[] = [
  //     {displayname: "J:", sourcepath: "/srv/VRZ/dfsroot/E077/daten",
  //       archivepath: "/srv/samba/_archive/daten", type: FarcDriveTypes.daten},
  //     {displayname: "U:", sourcepath: "/srv/VRZ/dfsroot/E077/home",
  //       archivepath: "/srv/samba/_archive/home", type: FarcDriveTypes.home},
  //     {displayname: "I:", sourcepath: "/srv/VRZ/dfsroot/E077/inst",
  //       archivepath: "/srv/samba/_archive/inst", type: FarcDriveTypes.inst},
  //   ];
  //   db.farcDriveModel.create(drives).then( () => {
  //     console.info("drives created");
  //   });
  //  });

  // Daten einlesen
  // const dataservice = new DataService(db, metadata.SPK);
  // dataservice.readData();

}, 5000); // 5 sec, damit vorher alles initalisiert ist
/* */

// let rd = new FarcFilesystem();
//// rd.testdb();
// rd.read();
//// rd.getDirs();

// let testep = "Änd_V998DPVE\\E077\\Daten\\\\zz_allgemeine-Dateien\\intranet\\Test";
// let pattern = /^.nd_V998DPVE(\\E077\\Daten)?\\{1,2}/i;
//
// if (testep.match(pattern)) {
//   console.info(testep.replace(pattern, "").replace(/\\/g, "/").toLowerCase());
// }
/*
 CREATE TABLE "SBS_MASTER"."SBS_APKLASSE"
 (	"APKLASSE_INDEX" NUMBER(10,0) NOT NULL ENABLE,
 "APTYP_INDEX" NUMBER(10,0),
 "APKLASSE" VARCHAR2(50 BYTE) NOT NULL ENABLE,
 "FLAG" NUMBER(10,0),
 CONSTRAINT "SBS_APKLASSE_PK" PRIMARY KEY ("APKLASSE_INDEX") ENABLE,
 CONSTRAINT "SBS_APKLASSE_SBS_APTYP_FK1" FOREIGN KEY ("APTYP_INDEX")
 REFERENCES "SBS_MASTER"."SBS_APTYP" ("APTYP_INDEX") ON DELETE CASCADE ENABLE
 ) ;
 */
// let cr = `
// create table farc.test1 (
//   id int(11) not null auto_increment,
//   test1 int(11),
//   test2 varchar(255),
//   test3 tinytext,
//   primary key (id)
// );
// `;
// mysql.query(cr, rc => {
//   console.info("query result");
//   console.dir(rc);
// });
/*
 let entries = [];
 for (let i = 0; i < 100000; i++) {
 let root: FarcEntry = {
 parent    : 1,
 key       : 1,
 label     : "test",
 timestamp: null,
 size     : 0,
 type     : FarcEntryTypes.ep,
 arc      : false,
 path     : ["test1", "test2"],
 leaf     : true,
 selected : false,
 };
 entries.push(root);
 }
 farcEntryModel.insertMany(entries).then( rc => console.info("insertMany " + rc))
 .catch(e => console.info("### insertMany ERROR " + e));
 */

// Beim Beenden aufraeumen
process.on("SIGINT", () => {
  console.info("\nterminating "); // \n wg. ^C
  db.mongo.close().then( (mesg) => {
    console.info(mesg);
    process.exit(0);
  } );
});
