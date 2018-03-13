'use strict';

var aes = require('aes-js');
var base58 = require('bs58');
var crypto = require('crypto');
var nacl = require('tweetnacl');
var request = require('xhr-request');
var scrypt = require('scrypt-async');

var BigchainDB = require('../lib/bigchaindb');
// const Fingerprint = require('../lib/fingerprint')
var Ipfs = require('../lib/ipfs');
var Resolver = require('../lib/resolver');
var Swarm = require('../lib/swarm');

var _require = require('../lib/util'),
    Tasks = _require.Tasks,
    assign = _require.assign,
    capitalize = _require.capitalize,
    clone = _require.clone,
    errUnexpectedType = _require.errUnexpectedType,
    isRecipient = _require.isRecipient,
    isSender = _require.isSender,
    isString = _require.isString,
    order = _require.order,
    readFileAs = _require.readFileAs,
    transform = _require.transform,
    traverse = _require.traverse;

/**
 * @module constellate/src/constellate
 */


var ErrNoAccount = new Error('no account');
var ErrNoCallback = new Error('no callback');
var ErrNoDecryption = new Error('no decryption');
var ErrNoLinkedData = new Error('no elements');
var ErrNoHashes = new Error('no hashes');

var errUnexpectedHash = function errUnexpectedHash(actual, expected) {
  return new Error('expected hash="' + expected + '", got "' + actual + '"');
};

var errInvalidPassword = function errInvalidPassword(password) {
  return new Error('invalid password: ' + password);
};

var errUnsupportedService = function errUnsupportedService(name) {
  return new Error('"' + name + '" is not supported');
};

var keyLength = 32;
var saltLength = 20;

var options = {
  N: 16384,
  r: 8,
  p: 1,
  dkLen: keyLength,
  encoding: 'hex'
};

var scrypt2x = function scrypt2x(password, salt, tasks, t, i) {
  scrypt(password, salt, options, function (result) {
    var dkey = Buffer.from(result, 'hex');
    scrypt(dkey, salt, options, function (hash) {
      tasks.run(t, dkey, hash, i);
    });
  });
};

function MetadataService(_ref) {
  var account = _ref.account,
      name = _ref.name,
      path = _ref.path;


  this._account = account;

  if (name === 'bigchaindb') {
    this._service = new BigchainDB.MetadataService(path);
  } else if (name === 'ipfs') {
    this._service = new Ipfs.MetadataService(path);
  } else {
    throw errUnsupportedService(name);
  }

  this._resolver = new Resolver(this._service);
}

MetadataService.prototype._resolveMetadata = function (metadata, tasks, t, i) {
  var hashes = [];
  var idxs = [];
  var resolver = this._resolver;
  var service = this._service;
  var j = void 0;
  for (j = 0; j < metadata.length; j++) {
    if (isString(metadata[j]['#'])) {
      hashes.push(metadata[j]['#']);
      idxs.push(j);
    }
  }
  if (!hashes.length) {
    return tasks.run(t, metadata, i);
  }
  var count = 0;
  var t1 = tasks.add(function (elem, j) {
    elem.data['#'] = hashes[j];
    metadata[idxs[j]] = elem.data;
    if (++count !== hashes.length) return;
    tasks.run(t, metadata, i);
  });
  var val = void 0;
  for (j = 0; j < hashes.length; j++) {
    try {
      val = service.pathToCID(hashes[j]);
      resolver.get(val.cid, val.remPath, tasks, t1, j);
    } catch (err) {
      tasks.error(err);
    }
  }
};

var orderMetadata = function orderMetadata(resolved, tasks, t, i) {
  var ordered = [];
  var next = void 0,
      obj = void 0,
      queue = [],
      stop = false;
  while (resolved.length) {
    if (next) {
      var idx = resolved.findIndex(function (obj) {
        return obj.name === next;
      });
      if (idx < 0) {
        return tasks.error('could not find "' + next + '"');
      }
      obj = resolved.splice(idx, 1)[0];
    } else {
      obj = resolved.shift();
    }
    if (!obj.name) {
      return tasks.error('no metadata name');
    }
    next = '';
    traverse(obj, function (_, val) {
      if (isString(val) && val[0] === '@') {
        val = val.slice(1);
        if (!next && ordered.every(function (obj) {
          return obj.name !== val;
        })) {
          if (queue.includes(val)) {
            stop = true;
            return tasks.error('circular reference between ' + val + ' and ' + obj.name);
          }
          resolved.push(obj);
          next = val;
          queue.push(obj.name);
        }
      }
    });
    if (stop) return;
    if (next) continue;
    ordered.push(obj);
    queue = [];
  }
  tasks.run(t, ordered, i);
};

