'use strict';

var Block = require('ipfs-block');
var CID = require('cids');
var dagCBOR = require('../lib/dag-cbor');
var DAGNode = require('ipld-dag-pb').DAGNode;
var FilesAPI = require('ipfs-api/src/files');
var IPFS = require('ipfs');
var isIpfs = require('is-ipfs');
var moduleConfig = require('ipfs-api/src/utils/module-config');
var Repo = require('ipfs-repo');
var streamToValue = require('ipfs-api/src/utils/stream-to-value');
var UnixFS = require('ipfs-unixfs');
var multiaddr = require('multiaddr');
// const wrtc = require('wrtc')
// const WStar = require('libp2p-webrtc-star')

var _require = require('../lib/util'),
    errInvalidElement = _require.errInvalidElement,
    errPathNotFound = _require.errPathNotFound,
    errUnexpectedCID = _require.errUnexpectedCID,
    isArray = _require.isArray,
    isElement = _require.isElement,
    isMerkleLink = _require.isMerkleLink,
    isObject = _require.isObject,
    order = _require.order,
    transform = _require.transform;
/**
 * @module constellate/src/ipfs
 */
// The following code is adapted from
// https://github.com/ipfs/js-ipfs-api/tree/master/src/block


function BlockAPI(addr) {
  this._send = moduleConfig(addr);
}

BlockAPI.prototype.get = function (cid, cb) {
  var request = {
    path: 'block/get',
    args: cid.toBaseEncodedString()
  };
  var transform = function transform(response, cb) {
    if (Buffer.isBuffer(response)) {
      cb(null, new Block(response, cid));
    } else {
      streamToValue(response, function (err, data) {
        if (err) {
          return cb(err);
        }
        cb(null, new Block(data, cid));
      });
    }
  };
  this._send.andTransform(request, transform, cb);
};

BlockAPI.prototype.put = function (data, cb) {
  var request = {
    path: 'block/put',
    files: data,
    qs: {
      format: 'cbor'
    }
  };
  var transform = function transform(info, cb) {
    cb(null, new Block(data, new CID(info.Key)));
  };
  this._send.andTransform(request, transform, cb);
};

// The following code is adapted from
// https://github.com/ipfs/js-ipfs/blob/master/README.md
// https://github.com/ipfs/js-ipfs/blob/master/examples/basics/index.js
// https://github.com/ipfs/js-ipfs/blob/master/examples/transfer-files/public/js/app.js
// const wstar = new WStar({ wrtc })
var Ipfs = {};

function ContentService(addr) {
  var maddr = multiaddr(addr);
  this.host = maddr.nodeAddress().address;
  this.port = maddr.nodeAddress().port;
  this._files = FilesAPI(addr);
}

ContentService.prototype.pathToURL = function (path) {
  return 'http://' + this.host + ':' + this.port + '/api/v0/get?arg=' + path;
};

// ContentService.prototype.isValidHash = isIpfs.multihash

ContentService.prototype.hash = function (content, tasks, t, i) {
  var file = new UnixFS('file', content);
  DAGNode.create(file.marshal(), function (err, dagNode) {
    if (err) {
      return tasks.error(err);
    }
    var mh = dagNode.toJSON().multihash;
    tasks.run(t, mh, i);
  });
};

ContentService.prototype.get = function (path, tasks, t, i) {
  this._files.get(path, function (err, stream) {
    if (err) {
      return tasks.error(err);
    }
    stream.on('data', function (file) {
      var chunks = [];
      file.content.on('data', function (chunk) {
        chunks.push(chunk);
      });
      file.content.once('end', function () {
        tasks.run(t, Buffer.concat(chunks), i);
      });
      file.content.resume();
    });
    stream.resume();
  });
};

ContentService.prototype.put = function (contents, tasks, t, i) {
  this._files.add(contents, function (err, results) {
    if (err) {
      return tasks.error(err);
    }
    var hashes = results.map(function (result) {
      return result.hash;
    });
    tasks.run(t, hashes, i);
  });
};

function MetadataService(addr) {
  var maddr = multiaddr(addr);
  this.host = maddr.nodeAddress().address;
  this.port = maddr.nodeAddress().port;

  this._blocks = new BlockAPI(addr);
}

var isValidCID = function isValidCID(cid) {
  return cid.codec === dagCBOR.codec && cid.version === dagCBOR.version;
};

