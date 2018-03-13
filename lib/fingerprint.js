'use strict';

var fpcalc = require('fpcalc');

/**
 * @module constellate/src/fingerprint.js
 */


module.exports = function () {
  var _this = this;

  var encoded = void 0,
      raw = void 0;
  this.calc = function (filepath, tasks, t, i) {
    fpcalc(filepath, function (err, result) {
      if (err) {
        return tasks.error(err);
      }
      _this.decode(result.fingerprint);
      tasks.run(t, encoded, i);
    });
  };
  this.decode = function (_encoded) {
    var ui8 = base64Decode(Buffer.from(_encoded));
    raw = decompress(ui8);
    encoded = _encoded;
  };
  this.encode = function () {
    return encoded;
  };
  this.match = function (other) {
    return match(10.0, raw, other.raw());
  };
  this.raw = function () {
    return raw;
  };
};

function popcnt(x) {
  return ((x >>> 0).toString(2).match(/1/g) || []).length;
}

function addToArray(arr, i, x) {
  if (i < arr.length) arr[i] = x;
  arr.push(x);
}

function hammingDistance(x1, x2) {
  var bits1 = (x1 >>> 0).toString(2);
  var bits2 = (x2 >>> 0).toString(2);
  if (bits1.length > bits2.length) {
    bits2 = '0'.repeat(bits1.length - bits2.length) + bits2;
  } else if (bits1.length < bits2.length) {
    bits1 = '0'.repeat(bits2.length - bits1.length) + bits1;
  }
  return Array.from(bits1).reduce(function (result, bit, i) {
    if (bit !== bits2[i]) result++;
    return result;
  }, 0);
}

// The following code is adapted from https://github.com/acoustid/chromaprint/
// from https://github.com/acoustid/chromaprint/blob/master/src/utils/base64.h
function getBase64EncodedSize(size) {
  return (size * 4 + 2) / 3;
}

function getBase64DecodedSize(size) {
  return size * 3 / 4;
}

function base64Encode(input, terminate) {
  var kBase64Chars = Buffer.from('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_');
  var size = input.length;
  var output = Buffer.alloc(getBase64EncodedSize(size));
  var i = 0,
      j = 0;
  while (size >= 3) {
    output[i++] = kBase64Chars[input[j] >> 2 & 63];
    output[i++] = kBase64Chars[(input[j] << 4 | input[j + 1] >> 4) & 63];
    output[i++] = kBase64Chars[(input[j + 1] << 2 | input[j + 2] >> 6) & 63];
    output[i++] = kBase64Chars[input[j + 2] & 63];
    j += 3;
    size -= 3;
  }
  if (size) {
    output[i++] = kBase64Chars[input[j] >> 2 & 63];
    if (size === 1) {
      output[i++] = kBase64Chars[input[j] << 4 & 63];
    }
    if (size === 2) {
      output[i++] = kBase64Chars[(input[j] << 4 | input[j + 1] >> 4) & 63];
      output[i++] = kBase64Chars[input[j + 1] << 2 & 63];
    }
  }
  if (terminate) output[i] = '\0'.charCodeAt(0);
  return output;
}

function base64Decode(input) {
  var kBase64CharsReversed = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 62, 0, 0, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 0, 0, 0, 0, 63, 0, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  var size = input.length;
  var output = new Uint8Array(getBase64DecodedSize(size));
  var i = 0,
      j = 0;
  while (size >= 4) {
    output[i++] = kBase64CharsReversed[input[j] & 255] << 2 | kBase64CharsReversed[input[j + 1] & 255] >> 4;
    output[i++] = kBase64CharsReversed[input[j + 1] & 255] << 4 & 255 | kBase64CharsReversed[input[j + 2] & 255] >> 2;
    output[i++] = kBase64CharsReversed[input[j + 2] & 255] << 6 & 255 | kBase64CharsReversed[input[j + 3] & 255];
    j += 4;
    size -= 4;
  }
  if (size >= 2) {
    output[i++] = kBase64CharsReversed[input[j] & 255] << 2 | kBase64CharsReversed[input[j + 1] & 255] >> 4;
    if (size === 3) {
      output[i] = kBase64CharsReversed[input[j + 1] & 255] << 4 & 255 | kBase64CharsReversed[input[j + 2] & 255] >> 2;
    }
  }
  return output;
}

