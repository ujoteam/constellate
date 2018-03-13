'use strict';

var constellate = require('../lib');

var _require = require('../lib/util'),
    Tasks = _require.Tasks,
    bufferToFile = _require.bufferToFile,
    errUnexpectedType = _require.errUnexpectedType,
    isString = _require.isString,
    prettyJSON = _require.prettyJSON,
    readFileAs = _require.readFileAs;

/**
 * @module constellate/src/constellate-browser
 */


var readFilesAs = function readFilesAs(files, readAs, tasks, t, i) {
  var count = 0;
  var t1 = tasks.add(function (result, j) {
    files[j] = {
      content: isString(result) ? result : Buffer.from(result),
      name: files[j].name,
      type: files[j].type
    };
    if (++count !== files.length) return;
    tasks.run(t, files, j);
  });
  for (var j = 0; j < files.length; j++) {
    readFileAs(files[j], readAs, tasks, t1, j);
  }
};

function Account() {
  constellate.Account.call(this);
}

Account.prototype = Object.create(constellate.Account.prototype);

Account.prototype.generate = function (password, cb) {
  var tasks = new Tasks(cb);
  tasks.add(function (data) {
    var file = new File([prettyJSON(data)], 'account.json', { type: 'application/json' });
    tasks.run(-1, file);
  });
  this._generate(password, tasks, 0);
};

Account.prototype.import = function (file, password, cb) {
  var _this = this;

  if (file.type !== 'application/json') {
    throw errUnexpectedType(file.type, 'application/json');
  }
  var tasks = new Tasks(cb);
  tasks.add(function (text) {
    try {
      var data = JSON.parse(text);
      _this._import(data, password, tasks, -1);
    } catch (err) {
      tasks.error(err);
    }
  });
  readFileAs(file, 'text', tasks, 0);
};

function ContentService(params) {
  constellate.ContentService.call(this, params);
}

ContentService.prototype = Object.create(constellate.ContentService.prototype);

ContentService.prototype.get = function (path, decrypt, cb) {
  if (typeof decrypt === 'function') {
    var _ref = [decrypt, {}];
    cb = _ref[0];
    decrypt = _ref[1];
  } else if (!cb) {
    throw constellate.ErrNoCallback;
  }
  var tasks = new Tasks(cb);
  tasks.add(function (content) {
    bufferToFile(content, path, tasks, -1);
  });
  this._get(path, decrypt, tasks, 0);
};

ContentService.prototype._exportDecryption = function () {
  var decryption = this._decryption;
  if (!decryption) {
    throw constellate.ErrNoDecryption;
  }
  return new File([prettyJSON(decryption)], 'decryption.json', { type: 'application/json' });
};

ContentService.prototype.importDecryption = function (file, cb) {
  var _this2 = this;

  if (file.type !== 'application/json') {
    return cb(errUnexpectedType(file.type, 'application/json'));
  }
  var tasks = new Tasks(cb);
  tasks.add(function (text) {
    try {
      _this2._decryption = JSON.parse(text);
      tasks.run(-1);
    } catch (err) {
      tasks.error(err);
    }
  });
  readFileAs(file, 'text', tasks, 0);
};

ContentService.prototype._exportHashes = function () {
  var hashes = this._hashes;
  if (!hashes) {
    throw constellate.ErrNoHashes;
  }
  return new File([prettyJSON(hashes)], 'content_hashes.json', { type: 'application/json' });
};

ContentService.prototype.importHashes = function (file, cb) {
  var _this3 = this;

  if (file.type !== 'application/json') {
    return cb(errUnexpectedType(file.type, 'application/json'));
  }
  var tasks = new Tasks(cb);
  tasks.add(function (text) {
    try {
      _this3._hashes = JSON.parse(text);
      tasks.run(-1);
    } catch (err) {
      tasks.error(err);
    }
  });
  readFileAs(file, 'text', tasks, 0);
};

function MetadataService(params) {
  constellate.MetadataService.call(this, params);
}

MetadataService.prototype = Object.create(constellate.MetadataService.prototype);

MetadataService.prototype._exportHashes = function () {
  var hashes = this._hashes;
  if (!hashes) {
    throw constellate.ErrNoHashes;
  }
  return new File([prettyJSON(hashes)], 'metadata_hashes.json', { type: 'application/json' });
};

MetadataService.prototype.importHashes = function (file, cb) {
  var _this4 = this;

  if (file.type !== 'application/json') {
    return cb(errUnexpectedType(file.type, 'application/json'));
  }
  var tasks = new Tasks(cb);
  tasks.add(function (text) {
    try {
      _this4._hashes = JSON.parse(text);
      tasks.run(-1);
    } catch (err) {
      tasks.error(err);
    }
  });
  readFileAs(file, 'text', tasks, 0);
};

MetadataService.prototype._exportLinkedData = function () {
  var ld = this._ld;
  if (!ld || !ld.length) {
    throw constellate.ErrNoLinkedData;
  }
  return new File([prettyJSON(ld)], 'linked_data.json', { type: 'application/json' });
};

MetadataService.prototype.importLinkedData = function (file, cb) {
  var _this5 = this;

  if (file.type !== 'application/json') {
    return cb(errUnexpectedType(file.type, 'application/json'));
  }
  var tasks = new Tasks(cb);
  tasks.add(function (text) {
    try {
      _this5._ld = JSON.parse(text);
      tasks.run(-1);
    } catch (err) {
      tasks.error(err);
    }
  });
  readFileAs(file, 'text', tasks, 0);
};

function Project(params) {
  constellate.Project.call(this, params);
}

Project.prototype = Object.create(constellate.Project.prototype);

Project.prototype.export = function (name) {
  return new File([prettyJSON(this._export(name))], this._title + '_' + name + '.json', { type: 'application/json' });
};

Project.prototype.import = function (content, metadata, password, cb) {
  var _this6 = this;

  if (typeof password === 'function') {
    var _ref2 = [password, ''];
    cb = _ref2[0];
    password = _ref2[1];
  } else if (!cb) {
    throw constellate.ErrNoCallback;
  }
  var tasks = new Tasks(cb);
  var args = [null, null, password, tasks, -1];
  var count = 0;
  tasks.add(function (result, j) {
    try {
      if (!j) {
        args[0] = result;
      } else {
        args[1] = JSON.parse(result);
      }
      if (++count !== 2) return;
      _this6._import.apply(_this6, args);
    } catch (err) {
      tasks.error(err);
    }
  });
  readFilesAs(content, 'arraybuffer', tasks, 0, 0);
  readFileAs(metadata, 'text', tasks, 0, 1);
};

module.exports = {
  Account: Account,
  ContentService: ContentService,
  MetadataService: MetadataService,
  Project: Project
};