MetadataService.prototype.pathToURL = function (path) {
  return 'http://' + this.host + ':' + this.port + '/api/v0/dag/get?arg=' + path;
};

MetadataService.prototype.pathToCID = function (path) {
  var parts = path.split('/');
  var cid = new CID(parts.shift());
  var remPath = parts.join('/');
  return { cid: cid, remPath: remPath };
};

MetadataService.prototype.hash = function (elem, tasks, t, i) {
  if (!isElement(elem)) {
    return tasks.error(errInvalidElement(elem));
  }
  var t1 = tasks.add(function (cid) {
    tasks.run(t, cid.toBaseEncodedString(), i);
  });
  dagCBOR.cid(elem.data, tasks, t1);
};

MetadataService.prototype.toElement = function (data, path, tasks, t, i) {
  if (path) {
    tasks.run(t, order(data), i);
  } else {
    tasks.run(t, { data: data }, i);
  }
};

/*

MetadataService.prototype.isValidHash = (hash: string): boolean => {
  try {
    const cid = new CID(hash)
    return this.isValidCID(cid)
  } catch (err) {
    return false
  }
}

*/

MetadataService.prototype.hashFromCID = function (cid) {
  if (!isValidCID(cid)) {
    throw errUnexpectedCID(cid);
  }
  return cid.toBaseEncodedString();
};

MetadataService.prototype.resolve = function (obj, path, tasks, t, i) {
  if (!path || path === '/') {
    return tasks.run(t, obj, '', i);
  }
  var parts = path.split('/');
  var first = parts.shift();
  switch (first) {
    case 'data':
      return dagCBOR.resolve(obj, parts.join('/'), tasks, t, i);
    case 'sender':
      return tasks.run(t, null, '', i);
    case 'recipient':
      return tasks.run(t, null, '', i);
    default:
      tasks.error(errPathNotFound(path));
  }
};

MetadataService.prototype.get = function (cid, tasks, t, i) {
  var _this = this;

  if (!isValidCID(cid)) {
    return tasks.error(errUnexpectedCID(cid));
  }
  var t1 = tasks.add(function (obj) {
    obj = order(transform(obj, function (val) {
      if (!isMerkleLink(val)) {
        return val;
      }
      cid = new CID(val['/']);
      return {
        '/': _this.hashFromCID(cid) + '/data'
      };
    }));
    tasks.run(t, obj, i);
  });
  this._blocks.get(cid, function (err, block) {
    if (err) {
      return tasks.error(err);
    }
    dagCBOR.deserialize(block.data, tasks, t1);
  });
};

MetadataService.prototype.put = function (elem, tasks, t, i) {
  var _this2 = this;

  if (!isElement(elem)) {
    return tasks.error(errInvalidElement(elem));
  }
  var t1 = tasks.add(function (data) {
    _this2._blocks.put(data, function (err, block) {
      if (err) {
        return tasks.error(err);
      }
      tasks.run(t, block.cid, i);
    });
  });
  dagCBOR.serialize(elem.data, tasks, t1);
};

function Node() {}

Node.prototype.start = function (repo, tasks, t, i) {
  var _this3 = this;

  this._ipfs = new IPFS({
    init: true,
    repo: repo,
    start: true,
    EXPERIMENTAL: {
      pubsub: true,
      sharding: true,
      dht: true
    },
    config: {
      Addresses: {
        Swarm: ['/libp2p-webrtc-star/dns4/star-signal.cloud.ipfs.team/wss']
      }
    }
    // libp2p: {
    //  modules: {
    //    transport: [wstar],
    //    discovery: [wstar.discovery]
    //  }
    // }
  });

  this._ipfs.on('error', function (err) {
    tasks.error(err);
  });

  this._ipfs.on('ready', function () {
    _this3._intervalId = setInterval(_this3._ipfs.swarm.peers, 3000);
    console.log('IPFS Node is ready');
    tasks.run(t, _this3._ipfs, i);
  });
};

Node.prototype.stop = function (tasks, t, i) {
  var _this4 = this;

  this._ipfs.stop(function () {
    clearInterval(_this4._intervalId);
    console.log('Stopped IPFS Node');
    tasks.run(t, i);
  });
};

module.exports = {
  ContentService: ContentService,
  MetadataService: MetadataService,
  Node: Node
};