// from https://github.com/acoustid/chromaprint/blob/master/src/fingerprint_compressor.cpp
var kNormalBits = 3;
var kMaxNormalValue = (1 << kNormalBits) - 1;

function compress(algorithm, input) {
  var size = input.length;
  var normalBits = [],
      exceptionalBits = [];
  if (size) {
    normalBits = new Array(size);
    exceptionalBits = new Array(Math.round(size / 10));
    var bit = void 0,
        lastBit = void 0,
        x = void 0,
        value = void 0;
    var i = void 0,
        j = 0,
        k = 0;
    for (i = 0; i < size; i++) {
      bit = 1;
      lastBit = 0;
      x = input[i];
      if (i) x ^= input[i - 1];
      while (x) {
        if (x & 1) {
          if ((value = bit - lastBit) >= kMaxNormalValue) {
            addToArray(normalBits, j++, kMaxNormalValue);
            addToArray(exceptionalBits, k++, value - kMaxNormalValue);
          } else {
            addToArray(normalBits, j++, value);
          }
          lastBit = bit;
        }
        x >>>= 1;
        bit++;
      }
      addToArray(normalBits, j++, 0);
    }
    normalBits = normalBits.slice(0, j);
    exceptionalBits = exceptionalBits.slice(0, k);
  }
  var packedInt3ArraySize = getPackedInt3ArraySize(normalBits.length);
  var output = new Uint8Array(4 + packedInt3ArraySize + getPackedInt5ArraySize(exceptionalBits.length));
  output[0] = algorithm & 255;
  output[1] = size >> 16 & 255;
  output[2] = size >> 8 & 255;
  output[3] = size & 255;
  output.set(packInt3Array(Uint8Array.from(normalBits)), 4);
  output.set(packInt5Array(Uint8Array.from(exceptionalBits)), 4 + packedInt3ArraySize);
  return output;
}

// from https://github.com/acoustid/chromaprint/blob/master/src/fingerprint_decompressor.cpp
var kExceptionBits = 5;
function decompress(input) {
  var size = input.length;
  if (size < 4) {
    throw new Error('fingerprint cannot be shorter than 4 bytes');
  }
  var algorithm = input[0];
  var numValues = input[1] << 16 | input[2] << 8 | input[3];
  var offset = 4;
  var bits = unpackInt3Array(input.slice(offset));
  var foundValues = 0,
      i = void 0,
      numExceptionalBits = 0;
  for (i = 0; i < bits.length; i++) {
    if (!bits[i]) {
      if (++foundValues === numValues) {
        bits = bits.slice(0, i + 1);
        break;
      }
    } else if (bits[i] === kMaxNormalValue) {
      numExceptionalBits++;
    }
  }
  if (foundValues !== numValues) {
    throw new Error('fingerprint is too short, not enough data for normal bits');
  }
  offset += getPackedInt3ArraySize(bits.length);
  if (size + 1 < Math.floor(offset + getPackedInt5ArraySize(numExceptionalBits))) {
    throw new Error('fingerprint is too short, not enough data for exceptional bits');
  }
  if (numExceptionalBits) {
    var exceptionalBits = unpackInt5Array(input.slice(offset));
    var j = 0;
    for (i = 0; i < bits.length; i++) {
      if (bits[i] === kMaxNormalValue) {
        bits[i] += exceptionalBits[j++];
      }
    }
  }
  return unpackBits(bits, numValues);
}

function unpackBits(bits, size) {
  var output = new Uint32Array(size).map(function () {
    return -1;
  });
  var bit = 0,
      value = 0;
  var i = 0,
      j = void 0;
  for (j = 0; j < bits.length; j++) {
    if (!bits[j]) {
      output[i] = !i ? value : output[i - 1] ^ value;
      bit = 0, value = 0;
      i++;
      continue;
    }
    bit += bits[j];
    value |= 1 << bit - 1;
  }
  return output;
}

// from https://github.com/acoustid/chromaprint/blob/master/src/utils/pack_int3_array.h
function getPackedInt3ArraySize(size) {
  return (size * 3 + 7) / 8;
}

