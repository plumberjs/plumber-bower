var appendResources = require('plumber').appendResources;
var glob = require('plumber-glob');

var q = require('q');
var flatten = require('flatten');
var extend = require('extend');
var bower = require('bower');


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


function bowerOperation(config) {
    return function(moduleName, files) {
        return appendResources(function(supervisor) {
            var paths;
            // if files/patterns, use from component dir
            if (files) {
                paths = bowerDirectory(moduleName, config).then(function(dir) {
                    return glob.within(dir)(files)([], supervisor);
                });
            // else use main files (if any)
            } else {
                paths = bowerPaths(moduleName, config).then(function(paths) {
                    return glob(paths)([], supervisor);
                });
            }

            return paths;
        });
    };
};

var defaultBower = bowerOperation({});

defaultBower.from = function(baseDirectory, componentsDirectory) {
    return bowerOperation({
        cwd: baseDirectory,
        directory: componentsDirectory
    });
};

module.exports = defaultBower;
