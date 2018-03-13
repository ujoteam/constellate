'use strict';

var base58 = require('bs58');
var cc = require('five-bells-condition');
var CID = require('cids');
var multihash = require('multihashes');
var request = require('xhr-request');
var sha3_256 = require('js-sha3').sha3_256;

var dagCBOR = require('../../lib/dag-cbor');

var _require = require('../../lib/util.js'),
    clone = _require.clone,
    errInvalidElement = _require.errInvalidElement,
    errPathNotFound = _require.errPathNotFound,
    errUnexpectedCID = _require.errUnexpectedCID,
    isMerkleLink = _require.isMerkleLink,
    isElement = _require.isElement,
    isNumber = _require.isNumber,
    isObject = _require.isObject,
    isString = _require.isString,
    order = _require.order,
    orderStringify = _require.orderStringify,
    transform = _require.transform;

/**
 * @module constellate/src/bigchaindb
 */

var ErrMultipleInputs = new Error('tx with multiple inputs not supported');
var ErrMultipleOwnersBefore = new Error('tx input with multiple owners_before not supported');
var ErrMultiplePublicKeys = new Error('tx output with multiple public_keys not supported');

var errInvalidOwnerBefore = function errInvalidOwnerBefore(ownerBefore) {
  return new Error('invalid owner_before: ' + ownerBefore);
};
var errUnexpectedOperation = function errUnexpectedOperation(operation) {
  return new Error('unexpected operation: ' + operation);
};

var codec = 'bigchaindb-transaction';
var version = 1;

var hashTx = function hashTx(tx) {
  tx = clone(tx);
  delete tx.id;
  for (var i = 0; i < tx.inputs.length; i++) {
    tx.inputs[i].fulfillment = null;
  }
  var data = orderStringify(tx);
  return Buffer.from(sha3_256.create().update(data).buffer());
};

var Tx = {

  codec: codec,

  version: version,

  cid: function cid(tx, tasks, t, i) {
    try {
      var mh = multihash.encode(hashTx(tx), 'sha3-256');
      var cid = new CID(version, codec, mh);
      tasks.run(t, cid, i);
    } catch (err) {
      tasks.error(err);
    }
  },

  resolve: function resolve(tx, path, tasks, t, i) {
    if (!path || path === '/') {
      return tasks.run(t, tx, '', i);
    }
    var parts = path.split('/');
    var first = parts.shift();
    switch (first) {
      case 'data':
        if (tx.asset.data) {
          return dagCBOR.resolve(tx.asset.data, parts.join('/'), tasks, t, i);
        }
        if (tx.asset.id) {
          return tasks.run(t, { '/': tx.asset.id }, path, i);
        }
      case 'sender':
        if (tx.inputs.length > 1) {
          return tasks.error(ErrMultipleInputs);
        }
        var publicKey = tx.inputs[0].owners_before[0];
        if (!parts[0]) {
          return tasks.run(t, { publicKey: publicKey }, '', i);
        }
        if (parts[0] === 'publicKey') {
          return tasks.run(t, publicKey, '', i);
        }
      case 'recipient':
        var recipient = order(tx.outputs.map(function (output) {
          if (output.public_keys.length > 1) {
            return tasks.error(ErrMultiplePublicKeys);
          }
          return {
            amount: Number(output.amount),
            publicKey: output.public_keys[0]
          };
        }));
        if (!parts[0]) {
          return tasks.run(t, recipient, '', i);
        }
        var idx = Number(parts[0]);
        if (!parts[1]) {
          return tasks.run(t, recipient[idx], '', i);
        }
        if (parts[1] === 'amount') {
          return tasks.run(t, Number(recipient[idx].amount), '', i);
        }
        if (parts[1] === 'publicKey') {
          return tasks.run(t, recipient[idx].publicKey, '', i);
        }
      default:
        tasks.error(errPathNotFound(path));
    }
  }
};

/*

  The following code is adapted from..
    > https://github.com/bigchaindb/js-bigchaindb-driver/tree/master/src/transaction

  ---------------------------------------------------------------------------

  Copyright 2017 BigchainDB GmbH

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

     http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.

  Modifications Copyright 2017 Zachary Balder

*/

var VERSION = '1.0';

var newEd25519Condition = function newEd25519Condition(publicKey) {
  var buf = base58.decode(publicKey);
  var condition = new cc.Ed25519Sha256();
  condition.setPublicKey(buf);
  return condition;
};

var newThresholdCondition = function newThresholdCondition(subconditions, threshold) {
  var condition = new cc.ThresholdSha256();
  for (var i = 0; i < subconditions.length; i++) {
    condition.addSubfulfillment(subconditions[i]);
  }
  condition.threshold = threshold;
  return condition;
};

