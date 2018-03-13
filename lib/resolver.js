'use strict';

var _require = require('../lib/util'),
    isArray = _require.isArray,
    isMerkleLink = _require.isMerkleLink,
    isObject = _require.isObject,
    order = _require.order,
    transform = _require.transform,
    traverse = _require.traverse;
/**
 * @module constellate/src/resolver
 */

// The following code is adapted from https://github.com/ipld/js-ipld-resolver/blob/master/src/index.js


module.exports = function (service) {
  var _this = this;

  var get = function get(cid, path, tasks, t, i) {
    var t1 = void 0,
        t2 = void 0;
    t1 = tasks.add(function (elem) {
      service.resolve(elem, path, tasks, t2);
    });
    t2 = tasks.add(function (val, remPath) {
      path = remPath;
      if (!path || path === '/' && val && !val['/']) {
        return tasks.run(t, val, i);
      }
      if (val) {
        try {
          val = service.pathToCID(val['/']);
        } catch (err) {
          tasks.error(err);
        }
        cid = val.cid;
        if (val.remPath) {
          path = val.remPath + '/' + path;
        }
      }
      service.get(cid, tasks, t1);
    });
    service.get(cid, tasks, t1);
  };

  this.get = function (cid, path, tasks, t, i) {
    var t1 = tasks.add(function (val) {
      service.toElement(val, path, tasks, t, i);
    });
    get(cid, path, tasks, t1);
  };

  this.expand = function (elem, tasks, t, i) {
    var expanded = order(elem);
    var trails = [];
    var vals = [];
    var t1 = void 0;
    if (isMerkleLink(elem)) {
      try {
        var _service$pathToCID = service.pathToCID(elem['/']),
            cid = _service$pathToCID.cid,
            remPath = _service$pathToCID.remPath;

        t1 = tasks.add(function (result) {
          _this.expand(result, tasks, t, i);
        });
        return get(cid, remPath, tasks, t1);
      } catch (err) {
        tasks.error(err);
      }
    }
    traverse(elem, function (trail, val) {
      if (!isMerkleLink(val)) return;
      try {
        val = service.pathToCID(val['/']);
      } catch (err) {
        return;
      }
      trails.push(trail);
      vals.push(val);
    });
    if (!vals.length) {
      return tasks.run(t, expanded, i);
    }
    var count = 0,
        inner = void 0,
        keys = void 0,
        lastKey = void 0,
        t2 = void 0,
        x = void 0;
    t1 = tasks.add(function (val, j) {
      _this.expand(val, tasks, t2, j);
    });
    t2 = tasks.add(function (val, j) {
      keys = trails[j].split('.').filter(Boolean);
      lastKey = keys.pop();
      if (!isNaN(Number(lastKey))) {
        lastKey = Number(lastKey);
      }
      try {
        inner = keys.reduce(function (result, key) {
          if (!isNaN(Number(key))) {
            key = Number(key);
          }
          return result[key];
        }, expanded);
      } catch (err) {
        tasks.error(err);
      }
      x = inner[lastKey];
      if (isObject(x) && !x['/'] || isArray(x) && !x[0]['/']) {
        inner[lastKey] = [].concat(x, val);
      } else {
        inner[lastKey] = val;
      }
      if (++count !== vals.length) return;
      tasks.run(t, expanded, i);
    });
    for (var j = 0; j < vals.length; j++) {
      get(vals[j].cid, vals[j].remPath, tasks, t1, j);
    }
  };
};