var GifCodec = (function(){

  function readHeader(bytes){
    var sig = String.fromCharCode(bytes[0], bytes[1], bytes[2]);
    if(sig !== "GIF") throw new Error("ce fichier n'est pas un GIF");
    return {
      width: bytes[6] | (bytes[7] << 8),
      height: bytes[8] | (bytes[9] << 8),
      flags: bytes[10],
      bgIndex: bytes[11]
    };
  }

  function readPalette(bytes, offset, count){
    var palette = new Uint8Array(count * 3);
    for(var i = 0; i < count * 3; i++) palette[i] = bytes[offset + i];
    return palette;
  }

  function lzwDecode(bytes, start, dataSize, pixelCount){
    var output = new Uint8Array(pixelCount);
    var clearCode = 1 << dataSize;
    var endCode = clearCode + 1;
    var codeSize = dataSize + 1;
    var nextCode = endCode + 1;
    var mask = (1 << codeSize) - 1;

    var prefix = new Int32Array(4096);
    var suffix = new Uint8Array(4096);
    var stack = new Uint8Array(4096);
    var i;
    for(i = 0; i < clearCode; i++){
      prefix[i] = -1;
      suffix[i] = i;
    }

    var pos = start;
    var blockSize = 0;
    var blockPos = 0;
    var bitBuffer = 0;
    var bitCount = 0;
    var outPos = 0;
    var stackTop = 0;
    var previousCode = -1;
    var firstChar = 0;

    function nextByte(){
      if(blockPos >= blockSize){
        blockSize = bytes[pos++];
        blockPos = 0;
        if(blockSize === 0) return -1;
      }
      blockPos++;
      return bytes[pos++];
    }

    while(outPos < pixelCount){
      while(bitCount < codeSize){
        var b = nextByte();
        if(b < 0) return { pixels: output, end: pos };
        bitBuffer |= b << bitCount;
        bitCount += 8;
      }
      var code = bitBuffer & mask;
      bitBuffer >>= codeSize;
      bitCount -= codeSize;

      if(code === clearCode){
        codeSize = dataSize + 1;
        mask = (1 << codeSize) - 1;
        nextCode = endCode + 1;
        previousCode = -1;
        continue;
      }
      if(code === endCode) break;

      var currentCode = code;
      if(code >= nextCode){
        stack[stackTop++] = firstChar;
        currentCode = previousCode;
      }
      while(currentCode >= clearCode){
        stack[stackTop++] = suffix[currentCode];
        currentCode = prefix[currentCode];
      }
      firstChar = suffix[currentCode] & 0xff;
      stack[stackTop++] = firstChar;

      while(stackTop > 0 && outPos < pixelCount){
        output[outPos++] = stack[--stackTop];
      }

      if(previousCode !== -1 && nextCode < 4096){
        prefix[nextCode] = previousCode;
        suffix[nextCode] = firstChar;
        nextCode++;
        if((nextCode & mask) === 0 && nextCode < 4096){
          codeSize++;
          mask += nextCode;
        }
      }
      previousCode = code;
    }

    while(bytes[pos] !== 0 && pos < bytes.length) pos++;
    return { pixels: output, end: pos + 1 };
  }

  function decode(buffer){
    var bytes = new Uint8Array(buffer);
    var header = readHeader(bytes);
    var pos = 13;
    var globalPalette = null;
    if(header.flags & 0x80){
      var size = 2 << (header.flags & 7);
      globalPalette = readPalette(bytes, pos, size);
      pos += size * 3;
    }

    var frames = [];
    var pending = { delay: 10, transparentIndex: -1, disposal: 0 };

    while(pos < bytes.length){
      var block = bytes[pos];

      if(block === 0x3B) break;

      if(block === 0x21){
        var label = bytes[pos + 1];
        if(label === 0xF9){
          var flags = bytes[pos + 3];
          pending.disposal = (flags >> 2) & 7;
          pending.transparentIndex = (flags & 1) ? bytes[pos + 6] : -1;
          pending.delay = (bytes[pos + 4] | (bytes[pos + 5] << 8)) || 10;
          pos += 8;
        } else {
          pos += 2;
          while(bytes[pos] !== 0 && pos < bytes.length) pos += bytes[pos] + 1;
          pos++;
        }
        continue;
      }

      if(block === 0x2C){
        var frame = {
          x: bytes[pos + 1] | (bytes[pos + 2] << 8),
          y: bytes[pos + 3] | (bytes[pos + 4] << 8),
          width: bytes[pos + 5] | (bytes[pos + 6] << 8),
          height: bytes[pos + 7] | (bytes[pos + 8] << 8),
          delay: pending.delay,
          disposal: pending.disposal,
          transparentIndex: pending.transparentIndex
        };
        var localFlags = bytes[pos + 9];
        pos += 10;
        var palette = globalPalette;
        if(localFlags & 0x80){
          var lsize = 2 << (localFlags & 7);
          palette = readPalette(bytes, pos, lsize);
          pos += lsize * 3;
        }
        frame.interlaced = !!(localFlags & 0x40);
        var dataSize = bytes[pos++];
        var result = lzwDecode(bytes, pos, dataSize, frame.width * frame.height);
        frame.indices = result.pixels;
        frame.palette = palette;
        pos = result.end;
        frames.push(frame);
        pending = { delay: 10, transparentIndex: -1, disposal: 0 };
        continue;
      }

      pos++;
    }

    return { width: header.width, height: header.height, frames: frames };
  }

  function deinterlace(frame){
    if(!frame.interlaced) return frame.indices;
    var out = new Uint8Array(frame.indices.length);
    var offsets = [0, 4, 2, 1];
    var steps = [8, 8, 4, 2];
    var row = 0;
    for(var pass = 0; pass < 4; pass++){
      for(var y = offsets[pass]; y < frame.height; y += steps[pass]){
        out.set(frame.indices.subarray(row * frame.width, (row + 1) * frame.width), y * frame.width);
        row++;
      }
    }
    return out;
  }

  function toImageDataList(gif, createCanvasFn){
    var canvas = createCanvasFn(gif.width, gif.height);
    var ctx = canvas.getContext("2d");
    var out = [];
    var previous = null;

    gif.frames.forEach(function(frame){
      if(frame.disposal === 3){
        previous = ctx.getImageData(0, 0, gif.width, gif.height);
      }

      var indices = deinterlace(frame);
      var patch = ctx.createImageData(frame.width, frame.height);
      for(var i = 0; i < indices.length; i++){
        var idx = indices[i];
        if(idx === frame.transparentIndex){
          patch.data[i * 4 + 3] = 0;
          continue;
        }
        patch.data[i * 4] = frame.palette[idx * 3];
        patch.data[i * 4 + 1] = frame.palette[idx * 3 + 1];
        patch.data[i * 4 + 2] = frame.palette[idx * 3 + 2];
        patch.data[i * 4 + 3] = 255;
      }

      var patchCanvas = createCanvasFn(frame.width, frame.height);
      patchCanvas.getContext("2d").putImageData(patch, 0, 0);
      ctx.drawImage(patchCanvas, frame.x, frame.y);

      out.push({
        imageData: ctx.getImageData(0, 0, gif.width, gif.height),
        delay: frame.delay
      });

      if(frame.disposal === 2){
        ctx.clearRect(frame.x, frame.y, frame.width, frame.height);
      } else if(frame.disposal === 3 && previous){
        ctx.putImageData(previous, 0, 0);
      }
    });

    return out;
  }

  function quantize(frames, maxColors){
    var counts = {};
    frames.forEach(function(f){
      var d = f.imageData.data;
      for(var i = 0; i < d.length; i += 4){
        if(d[i + 3] < 128) continue;
        var key = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3);
        counts[key] = (counts[key] || 0) + 1;
      }
    });

    var entries = Object.keys(counts).map(function(k){
      var key = parseInt(k, 10);
      return {
        key: key,
        r: ((key >> 10) & 31) << 3,
        g: ((key >> 5) & 31) << 3,
        b: (key & 31) << 3,
        count: counts[k]
      };
    });
    entries.sort(function(a, b){ return b.count - a.count; });

    var palette = entries.slice(0, maxColors).map(function(e){
      return [e.r, e.g, e.b];
    });
    while(palette.length < 2) palette.push([0, 0, 0]);
    return palette;
  }

  function buildLookup(palette){
    var cache = {};
    return function(r, g, b){
      var key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      if(cache[key] !== undefined) return cache[key];
      var best = 0, bestDist = Infinity;
      for(var i = 0; i < palette.length; i++){
        var dr = r - palette[i][0], dg = g - palette[i][1], db = b - palette[i][2];
        var dist = dr * dr + dg * dg + db * db;
        if(dist < bestDist){ bestDist = dist; best = i; }
      }
      cache[key] = best;
      return best;
    };
  }

  function ByteWriter(){
    this.bytes = [];
  }
  ByteWriter.prototype.byte = function(v){ this.bytes.push(v & 0xff); };
  ByteWriter.prototype.short = function(v){ this.byte(v); this.byte(v >> 8); };
  ByteWriter.prototype.string = function(s){
    for(var i = 0; i < s.length; i++) this.byte(s.charCodeAt(i));
  };

  function lzwEncode(indices, dataSize, writer){
    var clearCode = 1 << dataSize;
    var endCode = clearCode + 1;
    var codeSize = dataSize + 1;
    var nextCode = endCode + 1;

    var dict = {};
    var block = [];
    var bitBuffer = 0;
    var bitCount = 0;

    function flushBlock(){
      if(!block.length) return;
      writer.byte(block.length);
      for(var i = 0; i < block.length; i++) writer.byte(block[i]);
      block = [];
    }

    function emit(code){
      bitBuffer |= code << bitCount;
      bitCount += codeSize;
      while(bitCount >= 8){
        block.push(bitBuffer & 0xff);
        bitBuffer >>= 8;
        bitCount -= 8;
        if(block.length === 255) flushBlock();
      }
    }

    writer.byte(dataSize);
    emit(clearCode);

    var current = indices[0];
    for(var i = 1; i < indices.length; i++){
      var next = indices[i];
      var key = current + "," + next;
      if(dict[key] !== undefined){
        current = dict[key];
      } else {
        emit(current);
        if(nextCode < 4096){
          dict[key] = nextCode++;
          if(nextCode > (1 << codeSize) && codeSize < 12) codeSize++;
        } else {
          emit(clearCode);
          dict = {};
          codeSize = dataSize + 1;
          nextCode = endCode + 1;
        }
        current = next;
      }
    }
    emit(current);
    emit(endCode);

    if(bitCount > 0){
      block.push(bitBuffer & 0xff);
      if(block.length === 255) flushBlock();
    }
    flushBlock();
    writer.byte(0);
  }

  function encode(frames, width, height, options){
    options = options || {};
    var maxColors = options.transparent === false ? 256 : 255;
    var palette = quantize(frames, maxColors);
    var transparentIndex = options.transparent === false ? -1 : palette.length;
    if(transparentIndex >= 0) palette = palette.concat([[0, 0, 0]]);

    var bits = 1;
    while((1 << bits) < palette.length) bits++;
    if(bits > 8) bits = 8;
    var paletteSize = 1 << bits;

    var lookup = buildLookup(palette.slice(0, transparentIndex >= 0 ? transparentIndex : palette.length));
    var w = new ByteWriter();

    w.string("GIF89a");
    w.short(width);
    w.short(height);
    w.byte(0x80 | ((bits - 1) & 7));
    w.byte(0);
    w.byte(0);
    for(var i = 0; i < paletteSize; i++){
      var c = palette[i] || [0, 0, 0];
      w.byte(c[0]); w.byte(c[1]); w.byte(c[2]);
    }

    w.byte(0x21); w.byte(0xFF); w.byte(11);
    w.string("NETSCAPE2.0");
    w.byte(3); w.byte(1);
    w.short(options.loop === undefined ? 0 : options.loop);
    w.byte(0);

    frames.forEach(function(frame){
      var delay = Math.max(2, Math.round(frame.delay || 10));
      w.byte(0x21); w.byte(0xF9); w.byte(4);
      w.byte((2 << 2) | (transparentIndex >= 0 ? 1 : 0));
      w.short(delay);
      w.byte(transparentIndex >= 0 ? transparentIndex : 0);
      w.byte(0);

      w.byte(0x2C);
      w.short(0); w.short(0);
      w.short(width); w.short(height);
      w.byte(0);

      var data = frame.imageData.data;
      var indices = new Uint8Array(width * height);
      for(var p = 0; p < indices.length; p++){
        if(data[p * 4 + 3] < 128 && transparentIndex >= 0){
          indices[p] = transparentIndex;
        } else {
          indices[p] = lookup(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]);
        }
      }
      lzwEncode(indices, bits, w);
    });

    w.byte(0x3B);
    return new Uint8Array(w.bytes);
  }

  return {
    decode: decode,
    toImageDataList: toImageDataList,
    encode: encode
  };
})();

if(typeof module !== "undefined") module.exports = GifCodec;
