var operation = require('plumber').operation;
var Supervisor = require('plumber').Supervisor;
var glob = require('plumber-glob');

var highland = require('highland');
var fs = require('fs');
var path = require('path');
var extend = require('extend');
var bower = require('bower');

var readFile = highland.wrapCallback(fs.readFile);

function bowerList(options, config) {
    // TODO: API wtf, why is directory not read from config? .bowerrc
    // not looked up relatively
    // FIXME: simpler way to do this in Highland?
    return highland(function(push, next) {
        bower.commands.list(options, extend({
            offline: true
        }, config)).on('end', function(value) {
            push(null, value);
            push(null, highland.nil);
        });
    });
}

function bowerPaths(moduleName, config) {
    return bowerList({paths: true, relative: false}, config).
        // pick our module in the whole map
        map(highland.get(moduleName)).
        // might be string or array of string - return flat list
        flatten();
}

function bowerrc(directory) {
    var rcPath = path.join(directory, '.bowerrc');
    return readFile(rcPath, 'utf-8').map(JSON.parse).errors(function(error, push) {
        // If the file isn't there, we just continue with an empty map
        push(null, {});
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
    return bowerList({relative: false}, config).map(function(config) {
        var canonicalDir = findCanonicalDir(config.dependencies, moduleName);
        if (canonicalDir) {
            return canonicalDir;
        } else {
            throw new Error('Bower module not found: ' + moduleName);
        }
    });
}


function bowerOperation(baseDirectory) {
    return function(moduleName, files) {
        // FIXME: reintroduce supervisor?
        var supervisor = new Supervisor();
        return operation.concat(function() {
            var paths;
            // if files/patterns, use from component dir
            if (files) {
                paths = bowerConfig(baseDirectory).flatMap(function(config) {
                    return bowerDirectory(moduleName, config);
                }).flatMap(function(dir) {
                    return highland([files]).flatten().map(function(file) {
                        return path.join(dir, file);
                    });
                });
            // else use main files (if any)
            } else {
                paths = bowerConfig(baseDirectory).flatMap(function(config) {
                    return bowerPaths(moduleName, config);
                });
            }

            return paths.map(supervisor.glob.bind(supervisor)).merge();
        });
    };
};

var defaultBower = bowerOperation(process.cwd());

defaultBower.from = function(baseDirectory) {
    return bowerOperation(baseDirectory);
};

module.exports = defaultBower;
