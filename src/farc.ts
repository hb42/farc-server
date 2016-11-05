// // <reference path="../app/_include.ts" />
// /**
//  * Created by hb on 12.04.16.
//  */
//
//
// //import express = require("express");
// import mongoose = require("mongoose");
// //import cors = require("cors");
// import http = require("http");
//
// import {
//     FarcEndpunktSchema,
//     FarcTreeSchema,
//     FarcTreeNode,
//     EP,
//     TREE
// } from "../../shared/src/farc/model";
//
// var opts = { user: 'farc', pass: 'farcpw' }
// mongoose.connect('mongodb://nathan/farc', opts);
//
// // evtl. in extra Modul
//
//
// mongoose.connection.once('open', function () {
//   console.log("succesfully connected to mongodb");
// });
//
// mongoose.connection.on('error', function(err: Error) {
//   console.error('mongodb connection error: ' + err);
// });
// // If the Node process ends, close the Mongoose connection
// process.on('SIGINT', function() {
//   console.log("\n"); // wg. ^C
//   mongoose.connection.close(function () {
//     console.log('Mongoose connection disconnected through app termination');
//     process.exit(0);
//   });
// });
//
// var serverstring = "farc-Test-Server";
// // var app = express();
//
//
// var Schema = mongoose.Schema;
// var ObjectId = mongoose.Schema.Types.ObjectId;
//
// /*
// var doc = new trees({endpunkt: 'src',
//                     above: ['Users', 'hb', 'Workspaces', 'JavaScript', 'ng2test2'],
//                     tree: []});
//
// doc.save(function (err) {
//   if (err) //return handleError(err);
//     console.log("error " + err);
// });
// */
// import * as fs from 'fs';
// import * as path from 'path';
//
// /**
//  * Verzeichnis rekursiv einlesen
//  *
//  * @param dir - Pfad
//  * @param parent - Verzeichnisknoten
//  * @param done - callback
//  */
// var walk = function(dir: string, parent: FarcTreeNode, done) {
//   fs.readdir(dir, (err, list) => {
//     list.sort();
//     if (err) return done(err);
//     var pending = list.length;
//     if (!pending) return done(null);
//     list.forEach(filename => {
//       var file = path.resolve(dir, filename);
//       fs.stat(file, (err, stat) => {
//         if (stat) {
//           var node:FarcTreeNode;
//           if (stat.isDirectory()) {
//             node = {
//               name     : filename,
//               timestamp: stat.mtime,  // atime, etc. auch speichern?
//               size     : 0,
//               children : <FarcTreeNode[]>[],
//               files : <FarcTreeNode[]>[],
//               type : 'D'
//             };
//             parent.children.push(node);
//             walk(file, node, (err) => {
//               pending--;
//               if (!pending) done(null);
//             });
//           } else {
//             node = {
//               name     : filename,
//               timestamp: stat.mtime,
//               size     : stat.size,
//               type     : 'F'
//             };
//             parent.files.push(node);
//             parent.size += node.size;
//             pending--;
//             if (!pending) done(null);
//           }
//         } else {
//           console.log("stat error: " + err);
//         }
//       });
//     });
//   });
// };
//
// /**
//  * Treesize der Knoten berechnen
//  *
//  * @param tree - Verzeichnis
//  */
// var makeSum = function(tree: FarcTreeNode): void {
//   var recur = function(nodes: FarcTreeNode[]): number {
//     // nodes.sort((a,b) => a.name.localeCompare(b.name) );
//     let sum: number = 0;
//     nodes.forEach(node => {
//       // node.files.sort((a,b) => a.name.localeCompare(b.name) );
//       node.treesize = node.size + recur(node.children);
//       sum += node.treesize;
//     })
//     return sum;
//   }
//   // tree.files.sort((a,b) => a.name.localeCompare(b.name) );
//   tree.treesize = recur(tree.children);
// }
//
// /*
//   DEBUG print
//  */
// var prt = function(tree: FarcTreeNode) {
//
//   var recur = function(nodes: FarcTreeNode[], lvl: number) {
//     let bl: string = "";
//     for (let i=0; i<lvl; i++) {
//       bl += "  ";
//     }
//     nodes.forEach(t => {
//       console.log(bl + (t.type? t.type + ' ' : 'D ') + t.name + " (" + t.treesize + ")  " + t.timestamp);
//       if (t.children) {
//         recur(t.children, lvl + 1);
//       }
//     });
//
//   }
//   recur(tree.children, 0);
//
//   console.log("tree.size: " + tree.size + " tree.treesize: " + tree.treesize);
// };
//
// /**
//  * Baum fuer Endpunkt einlesen und speichern
//  *
//  * @param endpunkt
//  */
// var readEp = function(endpunkt: FarcEndpunktSchema) {
//   let startread = Date.now();
//   var drive:string = ""; // TODO aus endpunkt.drive.path holen
//   let epPath:string = [drive].concat(endpunkt.above).concat(endpunkt.endpunkt).join('/');
//
//   // Startknoten fuer den Baum
//   let root:FarcTreeNode = {
//     name     : endpunkt.endpunkt,
//     timestamp: null,
//     size     : 0,
//     children : <FarcTreeNode[]>[],
//     files    : <FarcTreeNode[]>[],
//     type     : 'E'
//   };
//   // neues document f. tree data
//   // (wenn hier schon root eingetragen wuerde, wuerde der Datensatz mit diesem Stand gespeichert,
//   //  ohne die im Folgenden eingelesenen Daten)
//   let tree = new TREE({endpunkt: endpunkt._id, tree: null});
//
//   console.log("node: " + root.name);
//
//   // Rekursion
//   walk(epPath, root, (err) => {
//     if (err) throw err;
//
//     console.log("milis reading=" + (Date.now() - startread));
//
//     startread = Date.now();
//     // Summen berechnen und eintragen, dann muss das zur Laufzeit nicht mehr berechnet werden
//     makeSum(root);
//
//     // tree data im Datensatz eintragen (erst eintragen, wenn der Baum aufgebaut ist)
//     tree.tree = root;
//     endpunkt.size = root.treesize;
//
//     // tree data speichern
//     tree.save(err => {
//       if (err) {
//         console.log("db error " + err);
//       } else {
//         // id im parent document eintragen
//         endpunkt.tree = tree._id;
//         endpunkt.save(err => {
//           if (err) {
//             console.log("db error " + err);
//           }
//         });
//       }
//     });
//     console.log("milis adding=" + (Date.now() - startread));
//
//     //DEBUG
//     prt(root);
//
//
//   });
// };
//
//
//
// // Endpunkte in db anlegen (fkt. nur mit callback)
// /*
// EP.find(err => {
//   if (err) {
//     console.log("remove err=" + err);
//   } else {
//     console.log("EP found " );
//   }
// }).remove(err => {
//   if (err) {
//     console.log("err removing");
//   } else {
//     console.log("removed");
//   }
// });
//
//
// var ep1 = new EP({endpunkt: 'ng2test2',
//                        above: ['Users', 'hb', 'Workspaces', 'JavaScript'] });
// var ep2 = new EP({endpunkt: 'ng2-book',
//                        above: ['Users', 'hb', 'Workspaces', 'JavaScript'] });
// ep1.save((err, ep: EndpunktSchema) => {
//   if (err) {
//     console.log("err saving " + ep.endpunkt);
//   } else {
//     console.log("saved: " + ep.endpunkt + " - " + ep._id);
//   }
// });
// ep2.save(err => {
//   if (err) {
//     console.log("err saving " + ep2.endpunkt);
//   } else {
//     console.log("saved: " + ep2.endpunkt + " - " + ep2._id);
//   }
// });
// */
//
// /*
// // TODO: Schema tree loeschen, da hier alles neu aufgebaut wird (?? ref in endpunkt?)
// TREE.find(err => {}).remove(err => {});
//
//
// EP.find(err => {}).exec((err: Error, result: EndpunktSchema[]) => {
//   if (err) {
//     console.log("db error " + err);
//   } else {
//      result.forEach(ep => readEp(ep));
// //    result.forEach(ep => console.log("# read ep " + ep.endpunkt));
//   }
// });
// */
//
// // make drive tree
//
// let driveroot:FarcTreeNode = {
//   name     : '/',  // hier muesste drive path rein
//   timestamp: null,
//   size     : 0,
//   children : <FarcTreeNode[]>[],
//   files    : null,
//   type     : 'S'
// };
//
// EP.find(err => {}).populate('tree').exec((err: Error, result) => {
//   if (err) {
//     console.log("db error " + err);
//   } else {
//     // console.log(result);
//     result.forEach(ep => {
//       // console.log(ep.above);
//       // console.log(ep.tree.tree.name);
//       // ep.tree.tree.children.forEach(c => console.log("  " + c.name));
//       let path = driveroot;
//       ep.above.forEach(dir => {
//         let ch = path.children.filter(node => { return dir === node.name});
//         if (ch && ch.length == 1) {
//           path = ch[0];
//         } else {
//           let child:FarcTreeNode = {
//             name     : dir,
//             timestamp: null,
//             size     : 0,
//             children : <FarcTreeNode[]>[],
//             files    : null,
//             type     : 'S'
//           };
//           path.children.push(child);
//           path = child;
//         }
//       })
//       ep.tree.tree.type = 'E';
//       path.children.push(ep.tree.tree);
//     });
//     // console.log(driveroot.name);
//     // console.log(driveroot.children[0].name);
//     // console.log(driveroot.children[0].children[0].name);
//     // console.log(driveroot.children[0].children[0].children[0].name);
//     // console.log(driveroot.children[0].children[0].children[0].children[0].name);
//     // console.log(driveroot.children[0].children[0].children[0].children[0].children);
//     prt(driveroot);
//   }
// });
//
//
