plumber-bower [![Build Status](https://travis-ci.org/plumberjs/plumber-bower.png?branch=master)](https://travis-ci.org/plumberjs/plumber-bower)
=============

Bower sourcing operation for [Plumber](https://github.com/plumberjs/plumber) pipelines.

## Example

    var bower = require('plumber-bower');

    module.exports = function(pipelines) {

        pipelines['compile'] = [
            all(
                bower('jquery'),
                bower('moment', 'min/moment.min.js')
            ),
            // ... more pipeline operations
        ];

    };


## API

### `bower(componentName, [paths])`

Returns resources from the locally installed [Bower](http://bower.io/)
component `componentName`.  If `paths` if provided, they will be
globbed from within the component's Bower directory; otherwise the
files register as main files in the component will be returned.

The `paths` array may include wildcards like `*` or `**` (globstar).

See the [minimatch](https://github.com/isaacs/minimatch) documentation for the full available syntax.

### `bower.from(directory)`

Returns a new `bower` function rooted in the given `directory`, where
the `bower.json` (and optionally `.bowerrc`) should be located.  By
default, the current working directory is used.
