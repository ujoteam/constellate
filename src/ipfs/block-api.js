'use strict'

const Block = require('ipfs-block')
const CID = require('cids')
const moduleConfig = require('ipfs-api/src/utils/module-config')
const streamToValue = require('ipfs-api/src/utils/stream-to-value')

// The following code is adapted from https://github.com/ipfs/js-ipfs-api/tree/master/src/block
// Please see the LICENSE file for details
function BlockAPI (addr) {
  this.send = moduleConfig(addr)
}

BlockAPI.prototype.get = function (cid, cb) {
  const request = {
    path: 'block/get',
    args: cid.toBaseEncodedString()
  }
  const transform = (response, cb) => {
    if (Buffer.isBuffer(response)) {
      cb(null, new Block(response, cid))
    } else {
      streamToValue(response, (err, data) => {
        if (err) {
          return cb(err)
        }
        cb(null, new Block(data, cid))
      })
    }
  }
  this.send.andTransform(request, transform, cb)
}

BlockAPI.prototype.put = function (data, cb) {
  const request = {
    path: 'block/put',
    files: data,
    qs: {
      format: 'cbor'
    }
  }
  const transform = (info, cb) => {
    cb(null, new Block(data, new CID(info.Key)))
  }
  this.send.andTransform(request, transform, cb)
}

module.exports = BlockAPI