MetadataService.prototype._generateLinkedData = function (ordered, sender, recipient, tasks, t, i) {
  var _this = this;

  var hashes = this._hashes;
  var ld = [];
  var names = [];
  var service = this._service;
  var parties = {};
  if (isSender(sender)) {
    parties.sender = sender;
  }
  if (isRecipient(recipient)) {
    parties.recipient = recipient;
  }
  var count = 0,
      data = void 0,
      elem = void 0,
      t1 = void 0,
      t2 = void 0;
  t1 = tasks.add(function () {
    if (ordered[count]['#']) {
      return tasks.run(t2, ordered[count]['#']);
    }
    data = clone(ordered[count]);
    names.push(data.name);
    data.name = data.name.match(/^(.+?)\s*(?:\s*?\(.*?\))?$/)[1];
    data = order(transform(data, function (val) {
      if (isString(val)) {
        if (val[0] === '@') {
          return {
            '/': hashes[val.slice(1)]
          };
        }
        if (val[0] === '#') {
          return {
            '/': val.slice(1)
          };
        }
      }
      return val;
    }));
    elem = Object.assign({ data: data }, parties);
    ld.push(elem);
    service.hash(elem, tasks, t2);
  });
  t2 = tasks.add(function (hash) {
    hashes[ordered[count].name] = hash;
    if (++count === ordered.length) {
      _this._ld = ld;
      _this._names = names;
      return tasks.run(t, i);
    }
    tasks.run(t1);
  });
  tasks.run(t1);
};

MetadataService.prototype._import = function (metadata, sender, recipient, tasks, t, i) {
  var _this2 = this;

  this._hashes = {};
  metadata = clone(metadata);
  var t1 = void 0,
      t2 = void 0;
  t1 = tasks.add(function (resolved) {
    orderMetadata(resolved, tasks, t2);
  });
  t2 = tasks.add(function (ordered) {
    _this2._generateLinkedData(ordered, sender, recipient, tasks, t, i);
  });
  this._resolveMetadata(metadata, tasks, t1);
};

MetadataService.prototype._put = function (sender, tasks, t, i) {
  var hashes = this._hashes;
  var names = this._names;
  var ld = this._ld;
  var service = this._service;
  if (!ld || !ld.length) {
    return tasks.error(ErrNoLinkedData);
  }
  var count = 0,
      hash = void 0;
  var t1 = tasks.add(function (cid, j) {
    hash = service.hashFromCID(cid);
    if (hash !== hashes[names[j]]) {
      return tasks.error(errUnexpectedHash(hash, hashes[names[j]]));
    }
    if (++count !== ld.length) return;
    tasks.run(t, i);
  });
  var useSender = isSender(sender);
  for (var j = 0; j < ld.length; j++) {
    if (useSender) {
      service.put(assign(ld[j], { sender: sender }), tasks, t1, j);
    } else {
      service.put(ld[j], tasks, t1, j);
    }
  }
};

MetadataService.prototype._get = function (path, expand, tasks, t, i) {
  var hashes = this._hashes;
  var parts = path.split('/');
  var first = parts.shift();
  var resolver = this._resolver;
  var service = this._service;
  if (hashes[first]) {
    path = hashes[first];
    if (parts.length) {
      path += '/' + parts.join('/');
    }
  }
  var t1 = tasks.add(function (result) {
    if (expand) {
      return resolver.expand(result, tasks, t);
    }
    tasks.run(t, result);
  });
  try {
    var _service$pathToCID = service.pathToCID(path),
        cid = _service$pathToCID.cid,
        remPath = _service$pathToCID.remPath;

    resolver.get(cid, remPath, tasks, t1);
  } catch (err) {
    tasks.error(err);
  }
};

