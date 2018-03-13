'use strict';

var newArray = require('./util.js');

/**
 * @module constellate/src/translate
 */


var parseCSV = function parseCSV(csv, type) {
    // adapted from https://gist.github.com/jonmaim/7b896cf5c8cfe932a3dd
    var data = {};
    var lines = csv.replace(/\r/g, '').split('\n').filter(function (line) {
        return !!line;
    });
    var headers = lines[0].split(',');
    var i = void 0;
    for (i = 0; i < headers.length; i++) {
        data[headers[i]] = new Array(lines.length - 1);
    }
    data.type = newArray(type, lines.length - 1);
    var idx = void 0,
        queryIdx = void 0,
        startIdx = void 0;
    var key = void 0,
        length = void 0,
        obj = void 0,
        row = void 0,
        v = void 0,
        vals = void 0;
    for (i = 1; i < lines.length; i++) {
        idx = 0, queryIdx = 0, startIdx = 0;
        obj = {}, row = lines[i];
        if (!row.trim()) continue;
        while (idx < row.length) {
            if (row[idx] === '"') {
                while (idx < row.length - 1) {
                    if (row[++idx] === '"') break;
                }
            }
            if (row[idx] === ',' || idx + 1 === row.length) {
                length = idx - startIdx;
                if (idx + 1 === row.length) length++;
                v = row.substr(startIdx, length).replace(/\,\s+/g, ',').trim();
                if (v[0] === '"') {
                    v = v.substr(1);
                }
                if (v.substr(-1) === ',' || v.substr(-1) === '"') {
                    v = v.substr(0, v.length - 1);
                }
                var _key = headers[queryIdx++];
                if (!v) {
                    data[_key][i - 1] = null;
                } else {
                    vals = v.split(',');
                    if (vals.length > 1) {
                        data[_key][i - 1] = vals;
                    } else {
                        data[_key][i - 1] = v;
                    }
                }
                startIdx = idx + 1;
            }
            idx++;
        }
    }
    return data;
};

exports.parseCSVs = function (csvs, types, tasks, t, i) {
    if (csvs.length !== types.length) {
        return tasks.error(ErrDifferentArraySizes);
    }
    var a = void 0,
        b = void 0,
        key = void 0,
        keys = void 0,
        length = 0,
        obj = void 0,
        val = void 0;
    var combined = csvs.reduce(function (result, csv, idx) {
        obj = parseCSV(csv, types[idx]);
        keys = Object.keys(obj);
        for (a = 0; a < keys.length; a++) {
            key = keys[a];
            if (!result[key]) {
                result[key] = newArray(null, length);
            }
            result[key] = result[key].concat(obj[key]);
        }
        length += obj[key].length;
        return result;
    }, {});
    var objs = new Array(combined['name'].length);
    keys = Object.keys(combined);
    for (a = 0; a < objs.length; a++) {
        obj = {};
        for (b = 0; b < keys.length; b++) {
            key = keys[b];
            val = combined[key][a];
            if (val) {
                obj[key] = val;
            }
        }
        objs[a] = obj;
    }
    tasks.run(t, objs, i);
};

exports.parseJSONs = function (jsons, types, tasks, t, i) {
    if (jsons.length !== types.length) {
        return tasks.error(ErrDifferentArraySizes);
    }
    var arr = void 0,
        j = void 0;
    return jsons.reduce(function (result, json, idx) {
        arr = JSON.parse(json);
        if (!isArray(arr, isObject)) {
            return tasks.error(errWrongType(getType(arr), 'Object[]'));
        }
        for (j = 0; j < arr.length; j++) {
            arr[j].type = types[idx];
        }
        return result.concat(arr);
    }, []);
};

var toCSV = function toCSV(arr) {
    var csv = '',
        i = void 0,
        j = void 0,
        k = void 0,
        val = void 0;
    for (i = 0; i < arr[0].length; i++) {
        for (j = 0; j < arr.length; j++) {
            val = arr[j][i];
            if (isString(val)) {
                csv += val;
            } else if (isArray(val, isString)) {
                csv += '"';
                for (k = 0; k < val.length; k++) {
                    csv += val[k];
                }
                csv += '"';
            } else {
                throw errWrongType(getType(val), 'string|string[]');
            }
            if (j === arr.length - 1) {
                csv += '\n';
            } else {
                csv += ',';
            }
        }
    }
    return csv;
};