var conditionObject = function conditionObject(condition) {
  var typeId = condition.getTypeId();
  var uri = condition.getConditionUri();
  var details = {};
  if (typeId === 2) {
    details.type = 'threshold-sha-256';
    details.subconditions = condition.subconditions.map(function (subcondition) {
      return conditionObject(subcondition.body).details;
    });
    details.threshold = condition.threshold;
  }
  if (typeId === 4) {
    details.type = 'ed25519-sha-256';
    details.public_key = base58.encode(condition.publicKey);
  }
  return { details: details, uri: uri };
};

// const _getPublicKeys = (details: Object): string[] => {
//   if (details.type === 'ed25519-sha-256') {
//     return [details.public_key]
//   }
//   if (details.type === 'threshold-sha-256') {
//     return details.subconditions.reduce((result, subcondition) => {
//       return result.concat(_getPublicKeys(subcondition))
//     }, [])
//   }
//   return []
// }

// const getPublicKeys = (details: Object): string[] => {
//   return Array.from(new Set(_getPublicKeys(details)))
// }

var newOutput = function newOutput(amount, condition) {
  if (isNumber(amount)) {
    amount = amount.toString();
  }
  condition = conditionObject(condition);
  // const public_keys = getPublicKeys(condition.details)
  var public_keys = [condition.details.public_key];
  return { amount: amount, condition: condition, public_keys: public_keys };
};

var newCreateTx = function newCreateTx(data, sender, metadata, recipient, tasks, t, i) {
  var inputs = [{
    fulfillment: null,
    fulfills: null,
    owners_before: [sender.publicKey]
  }];
  recipient = [].concat(recipient);
  var outputs = new Array(recipient.length);
  for (var j = 0; j < recipient.length; j++) {
    outputs[j] = newOutput(recipient[j].amount, newEd25519Condition(recipient[j].publicKey));
  }
  data = data || null;
  var tx = {
    asset: {
      data: data
    },
    inputs: inputs,
    metadata: metadata,
    operation: 'CREATE',
    outputs: outputs,
    version: VERSION
  };
  tx.id = hashTx(tx).toString('hex');
  tasks.run(t, order(tx), i);
};

var newTransferTx = function newTransferTx(sender, metadata, recipient, tx, tasks, t, i) {
  var id = void 0;
  if (tx.operation === 'CREATE') {
    id = tx.id;
  } else if (tx.operation === 'TRANSFER') {
    id = tx.asset.id;
  } else {
    return tasks.error(errUnexpectedOperation(tx.operation));
  }
  var inputs = void 0,
      j = void 0;
  for (j = 0; j < tx.outputs.length; j++) {
    if (tx.outputs[j].public_keys.length !== 1) {
      return tasks.error(ErrMultiplePublicKeys);
    }
    if (tx.outputs[j].public_keys[0] !== sender.publicKey) {
      continue;
    }
    inputs = [{
      fulfillment: null,
      fulfills: {
        output_index: j,
        transaction_id: tx.id
      },
      owners_before: [sender.publicKey]
    }];
    break;
  }
  if (!inputs) {
    return tasks.error(errInvalidOwnerBefore(sender.publicKey));
  }
  recipient = [].concat(recipient);
  var publicKeys = void 0;
  var outputs = new Array(recipient.length);
  for (j = 0; j < recipient.length; j++) {
    outputs[j] = newOutput(recipient[j].amount, newEd25519Condition(recipient[j].publicKey));
  }
  var newTx = {
    asset: {
      id: id
    },
    inputs: inputs,
    metadata: metadata,
    operation: 'TRANSFER',
    outputs: outputs,
    version: VERSION
  };
  newTx.id = hashTx(newTx).toString('hex');
  tasks.run(t, order(newTx), i);
};

var signTx = function signTx(sender, tx, tasks, t, i) {
  tx = clone(tx);
  var ownersBefore = void 0;
  for (var j = 0; j < tx.inputs.length; j++) {
    ownersBefore = tx.inputs[j].owners_before;
    if (ownersBefore.length !== 1) {
      return tasks.error(ErrMultiplePublicKeys);
    }
    if (sender.publicKey !== ownersBefore[0]) {
      continue;
    }
    var data = Buffer.from(orderStringify(tx), 'utf8');
    var fulfillment = new cc.Ed25519Sha256();
    fulfillment.sign(data, base58.decode(sender.privateKey));
    tx.inputs[j].fulfillment = fulfillment.serializeUri();
    return tasks.run(t, tx, i);
  }
  tasks.error(errInvalidOwnerBefore(sender.publicKey));
};

var isValidCID = function isValidCID(cid) {
  return cid.codec === codec && cid.version === version;
};

function MetadataService(url) {
  this.url = url;
}

// MetadataService.prototype.isValidHash = (hash: string): boolean => {
//   return /^[a-f0-9]{64}$/.test(hash)
// }

