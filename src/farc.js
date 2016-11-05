"use strict";
var mongoose = require("mongoose");
var farc_model_1 = require("./model/farc-model");
var opts = { user: 'farc', pass: 'farcpw' };
mongoose.connect('mongodb://nathan/farc', opts);
mongoose.connection.once('open', function () {
    console.log("succesfully connected to mongodb");
});
mongoose.connection.on('error', function (err) {
    console.error('mongodb connection error: ' + err);
});
process.on('SIGINT', function () {
    console.log("\n");
    mongoose.connection.close(function () {
        console.log('Mongoose connection disconnected through app termination');
        process.exit(0);
    });
});
var serverstring = "farc-Test-Server";
var Schema = mongoose.Schema;
var ObjectId = mongoose.Schema.Types.ObjectId;
var fs = require('fs');
var path = require('path');
var walk = function (dir, parent, done) {
    fs.readdir(dir, function (err, list) {
        list.sort();
        if (err)
            return done(err);
        var pending = list.length;
        if (!pending)
            return done(null);
        list.forEach(function (filename) {
            var file = path.resolve(dir, filename);
            fs.stat(file, function (err, stat) {
                if (stat) {
                    var node;
                    if (stat.isDirectory()) {
                        node = {
                            name: filename,
                            timestamp: stat.mtime,
                            size: 0,
                            children: [],
                            files: [],
                            type: 'D'
                        };
                        parent.children.push(node);
                        walk(file, node, function (err) {
                            pending--;
                            if (!pending)
                                done(null);
                        });
                    }
                    else {
                        node = {
                            name: filename,
                            timestamp: stat.mtime,
                            size: stat.size,
                            type: 'F'
                        };
                        parent.files.push(node);
                        parent.size += node.size;
                        pending--;
                        if (!pending)
                            done(null);
                    }
                }
                else {
                    console.log("stat error: " + err);
                }
            });
        });
    });
};
var makeSum = function (tree) {
    var recur = function (nodes) {
        var sum = 0;
        nodes.forEach(function (node) {
            node.treesize = node.size + recur(node.children);
            sum += node.treesize;
        });
        return sum;
    };
    tree.treesize = recur(tree.children);
};
var prt = function (tree) {
    var recur = function (nodes, lvl) {
        var bl = "";
        for (var i = 0; i < lvl; i++) {
            bl += "  ";
        }
        nodes.forEach(function (t) {
            console.log(bl + (t.type ? t.type + ' ' : 'D ') + t.name + " (" + t.treesize + ")  " + t.timestamp);
            if (t.children) {
                recur(t.children, lvl + 1);
            }
        });
    };
    recur(tree.children, 0);
    console.log("tree.size: " + tree.size + " tree.treesize: " + tree.treesize);
};
var readEp = function (endpunkt) {
    var startread = Date.now();
    var drive = "";
    var epPath = [drive].concat(endpunkt.above).concat(endpunkt.endpunkt).join('/');
    var root = {
        name: endpunkt.endpunkt,
        timestamp: null,
        size: 0,
        children: [],
        files: [],
        type: 'E'
    };
    var tree = new farc_model_1.TREE({ endpunkt: endpunkt._id, tree: null });
    console.log("node: " + root.name);
    walk(epPath, root, function (err) {
        if (err)
            throw err;
        console.log("milis reading=" + (Date.now() - startread));
        startread = Date.now();
        makeSum(root);
        tree.tree = root;
        endpunkt.size = root.treesize;
        tree.save(function (err) {
            if (err) {
                console.log("db error " + err);
            }
            else {
                endpunkt.tree = tree._id;
                endpunkt.save(function (err) {
                    if (err) {
                        console.log("db error " + err);
                    }
                });
            }
        });
        console.log("milis adding=" + (Date.now() - startread));
        prt(root);
    });
};
var driveroot = {
    name: '/',
    timestamp: null,
    size: 0,
    children: [],
    files: null,
    type: 'S'
};
farc_model_1.EP.find(function (err) { }).populate('tree').exec(function (err, result) {
    if (err) {
        console.log("db error " + err);
    }
    else {
        result.forEach(function (ep) {
            var path = driveroot;
            ep.above.forEach(function (dir) {
                var ch = path.children.filter(function (node) { return dir === node.name; });
                if (ch && ch.length == 1) {
                    path = ch[0];
                }
                else {
                    var child = {
                        name: dir,
                        timestamp: null,
                        size: 0,
                        children: [],
                        files: null,
                        type: 'S'
                    };
                    path.children.push(child);
                    path = child;
                }
            });
            ep.tree.tree.type = 'E';
            path.children.push(ep.tree.tree);
        });
        prt(driveroot);
    }
});
//# sourceMappingURL=farc.js.map