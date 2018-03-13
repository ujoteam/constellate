'use strict';

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

var cbor = require('borc');
var crypto = require('crypto');
var CID = require('cids');
var multihash = require('multihashes');

var _require = require('../lib/util'),
    errPathNotFound = _require.errPathNotFound,
    isArray = _require.isArray,
    isObject = _require.isObject,
    isString = _require.isString,
    orderStringify = _require.orderStringify,
    transform = _require.transform;

/**
 * @module constellate/src/dag-cbor
 */

// The following code is adapted from
// https://github.com/ipld/js-ipld-dag-cbor/blob/master/src/resolver.js
// https://github.com/ipld/js-ipld-dag-cbor/blob/master/src/util.js


var codec = 'dag-cbor';
var version = 1;

var CID_CBOR_TAG = 42;

var decoder = new cbor.Decoder({
  tags: _defineProperty({}, CID_CBOR_TAG, function (val) {
    return { '/': val.slice(1) };
  })
});

var serialize = function serialize(elem, tasks, t, i) {
  var seen = [];
  var cid = void 0;
  var tagged = transform(elem, function (val) {
    if (!isObject(val)) {
      return val;
    }
    if (seen.some(function (obj) {
      return orderStringify(obj) === orderStringify(val);
    })) {
      return tasks.error('the object passed has circular references');
    }
    seen.push(val);
    if (!(cid = val['/'])) {
      return val;
    }
    if (isString(cid)) {
      cid = new CID(cid.split('/')[0]).buffer;
    }
    return new cbor.Tagged(CID_CBOR_TAG, Buffer.concat([Buffer.from('00', 'hex'), cid]));
  });
  try {
    var data = cbor.encode(tagged);
    tasks.run(t, data, i);
  } catch (err) {
    tasks.error(err);
  }
};

var sha2_256 = function sha2_256(data) {
  return crypto.createHash('sha256').update(data).digest();
};

module.exports = {
  codec: codec,
  version: version,
  serialize: serialize,
  deserialize: function deserialize(data, tasks, t, i) {
    try {
      var elem = decoder.decodeFirst(data);
      tasks.run(t, elem, i);
    } catch (err) {
      tasks.error(err);
    }
  },

  cid: function cid(elem, tasks, t, i) {
    var t1 = tasks.add(function (data) {
      try {
        var mh = multihash.encode(sha2_256(data), 'sha2-256');
        var cid = new CID(version, codec, mh);
        tasks.run(t, cid, data, i);
      } catch (err) {
        tasks.error(err);
      }
    });
    serialize(elem, tasks, t1);
  },

  resolve: function resolve(elem, path, tasks, t, i) {
    if (!path || path === '/') {
      return tasks.run(t, elem, '', i);
    }
    var parts = path.split('/');
    var remPath = '',
        val = elem;
    for (var j = 0; j < parts.length; j++) {
      if (isArray(val) && !Buffer.isBuffer(val)) {
        val = val[Number(parts[j])];
      } else if (val[parts[j]]) {
        val = val[parts[j]];
      } else {
        if (!val) {
          return tasks.error(errPathNotFound(path));
        }
        remPath = parts.slice(j).join('/');
        break;
      }
    }
    tasks.run(t, val, remPath, i);
  }
};