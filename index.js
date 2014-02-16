var appendResources = require('plumber').appendResources;
var glob = require('plumber-glob');

var fs = require('fs');
var path = require('path');
var q = require('q');
var flatten = require('flatten');
var extend = require('extend');
var bower = require('bower');

var readFile = q.denodeify(fs.readFile);

function bowerList(options, config) {
  var defer = q.defer();
  // TODO: API wtf, why is directory not read from config? .bowerrc
  // not looked up relatively

  bower.commands.list(options, extend({
      offline: true
  }, config)).on('end', function(value) {
      defer.resolve(value);
  });

  return defer.promise;
}

function bowerPaths(moduleName, config) {
    return bowerList({paths: true, relative: false}, config).then(function(map) {
        // might be string or array of string - return flat list
        return flatten([map[moduleName]]);
    });
}

function bowerrc(directory) {
    var rcPath = path.join(directory, '.bowerrc');
    return readFile(rcPath, 'utf-8').then(JSON.parse).catch(function() {
        return {};
    });
}

function bowerConfig(directory) {
    return bowerrc(directory).then(function(bowerrc) {
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
    return bowerList({relative: false}, config).then(function(config) {
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
        return appendResources(function(supervisor) {
            var paths;
            // if files/patterns, use from component dir
            if (files) {
                paths = bowerConfig(baseDirectory).then(function(config) {
                    return bowerDirectory(moduleName, config);
                }).then(function(dir) {
                    return glob.within(dir)(files)([], supervisor);
                });
            // else use main files (if any)
            } else {
                paths = bowerConfig(baseDirectory).then(function(config) {
                    return bowerPaths(moduleName, config);
                }).then(function(paths) {
                    return glob(paths)([], supervisor);
                });
            }

            return paths;
        });
    };
};

var defaultBower = bowerOperation(process.cwd());

defaultBower.from = function(baseDirectory) {
    return bowerOperation(baseDirectory);
};

module.exports = defaultBower;
