'use strict';

var Block = require('ipfs-block');
var CID = require('cids');
var moduleConfig = require('ipfs-api/src/utils/module-config');
var streamToValue = require('ipfs-api/src/utils/stream-to-value');

// The following code is adapted from https://github.com/ipfs/js-ipfs-api/tree/master/src/block
// Please see the LICENSE file for details
function BlockAPI(addr) {
  this.send = moduleConfig(addr);
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
  this.send.andTransform(request, transform, cb);
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
  this.send.andTransform(request, transform, cb);
};

module.exports = BlockAPI;