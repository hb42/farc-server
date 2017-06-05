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
  FarcEndpunktDocument,
  FarcEntryDocument,
  FarcEntryTypes,
  farcPwd,
  farcUser,
  LoggerService,
  Webserver,
} from "./shared/ext";

import {
  AspAPI,
  DataService,
  FarcAPI,
  FarcDB,
  // FarcFilesystem,
  FarcUserCheck,
} from "./services";

import {isNumber} from "util";

// Standard-Logfile
LoggerService.init("../div/server.log");
// LOG fuer Admin-Infos aus dem Einlesen anlegen
const eplog = LoggerService.getFile("Endpunkte", "../div/endpunkte.log");
// LOG fuer express (als param an Webserver uebergeben)
const weblog = LoggerService.getWeb("webserver", "../div/web.log");
// TODO console nur fuer dev?
LoggerService.useConsole();
const log = LoggerService.get("farc-server.main");

// aus Webpack via DefinePlugin
declare const WEBPACK_DATA;
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
const farcserver = new Webserver(metadata.PORT, "farc", weblog, new FarcUserCheck(db, config.adminrole));

farcserver.setCorsOptions({ origin: config.webapp, credentials: true });
farcserver.addApi(new FarcAPI(db));
farcserver.setDebug(true);
farcserver.start();

// wird nur gebraucht, wenn kein IIS vorhanden
if (!metadata.SPK) {
// fake IIS
  const fakeIISserver = new Webserver(metadata.PORT + 42, "asp", weblog);
  const asp = new AspAPI();
  asp.setUser("v998dpve\\s0770007");
  asp.setWebservice({
                      farc: {server: "http://localhost:23100", url: "/authenticate"},
                    });
  fakeIISserver.setDebug(true);
  fakeIISserver.addApi(asp);
  fakeIISserver.setCorsOptions({ origin: config.webapp, credentials: true });
  // fakeIISserver.setCorsOptions({ origin: "http://localhost:23000", credentials: true });
  fakeIISserver.setStaticContent(null);

  fakeIISserver.start();
}

// FARC-static Webapp-Server (nur fuer prod)
if (metadata.ENV === "production") {
  const staticserver = new Webserver(metadata.PORT - 100, "farc-static", weblog);
  staticserver.setFaviconPath("./resource/favicon.ico");
  staticserver.setStaticContent("./static");
  staticserver.setStaticUrl("/");
  staticserver.start();
}

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
  // dataservice.readAll();

/*        
  // ---- DEBUG ----
  const getdirentries = (key) => {
    db.farcEntryModel.find({parent: key}).exec().then((res: FarcEntryDocument[]) => {
      res.forEach((item: FarcEntryDocument) => {
        if (item.type !== FarcEntryTypes.file) {
          console.info(FarcEntryTypes[item.type]  
                       + " " + item.path.join("/"));
          getdirentries(item.key);
        }
      });
    });
  };

  db.farcEndpunktModel.find().exec()
      .then((result: FarcEndpunktDocument[]) => {
          // console.info(result);
        console.info("found " + result.length + " EPs");
        result.sort((a, b) => (a.drive.toString() + a.above + a.endpunkt).
                              localeCompare(b.drive.toString() + b.above + b.endpunkt));
        result.forEach((ep) => {
          getdirentries(ep._id.toString());
        });
      });

  // ---- ----
*/

}, 5000); // 5 sec, damit vorher alles initalisiert ist

// let counter: number = 0;
// timers.setInterval( () => {
//   log.trace("trace " + ++counter);
//   log.debug("debug " + counter);
//   log.info("info " + counter);
//   log.warn("warn " + counter);
//   log.error("error " + counter);
//   log.fatal("fatal " + counter);
//   eplog.info("EP-Info " + counter);
// }, 3000);

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