function packInt3Array(input) {
  var size = input.length;
  var output = new Uint8Array(getPackedInt3ArraySize(size));
  var i = 0,
      j = 0;
  while (size >= 8) {
    output[i++] = input[j] & 0x07 | (input[j + 1] & 0x07) << 3 | (input[j + 2] & 0x03) << 6;
    output[i++] = (input[j + 2] & 0x04) >> 2 | (input[j + 3] & 0x07) << 1 | (input[j + 4] & 0x07) << 4 | (input[j + 5] & 0x01) << 7;
    output[i++] = (input[j + 5] & 0x06) >> 1 | (input[j + 6] & 0x07) << 2 | (input[j + 7] & 0x07) << 5;
    j += 8;
    size -= 8;
  }
  if (size >= 1) {
    output[i] = input[j] & 0x07;
  }
  if (size >= 2) {
    output[i] |= (input[j + 1] & 0x07) << 3;
  }
  if (size >= 3) {
    output[i++] |= (input[j + 2] & 0x03) << 6;
    output[i] = (input[j + 2] & 0x04) >> 2;
  }
  if (size >= 4) {
    output[i] |= (input[j + 3] & 0x07) << 1;
  }
  if (size >= 5) {
    output[i] |= (input[j + 4] & 0x07) << 4;
  }
  if (size >= 6) {
    output[i++] |= (input[j + 5] & 0x01) << 7;
    output[i] = (input[j + 5] & 0x06) >> 1;
  }
  if (size === 7) {
    output[i] |= (input[j + 6] & 0x07) << 2;
  }
  return output;
}

// from https://github.com/acoustid/chromaprint/blob/master/src/utils/pack_int5_array.h
function getPackedInt5ArraySize(size) {
  return (size * 5 + 7) / 8;
}

function packInt5Array(input) {
  var size = input.length;
  var output = new Uint8Array(getPackedInt5ArraySize(size));
  var i = 0,
      j = 0;
  while (size >= 8) {
    output[i++] = input[j] & 0x1f | (input[j + 1] & 0x07) << 5;
    output[i++] = (input[j + 1] & 0x18) >> 3 | (input[j + 2] & 0x1f) << 2 | (input[j + 3] & 0x01) << 7;
    output[i++] = (input[j + 3] & 0x1e) >> 1 | (input[j + 4] & 0x0f) << 4;
    output[i++] = (input[j + 4] & 0x10) >> 4 | (input[j + 5] & 0x1f) << 1 | (input[j + 6] & 0x03) << 6;
    output[i++] = (input[j + 6] & 0x1c) >> 2 | (input[j + 7] & 0x1f) << 3;
    j += 8;
    size -= 8;
  }
  if (size >= 1) {
    output[i] = input[j] & 0x1f;
  }
  if (size >= 2) {
    output[i++] |= (input[j + 1] & 0x07) << 5;
    output[i] = (input[j + 1] & 0x18) >> 3;
  }
  if (size >= 3) {
    output[i] |= (input[j + 2] & 0x1f) << 2;
  }
  if (size >= 4) {
    output[i++] |= (input[j + 3] & 0x01) << 7;
    output[i] = (input[j + 3] & 0x1e) >> 1;
  }
  if (size >= 5) {
    output[i++] |= (input[j + 4] & 0x0f) << 4;
    output[i] = (input[j + 4] & 0x10) >> 4;
  }
  if (size >= 6) {
    output[i] |= (input[j + 5] & 0x1f) << 1;
  }
  if (size === 7) {
    output[i++] |= (input[j + 6] & 0x03) << 6;
    output[i] = (input[j + 6] & 0x1c) >> 2;
  }
  return output;
}

// from https://github.com/acoustid/chromaprint/blob/master/src/utils/unpack_int3_array.h
function getUnpackedInt3ArraySize(size) {
  return size * 8 / 3;
}

