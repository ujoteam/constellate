'use strict'

const CID = require('cids')
const Keccak = require('keccakjs')
const multihash = require('multihashes')
const request = require('xhr-request')

const {
  errInvalidElement,
  isContentElement
} = require('../lib/util.js')

// @flow

/**
 * @module/constellate/src/swarm
 */

// The following code is from https://github.com/axic/swarmhash/blob/master/index.js
  const hashChunk = (chunk: Buffer, size: number, tasks: Object, t: number, i?: number) => {
    const hash = new Keccak(256)
    const tmp = Buffer.alloc(8)
    tmp.writeUIntLE(size, 0, 6)
    hash.update(tmp)
    hash.update(chunk)
    tasks.run(t, Buffer.from(hash.digest(), 'binary'), i)
  }

// The following code is adapted from https://github.com/ethereum/go-ethereum/blob/master/swarm/storage/chunker.go
const swarmHash = (data: Buffer, tasks: Object, t: number, i?: number) => {
   let depth = 0, treeSize
   for (treeSize = 4096; treeSize < data.length; treeSize *= 128) depth++
   split(data, depth, data.length, treeSize/128, tasks, t, i)
 }

 const split = (chunk: Buffer, depth: number, size: number, treeSize: number, tasks: Object, t: number, i?: number) => {
   while (depth && size < treeSize) {
     treeSize /= 128
     depth--
   }
   if (!depth) {
     return hashChunk(chunk, size, tasks, t, i)
   }
   let chunks, count = 0, secSize
   const t1 = tasks.add((chunk, j) => {
     chunks[j] = chunk
     if (++count !== chunks.length) return
     hashChunk(Buffer.concat(chunks), size, tasks, t, i)
   })
   chunks = new Array(Math.floor((size + treeSize - 1) / treeSize))
   for (let j = 0, s = 0; s < size; j++, s += treeSize) {
     if (size - s < treeSize) {
       secSize = size - s
     } else {
       secSize = treeSize
     }
     split(chunk.slice(s, s+secSize), depth-1, secSize, treeSize/128, tasks, t1, j)
   }
 }

// The following code is adapted from https://github.com/axic/swarmgw/blob/master/index.js
// const isValidHash = (hash: string): boolean => {
//   return /^[a-f0-9]{64}$/.test(hash)
// }

function ContentService (url: string) {
  this.url = url
}

ContentService.prototype.hash = (content: Buffer, tasks: Object, t: number, i?: number) => {
  const t1 = tasks.add(data => {
    tasks.run(t, data.toString('hex'), i)
  })
  swarmHash(content, tasks, t1)
}

ContentService.prototype.pathToURL = function (path: string): string {
  return this.url + '/bzzr://' + path
}

ContentService.prototype.get = function (path: string, tasks: Object, t: number, i?: number) {
  request(
    this.pathToURL(path),
    { responseType: 'arraybuffer' },
    (err, data, res) => {
      if (err) {
        return tasks.error(err)
      }
      if (res.statusCode !== 200) {
        return tasks.error(err)
      }
      tasks.run(t, Buffer.from(data), i)
    }
  )
}

ContentService.prototype.put = function (contents: Buffer[], tasks: Object, t: number, i?: number) {
  const hashes = new Array(contents.length)
  let count = 0
  for (let j = 0; j < contents.length; j++) {
    request(this.url + '/bzzr:', {
      method: 'POST',
      body: contents[j]
    }, (err, data, res) => {
      if (err) {
        return tasks.error(err)
      }
      if (res.statusCode !== 200) {
        return tasks.error(data)
      }
      // if (!isValidHash(data)) {
      //   return tasks.error('invalid hash: ' + data)
      // }
      hashes[j] = data
      if (++count !== contents.length) return
      tasks.run(t, hashes, i)
    })
  }
}

module.exports = {
  ContentService
}