MetadataService.prototype.get = function (path, expand, cb) {
  var tasks = new Tasks(cb);
  this._get(path, expand, tasks, -1);
};

MetadataService.prototype._transfer = function (path, recipient, password, tasks, t, i) {
  var account = this._account;
  var hashes = this._hashes;
  var service = this._service;
  if (!account) {
    return tasks.error(ErrNoAccount);
  }
  var parts = path.split('/');
  var first = parts.shift();
  if (hashes[first]) {
    path = hashes[first];
    if (parts.length) {
      path += '/' + parts.join('/');
    }
  }
  var t1 = void 0,
      t2 = void 0;
  t1 = tasks.add(function (privateKey) {
    var publicKey = account.publicKey();
    service.put({
      data: {
        '/': path
      },
      sender: {
        privateKey: privateKey,
        publicKey: publicKey
      },
      recipient: recipient
    }, tasks, t2);
  });
  t2 = tasks.add(function (cid) {
    tasks.run(t, service.hashFromCID(cid), i);
  });
  account._decrypt(password, tasks, t1);
};

MetadataService.prototype.transfer = function (path, recipient, password, cb) {
  var tasks = new Tasks(cb);
  this._transfer(path, recipient, password, tasks, -1);
};

MetadataService.prototype._exportHashes = function () {
  return this._hashes || {};
};

MetadataService.prototype.importHashes = function (hashes) {
  this._hashes = hashes;
};

MetadataService.prototype._exportLinkedData = function () {
  return this._ld || [];
};

MetadataService.prototype.importLinkedData = function (ld) {
  this._ld = ld;
};

function ContentService(_ref2) {
  var name = _ref2.name,
      path = _ref2.path;

  if (name === 'ipfs') {
    this._service = new Ipfs.ContentService(path);
  } else if (name === 'swarm') {
    this._service = new Swarm.ContentService(path);
  } else {
    throw errUnsupportedService(name);
  }
}

ContentService.prototype._encryptFiles = function (password, tasks, t, i) {
  var _this3 = this;

  var files = this._files;
  var salt = crypto.randomBytes(saltLength);
  var t1 = tasks.add(function (dkey, hash) {
    var decryption = {
      hash: hash,
      keys: {},
      salt: salt.toString('hex')
    };
    var aesCtrDkey = new aes.ModeOfOperation.ctr(dkey);
    var aesCtrKey = void 0,
        key = void 0;
    for (var j = 0; j < files.length; j++) {
      key = crypto.randomBytes(keyLength);
      aesCtrKey = new aes.ModeOfOperation.ctr(key);
      files[j] = {
        content: Buffer.from(aesCtrKey.encrypt(files[j].content).buffer),
        name: files[j].name,
        type: files[j].type
      };
      key = Buffer.from(aesCtrDkey.encrypt(key).buffer);
      decryption.keys[files[j].name] = key.toString('hex');
    }
    _this3._decryption = decryption;
    tasks.run(t, i);
  });
  scrypt2x(password, salt, tasks, t1);
};

ContentService.prototype._import = function (files, password, tasks, t, i) {
  var _this4 = this;

  this._files = files;
  var hashes = {};
  var metadata = new Array(files.length);
  var service = this._service;
  var count = 0,
      t1 = void 0,
      t2 = void 0;
  t1 = tasks.add(function () {
    for (var j = 0; j < files.length; j++) {
      service.hash(files[j].content, tasks, t2, j);
    }
  });
  t2 = tasks.add(function (hash, j) {
    hashes[files[j].name] = hash;
    metadata[j] = {
      contentUrl: service.pathToURL(hash),
      name: files[j].name,
      type: capitalize(files[j].type.split('/')[0]) + 'Object'
    };
    if (++count !== files.length) return;
    _this4._hashes = hashes;
    tasks.run(t, metadata, i);
  });
  if (password) {
    return this._encryptFiles(password, tasks, t1);
  }
  tasks.run(t1);
};

