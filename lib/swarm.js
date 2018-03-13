'use strict';

var CID = require('cids');
var Keccak = require('keccakjs');
var multihash = require('multihashes');
var request = require('xhr-request');

var _require = require('../lib/util.js'),
    errInvalidElement = _require.errInvalidElement,
    isContentElement = _require.isContentElement;

/**
 * @module/constellate/src/swarm
 */

// The following code is from https://github.com/axic/swarmhash/blob/master/index.js


var hashChunk = function hashChunk(chunk, size, tasks, t, i) {
  var hash = new Keccak(256);
  var tmp = Buffer.alloc(8);
  tmp.writeUIntLE(size, 0, 6);
  hash.update(tmp);
  hash.update(chunk);
  tasks.run(t, Buffer.from(hash.digest(), 'binary'), i);
};

// The following code is adapted from https://github.com/ethereum/go-ethereum/blob/master/swarm/storage/chunker.go
var swarmHash = function swarmHash(data, tasks, t, i) {
  var depth = 0,
      treeSize = void 0;
  for (treeSize = 4096; treeSize < data.length; treeSize *= 128) {
    depth++;
  }split(data, depth, data.length, treeSize / 128, tasks, t, i);
};

var split = function split(chunk, depth, size, treeSize, tasks, t, i) {
  while (depth && size < treeSize) {
    treeSize /= 128;
    depth--;
  }
  if (!depth) {
    return hashChunk(chunk, size, tasks, t, i);
  }
  var chunks = void 0,
      count = 0,
      secSize = void 0;
  var t1 = tasks.add(function (chunk, j) {
    chunks[j] = chunk;
    if (++count !== chunks.length) return;
    hashChunk(Buffer.concat(chunks), size, tasks, t, i);
  });
  chunks = new Array(Math.floor((size + treeSize - 1) / treeSize));
  for (var j = 0, s = 0; s < size; j++, s += treeSize) {
    if (size - s < treeSize) {
      secSize = size - s;
    } else {
      secSize = treeSize;
    }
    split(chunk.slice(s, s + secSize), depth - 1, secSize, treeSize / 128, tasks, t1, j);
  }
};

// The following code is adapted from https://github.com/axic/swarmgw/blob/master/index.js
// const isValidHash = (hash: string): boolean => {
//   return /^[a-f0-9]{64}$/.test(hash)
// }

function ContentService(url) {
  this.url = url;
}

ContentService.prototype.hash = function (content, tasks, t, i) {
  var t1 = tasks.add(function (data) {
    tasks.run(t, data.toString('hex'), i);
  });
  swarmHash(content, tasks, t1);
};

ContentService.prototype.pathToURL = function (path) {
  return this.url + '/bzzr://' + path;
};

ContentService.prototype.get = function (path, tasks, t, i) {
  request(this.pathToURL(path), { responseType: 'arraybuffer' }, function (err, data, res) {
    if (err) {
      return tasks.error(err);
    }
    if (res.statusCode !== 200) {
      return tasks.error(err);
    }
    tasks.run(t, Buffer.from(data), i);
  });
};

ContentService.prototype.put = function (contents, tasks, t, i) {
  var _this = this;

  var hashes = new Array(contents.length);
  var count = 0;

  var _loop = function _loop(j) {
    request(_this.url + '/bzzr:', {
      method: 'POST',
      body: contents[j]
    }, function (err, data, res) {
      if (err) {
        return tasks.error(err);
      }
      if (res.statusCode !== 200) {
        return tasks.error(data);
      }
      // if (!isValidHash(data)) {
      //   return tasks.error('invalid hash: ' + data)
      // }
      hashes[j] = data;
      if (++count !== contents.length) return;
      tasks.run(t, hashes, i);
    });
  };

  for (var j = 0; j < contents.length; j++) {
    _loop(j);
  }
};

module.exports = {
  ContentService: ContentService
};