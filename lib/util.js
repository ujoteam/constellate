'use strict';

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

var EventEmitter = require('events');
var fileType = require('file-type');
var fs = require('fs');

/**
 * @module constellate/src/util
 */

exports.assign = function () {
  for (var _len = arguments.length, objs = Array(_len), _key = 0; _key < _len; _key++) {
    objs[_key] = arguments[_key];
  }

  return Object.assign.apply(Object, [{}].concat(_toConsumableArray(objs)));
};

exports.bufferToArrayBuffer = function (buf) {
  // from https://stackoverflow.com/a/31394257
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
};

exports.bufferToFile = function (buf, name, tasks, t, i) {
  var ab = exports.bufferToArrayBuffer(buf);
  var type = fileType(buf.slice(0, 4100));
  if (!type) {
    return tasks.error('could not get file type');
  }
  type = type.mime.split('/')[0] + '/' + type.ext; // e.g. audio/mpeg -> audio/mp3
  var file = new File([ab], name, { type: type });
  tasks.run(t, file, i);
};

exports.capitalize = function (str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
};

exports.clone = function (x) {
  return JSON.parse(JSON.stringify(x));
};

exports.errInvalidElement = function (elem) {
  return new Error('invalid element: ' + JSON.stringify(elem));
};

exports.errPathNotFound = function (path) {
  return new Error('path not found: ' + path);
};

exports.errUnexpectedCID = function (cid) {
  return new Error('unexpected cid: ' + cid.toJSON());
};

exports.errUnexpectedType = function (actual, expected) {
  return new Error('expected type="' + expected + '", got "' + actual + '"');
};

exports.fileToAnchor = function (file, type) {
  var a = document.createElement('a');
  a.setAttribute('href', URL.createObjectURL(file));
  a.setAttribute('download', file.name);
  a.innerText = file.name;
  return a;
};

// from https://toddmotto.com/understanding-javascript-types-and-reliable-type-checking/

exports.getType = function (x) {
  if (x.constructor) {
    return x.constructor.name;
  }
  return Object.prototype.toString.call(x).slice(8, -1);
};

var isArray = function isArray(x, isType) {
  return x instanceof Array && (!isType || x.every(isType));
};

exports.isArray = isArray;

exports.isBoolean = function (x) {
  return typeof x === 'boolean';
};

exports.isFunction = function (x) {
  return typeof x === 'function';
};

exports.isNumber = function (x) {
  return typeof x === 'number';
};

var isObject = function isObject(x) {
  return x && x.constructor === Object;
};

exports.isObject = isObject;

var isString = function isString(x) {
  return typeof x === 'string';
};

exports.isString = isString;

exports.isMerkleLink = function (x) {
  return x && x['/'] && Object.keys(x).length === 1;
};

exports.isSender = function (sender) {
  return sender && sender.publicKey && isString(sender.publicKey);
};

exports.isRecipient = function (recipient) {
  if (isObject(recipient)) {
    return recipient.amount && exports.isNumber(recipient.amount) && recipient.publicKey && isString(recipient.publicKey);
  }
  if (isArray(recipient, isObject)) {
    return recipient.every(function (recipient) {
      return recipient.amount && exports.isNumber(recipient.amount) && recipient.publicKey && isString(recipient.publicKey);
    });
  }
  return false;
};

exports.isElement = function (x) {
  return isObject(x.data) && (!x.sender || exports.isSender(x.sender)) && (!x.recipient || exports.isRecipient(x.recipient));
};

exports.newArray = function (_default, length) {
  return Array.apply(null, { length: length }).map(function () {
    return _default;
  });
};

exports.sort = function (x, y) {
  var i = void 0;
  if (isArray(x) && isArray(y)) {
    x.sort(exports.sort);
    y.sort(exports.sort);
    var result = void 0;
    for (i = 0; i < x.length && i < y.length; i++) {
      result = exports.sort(x[i], y[i]);
      if (result) return result;
    }
    return 0;
  }
  if (isObject(x) && isObject(y)) {
    var xkeys = Object.keys(x).sort();
    var ykeys = Object.keys(y).sort();
    for (i = 0; i < xkeys.length && i < ykeys.length; i++) {
      if (xkeys[i] < ykeys[i]) return -1;
      if (xkeys[i] > ykeys[i]) return 1;
    }
    if (xkeys.length < ykeys.length) return -1;
    if (xkeys.length > ykeys.length) return 1;
    for (i = 0; i < xkeys.length && i < ykeys.length; i++) {
      if (x[xkeys[i]] < y[ykeys[i]]) return -1;
      if (x[xkeys[i]] > y[ykeys[i]]) return 1;
    }
    return 0;
  }
  if (x < y) return -1;
  if (x > y) return 1;
  return 0;
};

// adapted from https://stackoverflow.com/questions/16167581/sort-object-properties-and-json-stringify#comment73545624_40646557

exports.orderStringify = function (x, space) {
  var keys = [];
  JSON.stringify(x, function (k, v) {
    keys.push(k);
    if (isArray(v)) {
      v.sort(exports.sort);
    }
    return v;
  });
  return JSON.stringify(x, keys.sort(), space);
};

exports.order = function (x) {
  return JSON.parse(exports.orderStringify(x));
};

exports.prettyJSON = function (x) {
  return JSON.stringify(x, null, 2);
};

exports.readFileAs = function (file, readAs, tasks, t, i) {
  var reader = new FileReader();
  reader.onload = function () {
    tasks.run(t, reader.result, i);
  };
  if (readAs === 'arraybuffer') {
    reader.readAsArrayBuffer(file);
  } else if (readAs === 'text') {
    reader.readAsText(file);
  } else {
    tasks.error('unexpected readAs: ' + readAs);
  }
};

exports.transform = function (obj, fn) {
  var transform = function transform(x) {
    x = fn(x);
    if (isArray(x)) {
      return x.map(transform);
    } else if (isObject(x)) {
      return Object.keys(x).reduce(function (result, k) {
        result[k] = transform(x[k]);
        return result;
      }, {});
    }
    return x;
  };
  return transform(obj);
};

exports.traverse = function (val, fn) {
  var traverse = function traverse(trail, val, fn) {
    if (trail) fn(trail, val);
    var i = void 0;
    if (isArray(val)) {
      for (i = 0; i < val.length; i++) {
        traverse(trail + '.' + i, val[i], fn);
      }
    } else if (isObject(val)) {
      var fullPath = void 0;
      var keys = Object.keys(val);
      for (i = 0; i < keys.length; i++) {
        traverse(!trail ? keys[i] : trail + '.' + keys[i], val[keys[i]], fn);
      }
    }
  };
  traverse('', val, fn);
};

function Tasks(cb) {
  var e = new EventEmitter();
  var done = false,
      t = 0;
  this.add = function (onRun) {
    if (done) {
      return -1;
    }
    e.on('run-task' + t, onRun);
    return t++;
  };
  this.callback = function (_cb) {
    cb = _cb;
  };
  this.run = function (t) {
    for (var _len2 = arguments.length, args = Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
      args[_key2 - 1] = arguments[_key2];
    }

    if (done) return;
    if (t < 0) {
      done = true;
      if (cb) {
        cb.apply(undefined, [null].concat(_toConsumableArray(args)));
      }
      return;
    }
    e.emit.apply(e, ['run-task' + t].concat(_toConsumableArray(args)));
  };
  this.error = function (err) {
    if (done) return;
    if (isString(err)) {
      err = new Error(err);
    }
    if (!cb) {
      throw err;
    }
    cb(err);
  };
}

exports.Tasks = Tasks;