ContentService.prototype._get = function (path, decrypt, tasks, t, i) {
  var decryption = this._decryption;
  var hashes = this._hashes;
  var parts = path.split('/');
  var first = parts.shift();
  if (hashes[first]) {
    path = hashes[first];
    if (parts.length) {
      path += '/' + parts.join('/');
    }
  }
  var t1 = t;
  if (decrypt && decrypt.password) {
    var content = void 0,
        key = void 0,
        t2 = void 0;
    t1 = tasks.add(function (_content) {
      content = _content;
      decrypt.name = decrypt.name || first;
      key = decryption.keys[decrypt.name];
      if (!key) {
        return tasks.error('no decryption key for name: ' + decrypt.name);
      }
      var salt = Buffer.from(decryption.salt, 'hex');
      scrypt2x(decrypt.password, salt, tasks, t2);
    });
    t2 = tasks.add(function (dkey, hash) {
      if (decryption.hash !== hash) {
        return tasks.error(errInvalidPassword(decrypt.password));
      }
      try {
        var aesCtr = new aes.ModeOfOperation.ctr(dkey);
        key = Buffer.from(aesCtr.decrypt(Buffer.from(key, 'hex')).buffer);
        aesCtr = new aes.ModeOfOperation.ctr(key);
        content = Buffer.from(aesCtr.decrypt(content).buffer);
        tasks.run(t, content, i);
      } catch (err) {
        tasks.error(err);
      }
    });
  }
  this._service.get(path, tasks, t1, i);
};

ContentService.prototype._put = function (tasks, t, i) {
  var files = this._files;
  var hashes = this._hashes;
  if (!files.length) {
    return tasks.error('no files');
  }
  var count = 0;
  var t1 = tasks.add(function (results) {
    for (var j = 0; j < files.length; j++) {
      if (results[j] !== hashes[files[j].name]) {
        return tasks.error(errUnexpectedHash(results[j], hashes[files[j].name]));
      }
    }
    tasks.run(t, i);
  });
  var contents = files.map(function (file) {
    return file.content;
  });
  this._service.put(contents, tasks, t1);
};

ContentService.prototype._exportDecryption = function () {
  return this._decryption || {};
};

ContentService.prototype.importDecryption = function (decryption) {
  this._decryption = decryption;
};

ContentService.prototype._exportHashes = function () {
  return this._hashes || {};
};

ContentService.prototype.importHashes = function (hashes) {
  this._hashes = hashes;
};

ContentService.prototype.get = function (path, decrypt, cb) {
  if (typeof decrypt === 'function') {
    var _ref3 = [decrypt, {}];
    cb = _ref3[0];
    decrypt = _ref3[1];
  } else if (!cb) {
    throw ErrNoCallback;
  }
  var tasks = new Tasks(cb);
  this._get(path, decrypt, tasks, -1);
};

function Account() {}

Account.prototype.publicKey = function () {
  return this._data.publicKey || '';
};

Account.prototype._decrypt = function (password, tasks, t, i) {
  var data = this._data;
  var t1 = tasks.add(function (dkey, hash) {
    if (data.hash !== hash) {
      return tasks.error(errInvalidPassword(password));
    }
    var aesCtr = new aes.ModeOfOperation.ctr(dkey);
    var encryptedPrivateKey = Buffer.from(data.encryptedPrivateKey, 'hex');
    var privateKey = base58.encode(Buffer.from(aesCtr.decrypt(encryptedPrivateKey).buffer));
    tasks.run(t, privateKey, i);
  });
  try {
    var salt = Buffer.from(data.salt, 'hex');
    return scrypt2x(password, salt, tasks, t1);
  } catch (err) {
    tasks.error(err);
  }
};

Account.prototype._import = function (data, password, tasks, t, i) {
  var _this5 = this;

  var t1 = tasks.add(function (dkey, hash) {
    if (data.hash !== hash) {
      return tasks.error(errInvalidPassword(password));
    }
    _this5._data = data;
    tasks.run(t, i);
  });
  var salt = Buffer.from(data.salt, 'hex');
  scrypt2x(password, salt, tasks, t1);
};

