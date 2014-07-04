var operation = require('plumber').operation;
var Supervisor = require('plumber').Supervisor;
var Report = require('plumber').Report;
var Rx = require('plumber').Rx;

var fs = require('fs');
var path = require('path');
var extend = require('extend');
var flatten = require('flatten');
var bower = require('bower');

var readFile = Rx.Node.fromNodeCallback(fs.readFile);

function bowerList(options, config) {
    // TODO: API wtf, why is directory not read from config? .bowerrc
    // not looked up relatively
    // FIXME: We could use Rx.Node.fromStream is Bower didn't
    // annoyingly send the value *with the end event* rather than in a
    // 'data' event. *sigh*
    return Rx.Observable.create(function(observer) {
        bower.commands.list(options, extend({
            offline: true
        }, config)).on('end', function(value) {
            observer.onNext(value);
            observer.onCompleted();
        });
    });
}

function bowerPaths(moduleName, config) {
    return bowerList({paths: true, relative: false}, config).
        // pick our module in the whole map
        pluck(moduleName).
        // might be string or array of string - flatten list
        flatMap(function(paths) {
            if (paths) {
                return Rx.Observable.fromArray(flatten([paths]));
            } else {
                return Rx.Observable.throw(new Error('Bower module not found: ' + moduleName));
            }
        });
}

function bowerrc(directory) {
    var rcPath = path.join(directory, '.bowerrc');
    return readFile(rcPath, 'utf-8').map(JSON.parse).catch(function() {
        // If the file isn't there, we just continue with an empty map
        return Rx.Observable.return({});
    });
}

function bowerConfig(directory) {
    return bowerrc(directory).map(function(bowerrc) {
        return {
            cwd: directory,
            directory: bowerrc.directory
        };
    });
}

// Recursively walk the tree of module dependencies to find one
// matching moduleName and return its canonicalDir
function findCanonicalDir(dependencies, moduleName) {
    var module = dependencies[moduleName];
    if (module) {
        return module.canonicalDir;
    } else {
        // slightly awkward recursion mechanism that returns the
        // canonicalDir of the first matching module
        var foundDir;
        Object.keys(dependencies).some(function(name) {
            foundDir = findCanonicalDir(dependencies[name].dependencies, moduleName);
            return foundDir;
        });
        return foundDir;
    }
}

function bowerDirectory(moduleName, config) {
    return bowerList({relative: false}, config).flatMap(function(config) {
        var canonicalDir = findCanonicalDir(config.dependencies, moduleName);
        if (canonicalDir) {
            return Rx.Observable.return(canonicalDir);
        } else {
            // FIXME: can we just throw and Rx catches it instead?
            return Rx.Observable.throw(new Error('Bower module not found: ' + moduleName));
        }
    });
}


function bowerOperation(baseDirectory) {
    return function(moduleName, files) {
        // FIXME: reintroduce supervisor?
        var supervisor = new Supervisor();
        return operation.concatAll(function() {
            var paths;
            // if files/patterns, use from component dir
            if (files) {
                paths = bowerConfig(baseDirectory).flatMap(function(config) {
                    return bowerDirectory(moduleName, config);
                }).flatMap(function(dir) {
                    return Rx.Observable.fromArray(flatten([files])).map(function(file) {
                        return path.join(dir, file);
                    });
                });
            // else use main files (if any)
            } else {
                paths = bowerConfig(baseDirectory).flatMap(function(config) {
                    return bowerPaths(moduleName, config);
                });
            }

            // TODO: if error, transform to report?

            return paths.map(supervisor.glob.bind(supervisor)).mergeAll();
        });
    };
};

var defaultBower = bowerOperation(process.cwd());

defaultBower.from = function(baseDirectory) {
    return bowerOperation(baseDirectory);
};

module.exports = defaultBower;