MetadataService.prototype.hashFromCID = function (cid) {
  if (!isValidCID(cid)) {
    throw errUnexpectedCID(cid);
  }
  return multihash.decode(cid.multihash).digest.toString('hex');
};

MetadataService.prototype.pathToCID = function (path) {
  var parts = path.split('/');
  var data = Buffer.from(parts.shift(), 'hex');
  var mh = multihash.encode(data, 'sha3-256');
  var cid = new CID(version, codec, mh);
  var remPath = parts.join('/');
  return { cid: cid, remPath: remPath };
};

MetadataService.prototype.fromElement = function (elem, tasks, t, i) {
  if (!isElement(elem)) {
    return tasks.error(errInvalidElement(elem));
  }
  if (elem.data['/']) {
    var t1 = tasks.add(function (tx) {
      newTransferTx(elem.sender, null, elem.recipient, tx, tasks, t, i);
    });
    try {
      var _pathToCID = this.pathToCID(elem.data['/']),
          cid = _pathToCID.cid,
          _ = _pathToCID._;

      return this.get(cid, tasks, t1);
    } catch (err) {
      tasks.error(err);
    }
  }
  var data = transform(elem.data, function (val) {
    if (isMerkleLink(val)) {
      return {
        '/': val['/'] + '/data'
      };
    }
    return val;
  });
  newCreateTx(data, elem.sender, null, elem.recipient, tasks, t, i);
};

MetadataService.prototype.hash = function (elem, tasks, t, i) {
  var _this = this;

  var t1 = void 0,
      t2 = void 0;
  t1 = tasks.add(function (tx) {
    Tx.cid(tx, tasks, t2);
  });
  t2 = tasks.add(function (cid) {
    tasks.run(t, _this.hashFromCID(cid), i);
  });
  this.fromElement(elem, tasks, t1);
};

MetadataService.prototype.toElement = function (tx, path, tasks, t, i) {
  if (path) {
    return tasks.run(t, order(tx), i);
  }
  var elem = {};
  if (tx.asset.data) {
    elem.data = tx.asset.data;
  } else if (tx.asset.id) {
    elem.data = {
      '/': tx.asset.id + '/data'
    };
  }
  if (tx.inputs.length > 1) {
    return tasks.error(ErrMultipleInputs);
  }
  if (tx.inputs[0].owners_before.length > 1) {
    return tasks.error(ErrMultipleOwnersBefore);
  }
  elem.sender = {
    publicKey: tx.inputs[0].owners_before[0]
  };
  elem.recipient = new Array(tx.outputs.length);
  var output = void 0;
  for (var j = 0; j < tx.outputs.length; j++) {
    output = tx.outputs[j];
    if (output.public_keys.length > 1) {
      return tasks.error(ErrMultiplePublicKeys);
    }
    elem.recipient[j] = {
      amount: Number(output.amount),
      publicKey: output.public_keys[0]
    };
  }
  tasks.run(t, order(elem), i);
};

MetadataService.prototype.pathToURL = function (path) {
  return this.url + '/transactions/' + path;
};

MetadataService.prototype.resolve = Tx.resolve;

MetadataService.prototype.get = function (cid, tasks, t, i) {
  var hash = void 0;
  try {
    hash = this.hashFromCID(cid);
  } catch (err) {
    tasks.error(err);
  }
  request(this.pathToURL(hash), { json: true }, function (err, tx, res) {
    if (err) {
      return tasks.error(err);
    }
    if (res.statusCode !== 200) {
      return tasks.error(JSON.stringify(tx));
    }
    tasks.run(t, tx, i);
  });
};

MetadataService.prototype.put = function (elem, tasks, t, i) {
  var _this2 = this;

  var t1 = void 0,
      t2 = void 0;
  t1 = tasks.add(function (tx) {
    signTx(elem.sender, tx, tasks, t2);
  });
  t2 = tasks.add(function (tx) {
    request(_this2.url + '/transactions', { method: 'POST', json: true, body: tx }, function (err, json, res) {
      if (err) {
        return tasks.error(err);
      }
      if (res.statusCode !== 200 && res.statusCode !== 202) {
        return tasks.error(JSON.stringify(json));
      }
      Tx.cid(json, tasks, t, i);
    });
  });
  this.fromElement(elem, tasks, t1);
};

module.exports = {
  MetadataService: MetadataService,
  Tx: Tx,
  ErrMultipleInputs: ErrMultipleInputs,
  ErrMultiplePublicKeys: ErrMultiplePublicKeys,
  ErrMultipleOwnersBefore: ErrMultipleOwnersBefore,
  errInvalidOwnerBefore: errInvalidOwnerBefore,
  errUnexpectedOperation: errUnexpectedOperation
};