Account.prototype._generate = function (password, tasks, t, i) {
  var _this6 = this;

  var keypair = nacl.sign.keyPair();
  var salt = crypto.randomBytes(saltLength);
  var t1 = tasks.add(function (dkey, hash) {
    var aesCtr = new aes.ModeOfOperation.ctr(dkey);
    var encryptedPrivateKey = Buffer.from(aesCtr.encrypt(keypair.secretKey.slice(0, 32)).buffer).toString('hex');
    _this6._data = {
      encryptedPrivateKey: encryptedPrivateKey,
      hash: hash,
      publicKey: base58.encode(keypair.publicKey),
      salt: salt.toString('hex')
    };
    tasks.run(t, clone(_this6._data), i);
  });
  scrypt2x(password, salt, tasks, t1);
};

Account.prototype.generate = function (password, cb) {
  var tasks = new Tasks(cb);
  this._generate(password, tasks, -1);
};

Account.prototype.import = function (account, password, cb) {
  var tasks = new Tasks(cb);
  this._import(account, password, tasks, -1);
};

function Project(_ref4) {
  var account = _ref4.account,
      contentService = _ref4.contentService,
      metadataService = _ref4.metadataService,
      title = _ref4.title;


  this._account = account;

  this._contentService = new ContentService({
    name: contentService.name,
    path: contentService.path
  });

  this._metadataService = new MetadataService({
    name: metadataService.name,
    path: metadataService.path
  });

  this._title = title;
}

Project.prototype._import = function (content, metadata, password, tasks, t, i) {
  var account = this._account;
  var contentService = this._contentService;
  var metadataService = this._metadataService;
  var publicKey = account ? account.publicKey() : '';
  var t1 = tasks.add(function (meta) {
    metadataService._import(metadata.concat(meta), { publicKey: publicKey }, { amount: 1, publicKey: publicKey }, tasks, t, i);
  });
  contentService._import(content, password, tasks, t1);
};

Project.prototype._upload = function (password, tasks, t, i) {
  var account = this._account;
  var contentService = this._contentService;
  var metadataService = this._metadataService;
  var t1 = void 0,
      t2 = void 0;
  t2 = tasks.add(function () {
    contentService._put(tasks, t, i);
  });
  var publicKey = account ? account.publicKey() : '';
  if (!publicKey) {
    return metadataService._put({}, tasks, t2);
  }
  t1 = tasks.add(function (privateKey) {
    metadataService._put({ privateKey: privateKey, publicKey: publicKey }, tasks, t2);
  });
  account._decrypt(password, tasks, t1);
};

Project.prototype._export = function (name) {
  var contentService = this._contentService;
  var metadataService = this._metadataService;
  switch (name) {
    case 'content_decryption':
      return contentService._exportDecryption();
    case 'content_hashes':
      return contentService._exportHashes();
    case 'linked_data':
      return metadataService._exportLinkedData();
    case 'metadata_hashes':
      return metadataService._exportHashes();
    default:
      throw new Error('unexpected export: ' + name);
  }
};

Project.prototype.upload = function (password, cb) {
  if (typeof password === 'function') {
    var _ref5 = [password, ''];
    cb = _ref5[0];
    password = _ref5[1];
  } else if (!cb) {
    throw ErrNoCallback;
  }
  var tasks = new Tasks(cb);
  this._upload(password, tasks, -1);
};

Project.prototype.export = Project.prototype._export;

Project.prototype.import = function (content, metadata, password, cb) {
  if (typeof password === 'function') {
    var _ref6 = [password, ''];
    cb = _ref6[0];
    password = _ref6[1];
  } else if (!cb) {
    throw ErrNoCallback;
  }
  var tasks = new Tasks(cb);
  this._import(content, metadata, password, tasks, -1);
};

module.exports = {
  Account: Account,
  ContentService: ContentService,
  MetadataService: MetadataService,
  Project: Project,
  ErrNoAccount: ErrNoAccount,
  ErrNoCallback: ErrNoCallback,
  ErrNoDecryption: ErrNoDecryption,
  ErrNoLinkedData: ErrNoLinkedData,
  ErrNoHashes: ErrNoHashes,
  errInvalidPassword: errInvalidPassword,
  errUnexpectedHash: errUnexpectedHash,
  errUnsupportedService: errUnsupportedService
};