function unpackInt3Array(input) {
  var size = input.length;
  var output = new Uint8Array(getUnpackedInt3ArraySize(size));
  var i = 0,
      j = 0;
  while (size >= 3) {
    output[i++] = input[j] & 0x07;
    output[i++] = (input[j] & 0x38) >> 3;
    output[i++] = (input[j] & 0xc0) >> 6 | (input[j + 1] & 0x01) << 2;
    output[i++] = (input[j + 1] & 0x0e) >> 1;
    output[i++] = (input[j + 1] & 0x70) >> 4;
    output[i++] = (input[j + 1] & 0x80) >> 7 | (input[j + 2] & 0x03) << 1;
    output[i++] = (input[j + 2] & 0x1c) >> 2;
    output[i++] = (input[j + 2] & 0xe0) >> 5;
    j += 3;
    size -= 3;
  }
  if (size >= 1) {
    output[i++] = input[j] & 0x07;
    output[i++] = (input[j] & 0x38) >> 3;
  }
  if (size === 2) {
    output[i++] = (input[j] & 0xc0) >> 6 | (input[j + 1] & 0x01) << 2;
    output[i++] = (input[j + 1] & 0x0e) >> 1;
    output[i++] = (input[j + 1] & 0x70) >> 4;
  }
  return output;
}

// from https://github.com/acoustid/chromaprint/blob/master/src/utils/unpack_int5_array.h
function getUnpackedInt5ArraySize(size) {
  return size * 8 / 5;
}

function unpackInt5Array(input) {
  var size = input.length;
  var output = new Uint8Array(getUnpackedInt5ArraySize(size));
  var i = 0,
      j = 0;
  while (size >= 5) {
    output[i++] = input[j] & 0x1f;
    output[i++] = (input[j] & 0xe0) >> 5 | (input[j + 1] & 0x03) << 3;
    output[i++] = (input[j + 1] & 0x7c) >> 2;
    output[i++] = (input[j + 1] & 0x80) >> 7 | (input[j + 2] & 0x0f) << 1;
    output[i++] = (input[j + 2] & 0xf0) >> 4 | (input[j + 3] & 0x01) << 4;
    output[i++] = (input[j + 3] & 0x3e) >> 1;
    output[i++] = (input[j + 3] & 0xc0) >> 6 | (input[j + 4] & 0x07) << 2;
    output[i++] = (input[j + 4] & 0xf8) >> 3;
    j += 5;
    size -= 5;
  }
  if (size >= 1) {
    output[i++] = input[j] & 0x1f;
  }
  if (size >= 2) {
    output[i++] = (input[j] & 0xe0) >> 5 | (input[j + 1] & 0x03) << 3;
    output[i++] = (input[j + 1] & 0x7c) >> 2;
  }
  if (size >= 3) {
    output[i++] = (input[j + 1] & 0x80) >> 7 | (input[j + 2] & 0x0f) << 1;
  }
  if (size === 4) {
    output[i++] = (input[j + 2] & 0xf0) >> 4 | (input[j + 3] & 0x01) << 4;
    output[i++] = (input[j + 3] & 0x3e) >> 1;
  }
  return output;
}

// from https://github.com/acoustid/chromaprint/blob/master/src/utils/gaussian_filter.h
function ReflectIterator(size) {
  var _this2 = this;

  this.forward = true;
  this.pos = 0;
  this.size = size;
  this.moveForward = function () {
    if (_this2.forward) {
      if (_this2.pos + 1 === _this2.size) {
        _this2.forward = false;
      } else {
        _this2.pos++;
      }
    } else {
      if (!_this2.pos) {
        _this2.forward = true;
      } else {
        _this2.pos--;
      }
    }
  };
  this.moveBack = function () {
    if (_this2.forward) {
      if (!_this2.pos) {
        _this2.forward = false;
      } else {
        _this2.pos--;
      }
    } else {
      if (_this2.pos + 1 === _this2.size) {
        _this2.forward = true;
      } else {
        _this2.pos++;
      }
    }
  };
}

