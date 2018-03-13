'use strict'

const FilesAPI = require('ipfs-api/src/files')
const multiaddr = require('multiaddr')
const UnixFS = require('ipfs-unixfs')

const {
  DAGNode,
  DAGLink
} = require('ipld-dag-pb')

const CHUNK_LENGTH = 262144

function ContentService(addr) {
  const maddr = multiaddr(addr)
  this.host = maddr.nodeAddress().address
  this.port = maddr.nodeAddress().port
  this.files = FilesAPI(addr)
}

ContentService.prototype.pathToURL = function (path) {
  return `http://${this.host}:${this.port}/api/v0/get?arg=` + path
}

ContentService.prototype.put = function (contents, cb) {
  this.files.add(contents, (err, results) => {
    if (err) {
      return cb(err)
    }
    const hashes = results.map(result => result.hash)
    cb(null, hashes)
  })
}

// The following code is adapted from
// https://github.com/ipfs/js-ipfs/blob/master/examples/transfer-files/public/js/app.js
// Please see the LICENSE file for details
ContentService.prototype.get = function (path, cb) {
  this.files.get(path, (err, stream) => {
    if (err) {
      return cb(err)
    }
    stream.on('data', file => {
      const chunks = []
      file.content.on('data', chunk => {
        chunks.push(chunk)
      })
      file.content.once('end', () => {
        cb(null, Buffer.concat(chunks))
      })
      file.content.resume()
    })
    stream.resume()
  })
}

// The following code is adapted from https://github.com/ipfs/js-ipfs-unixfs-engine/tree/master/src/builder
// Please see the LICENSE file for details
ContentService.prototype.hash = function (content, cb) {
  const numChunks = Math.ceil(content.length / CHUNK_LENGTH)
  if (numChunks === 1) {
    const file = new UnixFS('file', content)
    return DAGNode.create(file.marshal(), (err, dagNode) => {
      if (err) {
        return cb(err)
      }
      const mh = dagNode.toJSON().multihash
      cb(null, mh)
    })
  }
  const dagNodes = []
  const files = []
  const links = []
  let count = 0, chunk
  const fn = i => {
    DAGNode.create(files[i].marshal(), (err, dagNode) => {
      if (err) {
        return cb(err)
      }
      dagNodes[i] = dagNode
      if (++count === numChunks) {
        const file = new UnixFS('file')
        for (i = 0; i < numChunks; i++) {
          dagNode = dagNodes[i]
          file.addBlockSize(files[i].fileSize())
          links[i] = new DAGLink('', dagNode.size, dagNode.multihash)
        }
        DAGNode.create(file.marshal(), links, (err, dagNode) => {
          if (err) {
            return cb(err)
          }
          const mh = dagNode.toJSON().multihash
          cb(null, mh)
        })
      }
    })
  }
  for (let i = 0; i < numChunks; i++) {
    chunk = content.slice(i*CHUNK_LENGTH, (i+1)*CHUNK_LENGTH)
    files[i] = new UnixFS('file', chunk)
    fn(i)
  }
}

module.exports = ContentService
