/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EventEmitter = require('events').EventEmitter;
const fs = require('fs');
const os = require('os');
const path = require('path');

const assert = require('insist');

const intel = require('../');

const NOW = Date.now();
var counter = 1;
function tmp() {
  return path.join(os.tmpDir(),
      'intel-' + NOW + '-' + process.pid + '-' + (counter++));
}

module.exports = {
  'Handler': {
    'constructor': {
      'should accept options': function() {
        var h = new intel.Handler({ level: intel.ERROR });
        assert.equal(h.level, intel.ERROR);
      },
      'should accept a level': function() {
        var h = new intel.Handler(intel.WARN);
        assert.equal(h.level, intel.WARN);
      }
    },
    'handle': {
      'requires emit to accept a callback argument': function() {
        var h = new intel.Handler();

        assert.throws(function() {
          h.emit = 1;
        }, function(err) {
          return err.message === 'emit must be a function';
        });

        assert.throws(function() {
          h.emit = function(){};
        }, function(err) {
          return err.message ===
            'emit must accept 2 arguments (record, callback)';
        });

        h = new intel.Handler();
        assert.doesNotThrow(function() {
          h.emit = function(record, callback){
            record = callback;
          };
        });
      },
      'should use filters on record': function(done) {
        var h = new intel.Handler();
        var lastRecord;
        h.emit = function(record, callback){
          lastRecord = record;
          callback();
        };

        var filter = new intel.Filter('foo');
        h.addFilter(filter);
        h.handle({ name: 'foo' }).then(function() {
          assert.equal(lastRecord.name, 'foo');
          return h.handle({ name: 'foobar' });
        }).then(function() {
          assert.notEqual(lastRecord.name, 'foobar');

          h.removeFilter(filter);
          return h.handle({ name: 'foobar' });
        }).then(function() {
          assert.equal(lastRecord.name, 'foobar');
        }).done(done);
      },
      'should timeout if taking too long': function(done) {
        var h = new intel.Handler({ timeout: 10 });
        h.emit = function(record, callback) {
          record = callback;
          // never call callback, so it should timeout
        };

        h.handle({ message: 'foo' }).then(function() {
          assert(false); // shouldn't be called
        }, function(reason) {
          assert(reason);
        }).done(done);
      }
    },
    'emit': {
      'must be overriden by subclasses': function() {
        var h = new intel.Handler();
        assert.throws(h.emit);
      }
    }
  },
  'Stream': {
    'constructor': {
      'should accept options': function() {
        var stream = {};
        var handler = new intel.handlers.Stream({
          level: intel.INFO,
          stream: stream
        });

        assert.equal(handler.level, intel.INFO);
        assert.equal(handler._stream, stream);
      },
      'should accept just a stream': function() {
        var stream = {};
        var handler = new intel.handlers.Stream(stream);

        assert.equal(handler.level, intel.NOTSET);
        assert.equal(handler._stream, stream);
      }
    },
    'emit': {
      'should write message to stream': function(done) {
        var out;
        var stream = {
          write: function(msg, fn) {
            out = msg;
            fn();
          }
        };

        var handler = new intel.handlers.Stream(stream);
        handler.handle({ message: 'foo' }).then(function() {
          assert.equal(out, 'foo\n');
          done();
        });
      },
      'should wait for flush on slow streams': function(done) {
        var out;
        var stream = new EventEmitter();
        stream.write = function write(data, fn) {
          setTimeout(function() {
            out = data;
            fn();
          }, 1);
        };
        var handler = new intel.handlers.Stream(stream);
        handler.handle({ message: 'secret' }).then(function() {
          assert.equal(out, 'secret\n');
        }).done(done);
      }
    }
  },
  'File': {
    'constructor': {
      'should accept options': function() {
        var filename = tmp();
        var handler = new intel.handlers.File({
          level: intel.WARN,
          file: filename
        });

        assert.equal(handler.level, intel.WARN);
        assert.equal(handler._file, filename);
      },
      'should accept a filename': function() {
        var filename = tmp();
        var handler = new intel.handlers.File(filename);

        assert.equal(handler._file, filename);
      }
    },
    'handle': {
      'should write to the file': function(done) {
        var filename = tmp();
        var handler = new intel.handlers.File(filename);
        handler.handle({ message: 'recon' }).then(function() {
          fs.readFile(filename, function(err, contents) {
            assert.ifError(err);
            assert.equal(contents.toString(), 'recon\n');
            done();
          });
        }).done();
      }
    }
  },
  'Console': {
    'constructor': {
      'should use stdout and stderr': function() {
        var h = new intel.handlers.Console();
        assert.equal(h._out._stream, process.stdout);
        assert.equal(h._err._stream, process.stderr);
      },
      'should pass options to StreamHandlers': function() {
        var f = new intel.Formatter({ colorize: true });
        var h = new intel.handlers.Console({ formatter: f });
        assert(h._out._formatter._colorize);
      }
    },
    'handle': {
      'should send low priority messages to stdout': function(done) {
        var h = new intel.handlers.Console();
        var val;
        h._out._stream = {
          write: function(out, callback) {
            val = out;
            callback();
            return true;
          }
        };

        h.handle({ level: intel.INFO, message: 'oscar mike' }).then(function() {
          assert.equal(val, 'oscar mike\n');
        }).done(done);
      },
      'should send warn and higher messages to stderr': function(done) {
        var h = new intel.handlers.Console();
        var val;
        h._err._stream = {
          write: function(out, callback) {
            val = out;
            callback();
            return true;
          }
        };

        h.handle({ level: intel.WARN, message: 'mayday' }).then(function() {
          assert.equal(val, 'mayday\n');
        }).done(done);
      }
    }
  }
};