function boxFilter(input, output, w) {
  var size = input.length;
  if (output.length > size) {
    output = output.slice(0, size);
  }
  if (output.length < size) {
    var tmp = output;
    output = new Uint32Array(size);
    output.set(tmp);
  }
  if (!w || !size) return output;
  var wl = w / 2;
  var wr = w - wl;
  var iter1 = new ReflectIterator(size);
  var iter2 = new ReflectIterator(size);
  var i = void 0;
  for (i = 0; i < wl; i++) {
    iter1.moveBack();
    iter2.moveBack();
  }
  var sum = 0;
  for (i = 0; i < w; i++) {
    sum += input[iter2.pos];
    iter2.moveForward();
  }
  if (size > w) {
    for (i = 0; i < wl; i++) {
      output[i] = sum / w;
      sum += input[iter2.pos] - input[iter1.pos];
      iter1.moveForward();
      iter2.moveForward();
    }
    for (i = 0; i < size - w - 1; i++) {
      output[wl + i] = sum / w;
      sum += input[iter2.pos++] - input[iter1.pos++];
    }
    for (i = 0; i < wr + 1; i++) {
      output[size - wr - 1 + i] = sum / w;
      sum += input[iter2.pos] - input[iter1.pos];
      iter1.moveForward();
      iter2.moveForward();
    }
  } else {
    for (i = 0; i < size; i++) {
      output[i] = sum / w;
      sum += input[iter2.pos] - input[iter1.pos];
      iter1.moveForward();
      iter2.moveForward();
    }
  }
  return output;
}

function gaussianFilter(input, n, sigma) {
  var w = Math.floor(Math.sqrt(12 * sigma * sigma / n + 1));
  var wl = w - (w % 2 ? 0 : 1);
  var wu = wl + 2;
  var m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  var i = void 0,
      output = new Uint32Array([]);
  for (i = 0; i < m; i++) {
    var _ref = [boxFilter(input, output, wl), input];
    input = _ref[0];
    output = _ref[1];
  }
  for (; i < n; i++) {
    var _ref2 = [boxFilter(input, output, wu), input];
    input = _ref2[0];
    output = _ref2[1];
  }
  if (!((m + n) % 2)) output = input;
  return output;
}

// from https://github.com/acoustid/chromaprint/blob/master/src/utils/gradient.h
function gradient(input, size) {
  var output = new Uint32Array(size);
  if (input.length <= 1) {
    return output;
  }
  var i = 0,
      j = 0;
  var f0 = input[i++];
  var f1 = input[i++];
  output[j++] = f1 - f0;
  if (i === input.length) {
    output[j] = f1 - f0;
    return output;
  }
  var f2 = input[i++];
  while (i < input.length) {
    output[j++] = (f2 - f0) / 2;
    var _ref3 = [f1, f2, input[i++]];
    f0 = _ref3[0];
    f1 = _ref3[1];
    f2 = _ref3[2];
  }
  output[j] = f2 - f1;
  return output;
}

// from https://github.com/acoustid/chromaprint/blob/master/src/fingerprint_matcher.h
function Segment(pos1, pos2, duration, score, leftScore, rightScore) {
  var _this3 = this;

  this.pos1 = pos1;
  this.pos2 = pos2;
  this.duration = duration;
  this.score = score;
  if (leftScore) this.leftScore = leftScore;else this.leftScore = score;
  if (rightScore) this.rightScore = rightScore;else this.rightScore = score;
  this.merge = function (other) {
    if (_this3.pos1 + _this3.duration !== other.pos1 || _this3.pos2 + _this3.duration !== other.pos2) return;
    var newDuration = _this3.duration + other.duration;
    var newScore = (_this3.score * _this3.duration + other.score * other.duration) / newDuration;
    Object.assign(_this3, new Segment(_this3.pos1, _this3.pos2, newDuration, newScore, score, other.score));
  };
}

// from https://github.com/acoustid/chromaprint/blob/master/src/fingerprint_matcher.cpp
var ALIGN_BITS = 12;
var alignStrip = function alignStrip(x) {
  return x >>> 32 - ALIGN_BITS;
};
function match(matchThreshold, raw1, raw2) {
  var hashShift = 32 - ALIGN_BITS;
  var hashMask = (1 << ALIGN_BITS) - 1 << hashShift;
  var offsetMask = (1 << 32 - ALIGN_BITS - 1) - 1;
  var sourceMask = 1 << 32 - ALIGN_BITS - 1;
  if (raw1.length + 1 >= offsetMask) {
    throw new Error('fingerprint 1 is too long');
  }
  if (raw2.length + 1 >= offsetMask) {
    throw new Error('fingerprint 2 is too long');
  }
  var offsets = new Uint32Array(raw1.length + raw2.length);
  var i = void 0,
      j = void 0;
  for (i = 0; i < raw1.length; i++) {
    offsets[i] = alignStrip(raw1[i]) << hashShift | i & offsetMask;
  }
  for (i = 0; i < raw2.length; i++) {
    offsets[raw1.length + i] = alignStrip(raw2[i]) << hashShift | i & offsetMask | sourceMask;
  }
  offsets.sort();
  var histogram = new Uint32Array(raw1.length + raw2.length);
  var hash1 = void 0,
      offset1 = void 0,
      source1 = void 0,
      hash2 = void 0,
      offset2 = void 0,
      source2 = void 0,
      offsetDiff = void 0;
  for (i = 0; i < offsets.length; i++) {
    source1 = offsets[i] & sourceMask;
    if (source1) continue;
    hash1 = offsets[i] & hashMask;
    offset1 = offsets[i] & offsetMask;
    for (j = i; j < offsets.length; j++) {
      hash2 = offsets[j] & hashMask;
      if (hash1 !== hash2) break;
      offset2 = offsets[j] & offsetMask;
      source2 = offsets[j] & sourceMask;
      if (source2) {
        offsetDiff = offset1 + raw2.length - offset2;
        histogram[offsetDiff]++;
      }
    }
  }
  var bestAlignments = [];
  var count = void 0,
      isPeakLeft = void 0,
      isPeakRight = void 0;
  for (i = 0; i < histogram.length; i++) {
    if ((count = histogram[i]) > 1) {
      isPeakLeft = !i || histogram[i - 1] <= count;
      isPeakRight = i >= histogram.length - 1 || histogram[i + 1] <= count;
      if (isPeakLeft && isPeakRight) {
        bestAlignments.push({ count: count, i: i });
      }
    }
  }
  bestAlignments.sort(function (a, b) {
    if (a.count > b.count) return -1;
    if (a.count < b.count) return 1;
    return 0;
  });
  var segments = [];
  var bitCounts = void 0,
      duration = void 0,
      size = 0,
      score = void 0;
  for (i = 0; i < bestAlignments.length; i++) {
    offsetDiff = bestAlignments[i].i - raw2.length;
    offset1 = offsetDiff > 0 ? offsetDiff : 0;
    offset2 = offsetDiff < 0 ? -offsetDiff : 0;
    size = Math.min(raw1.length - offset1, raw2.length - offset2);
    bitCounts = new Uint32Array(size);
    for (j = 0; j < size; j++) {
      bitCounts[j] = hammingDistance(raw1[offset1 + j], raw2[offset2 + j]) + Math.random() / 1000;
    }
    var smoothedBitCounts = gaussianFilter(bitCounts, 3, 8.0);
    var g = gradient(smoothedBitCounts, size).map(Math.abs);
    var peaks = [];
    for (i = 0; i < size; i++) {
      if (i && i < size - 1 && g[i] > 0.15 && g[i] >= g[i - 1] && g[i] >= g[i + 1]) {
        if (!peaks.length || peaks.slice(-1)[0] + 1 < i) {
          peaks.push(i);
        }
      }
    }
    peaks.push(size);
    var added = void 0,
        begin = 0,
        end = void 0,
        seg = void 0;
    for (i = 0; i < peaks.length; i++) {
      end = peaks[i];
      duration = end - begin;
      score = bitCounts.slice(begin, end).reduce(function (result, x) {
        return result + x;
      }, 0.0) / duration;
      if (score < matchThreshold) {
        added = false;
        if (segments.length) {
          seg = segments.slice(-1)[0];
          if (Math.abs(seg.score - score) < 0.7) {
            seg.merge(new Segment(offset1 + begin, offset2 + begin, duration, score));
            segments[segments.length - 1] = seg;
            added = true;
          }
        }
        if (!added) {
          segments.push(new Segment(offset1 + begin, offset2 + begin, duration, score));
        }
      }
      begin = end;
    }
    break;
  }
  duration = 0, score = 0;
  for (i = 0; i < segments.length; i++) {
    duration += segments[i].duration;
    score += segments[i].score;
  }
  duration = Math.round(duration / size * 1000) / 10;
  score = Math.round((1 - score / i / matchThreshold) * 1000) / 10;
  return { duration: duration, score: score };
}