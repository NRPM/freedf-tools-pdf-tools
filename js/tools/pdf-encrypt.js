/* ============================================================
   pdf-encrypt.js — real PDF encryption (RC4 40-bit, PDF 1.4 / R=2)
   Pure client-side implementation of the PDF Standard Security
   Handler. pdf-lib >= 1.17 cannot CREATE encrypted PDFs, so this
   module post-processes already-saved PDF bytes:
     1. encrypts every stream and string literal with RC4
     2. injects the /Encrypt dictionary (V=1, R=2, Length=40)
     3. rebuilds the xref table + trailer
   Verified against pypdf: password accepted, pages decrypt,
   text extracts, wrong password rejected.
   ============================================================ */
(function (global) {
  'use strict';

  function md5(bytes) {
    function rotl(x, c) { return (x << c) | (x >>> (32 - c)); }
    function add32(a, b) { return (a + b) & 0xFFFFFFFF; }
    var K = [];
    for (var i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) & 0xFFFFFFFF;
    var S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
    var data = new Uint8Array(bytes.length + 1);
    data.set(bytes);
    data[bytes.length] = 0x80;
    var bitLen = bytes.length * 8;
    var paddedLen = ((data.length + 8 + 63) >> 6) << 6;
    var buf = new Uint8Array(paddedLen);
    buf.set(data);
    var dv = new DataView(buf.buffer);
    dv.setUint32(paddedLen - 8, bitLen >>> 0, true);
    dv.setUint32(paddedLen - 4, Math.floor(bitLen / 4294967296), true);
    var a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    for (var off = 0; off < paddedLen; off += 64) {
      var M = [];
      for (var i = 0; i < 16; i++) M[i] = dv.getUint32(off + i * 4, true);
      var A = a0, B = b0, C = c0, D = d0;
      for (var i = 0; i < 64; i++) {
        var F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; }
        else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
        else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
        else { F = C ^ (B | ~D); g = (7 * i) % 16; }
        F = add32(add32(add32(A, F), add32(K[i], M[g])), 0);
        var tmp = D; D = C; C = B;
        B = add32(B, rotl(F, S[i]));
        A = tmp;
      }
      a0 = add32(a0, A); b0 = add32(b0, B); c0 = add32(c0, C); d0 = add32(d0, D);
    }
    var res = new Uint8Array(16);
    var rdv = new DataView(res.buffer);
    rdv.setUint32(0, a0, true); rdv.setUint32(4, b0, true); rdv.setUint32(8, c0, true); rdv.setUint32(12, d0, true);
    return res;
  }

  function rc4(key, data) {
    var S = new Uint8Array(256);
    for (var i = 0; i < 256; i++) S[i] = i;
    var j = 0;
    for (var i = 0; i < 256; i++) {
      j = (j + S[i] + key[i % key.length]) & 0xFF;
      var t = S[i]; S[i] = S[j]; S[j] = t;
    }
    var out = new Uint8Array(data.length);
    var a = 0; j = 0;
    for (var k = 0; k < data.length; k++) {
      a = (a + 1) & 0xFF;
      j = (j + S[a]) & 0xFF;
      var t = S[a]; S[a] = S[j]; S[j] = t;
      out[k] = data[k] ^ S[(S[a] + S[j]) & 0xFF];
    }
    return out;
  }

  var PADDING = new Uint8Array([
    0x28,0xBF,0x4E,0x5E,0x4E,0x75,0x8A,0x41,0x64,0x00,0x4E,0x56,0xFF,0xFA,0x01,0x08,
    0x2E,0x2E,0x00,0xB6,0xD0,0x68,0x3E,0x80,0x2F,0x0C,0xA9,0xFE,0x64,0x53,0x69,0x7A
  ]);

  function padPass(p) {
    var b = new TextEncoder().encode(p || '');
    var out = new Uint8Array(32);
    out.set(b.slice(0, 32));
    out.set(PADDING.subarray(0, 32 - Math.min(b.length, 32)), Math.min(b.length, 32));
    return out;
  }

  function le32(n) {
    var b = new Uint8Array(4);
    b[0] = n & 0xFF; b[1] = (n >> 8) & 0xFF; b[2] = (n >> 16) & 0xFF; b[3] = (n >>> 24) & 0xFF;
    return b;
  }

  function hex(b) {
    var s = '';
    for (var i = 0; i < b.length; i++) s += (b[i] < 16 ? '0' : '') + b[i].toString(16);
    return s;
  }

  function decodePdfString(s) {
    var bytes = [];
    for (var i = 0; i < s.length; i++) {
      if (s[i] === '\\') {
        i++;
        var e = s[i];
        if (e === 'n') bytes.push(10);
        else if (e === 'r') bytes.push(13);
        else if (e === 't') bytes.push(9);
        else if (e === 'b') bytes.push(8);
        else if (e === 'f') bytes.push(12);
        else if (e === '(') bytes.push(40);
        else if (e === ')') bytes.push(41);
        else if (e === '\\') bytes.push(92);
        else if (e >= '0' && e <= '7') {
          var oct = e;
          for (var k = 0; k < 2 && i + 1 < s.length && s[i + 1] >= '0' && s[i + 1] <= '7'; k++) {
            oct += s[++i];
          }
          bytes.push(parseInt(oct, 8));
        } else bytes.push(63);
      } else {
        bytes.push(s.charCodeAt(i) & 0xFF);
      }
    }
    return new Uint8Array(bytes);
  }

  /* Encrypt string literals in an object body. Skips << >> dicts entirely. */
  function encryptStrings(body, key) {
    var out = '';
    var i = 0;
    while (i < body.length) {
      var c = body[i];
      if (c === '<' && body[i + 1] === '<') {
        out += '<<';
        i += 2;
      } else if (c === '>') {
        out += c;
        i++;
      } else if (c === '(') {
        var depth = 1, j = i + 1;
        while (j < body.length && depth > 0) {
          if (body[j] === '\\') { j += 2; continue; }
          if (body[j] === '(') depth++;
          else if (body[j] === ')') depth--;
          j++;
        }
        var rawBytes = decodePdfString(body.slice(i + 1, j - 1));
        out += '<' + hex(rc4(key, rawBytes)) + '>';
        i = j;
      } else if (c === '<') {
        var j2 = body.indexOf('>', i);
        if (j2 === -1) { out += c; i++; continue; }
        var inner = body.slice(i + 1, j2).replace(/\s/g, '');
        var raw = new Uint8Array(Math.ceil(inner.length / 2));
        for (var k = 0; k < raw.length; k++) {
          raw[k] = parseInt(inner.slice(k * 2, k * 2 + 2) || '00', 16) || 0;
        }
        out += '<' + hex(rc4(key, raw)) + '>';
        i = j2 + 1;
      } else {
        out += c;
        i++;
      }
    }
    return out;
  }

  function latin1Encode(s) {
    var b = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xFF;
    return b;
  }

  /* Byte-preserving decode: TextDecoder('latin1') in browsers is actually
     windows-1252, which remaps bytes 0x80-0x9F and corrupts binary stream
     data on the decode->re-encode round trip. Manual conversion is exact. */
  function latin1Decode(bytes) {
    var s = '';
    var CHUNK = 0x8000;
    for (var i = 0; i < bytes.length; i += CHUNK) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return s;
  }

  /**
   * Encrypt a saved PDF (Uint8Array) with RC4-40 (R=2).
   * @param {Uint8Array} bytes  source PDF bytes
   * @param {string} userPass  user password
   * @param {string} ownerPass owner password (may equal userPass)
   * @param {number} perms     permission flags (e.g. 0xFFFFFFFC)
   * @returns {Uint8Array} encrypted PDF bytes
   */
  function encryptPdf(bytes, userPass, ownerPass, perms) {
    var src = new Uint8Array(bytes);
    var text = latin1Decode(src);

    var nl = text.indexOf('\n');
    var header = text.slice(0, nl + 1);

    // random file ID
    var idBytes = new Uint8Array(16);
    if (global.crypto && global.crypto.getRandomValues) {
      global.crypto.getRandomValues(idBytes);
    } else {
      for (var i = 0; i < 16; i++) idBytes[i] = Math.floor(Math.random() * 256);
    }
    var idHex = hex(idBytes);

    // key derivation (Algorithm 2, R=2)
    var userPadded = padPass(userPass);
    var ownerPadded = padPass(ownerPass);
    var O = rc4(md5(ownerPadded).slice(0, 5), userPadded);
    var P = perms >>> 0;
    var keyInput = new Uint8Array(userPadded.length + O.length + 4 + 16);
    keyInput.set(userPadded, 0);
    keyInput.set(O, 32);
    keyInput.set(le32(P), 64);
    keyInput.set(idBytes, 68);
    var key = md5(keyInput).slice(0, 5);
    var U = rc4(key, PADDING);

    function objKey(refNum) {
      var k = new Uint8Array(key.length + 5);
      k.set(key, 0);
      k[5] = refNum & 0xFF; k[6] = (refNum >> 8) & 0xFF; k[7] = (refNum >> 16) & 0xFF;
      k[8] = 0; k[9] = 0;
      return md5(k).slice(0, Math.min(key.length + 5, 16));
    }

    // find all objects — process in document order; skip matches that fall
    // inside a previously-identified stream region (binary stream data can
    // contain false "N 0 obj" byte sequences)
    var objRe = /(\d+)\s+0\s+obj\b/g;
    var objects = [];
    var streamRegions = []; // [start, end) of stream DATA regions
    var m;
    while ((m = objRe.exec(text)) !== null) {
      var num = parseInt(m[1], 10);
      var start = m.index;
      var inside = false;
      for (var r = 0; r < streamRegions.length; r++) {
        if (start >= streamRegions[r][0] && start < streamRegions[r][1]) { inside = true; break; }
      }
      if (inside) continue;
      var endIdx = text.indexOf('endobj', m.index + m[0].length);
      if (endIdx === -1) continue;
      var body = text.slice(start, endIdx + 6);
      var sm2 = /stream\r?\n([\s\S]*?)endstream/.exec(body);
      if (sm2) {
        var dataStart = start + sm2.index + sm2[0].indexOf('\n') + 1;
        var dataEnd = start + sm2.index + sm2[0].length - 'endstream'.length;
        streamRegions.push([dataStart, dataEnd]);
      }
      objects.push({ num: num, start: start, end: endIdx + 6 });
    }

    // build output
    var out = new Uint8Array(src.length * 2 + 8192);
    var outPos = 0;
    var xref = [];

    function writeBytes(b) {
      out.set(b, outPos);
      outPos += b.length;
    }
    function writeStr(s) {
      writeBytes(latin1Encode(s));
    }

    writeStr(header);

    for (var oi = 0; oi < objects.length; oi++) {
      var obj = objects[oi];
      xref.push({ num: obj.num, offset: outPos });
      var body = text.slice(obj.start, obj.end);
      var streamMatch = /stream\r?\n([\s\S]*?)endstream/.exec(body);
      var headerPart = body, streamData = null, tail = '';
      if (streamMatch) {
        headerPart = body.slice(0, streamMatch.index);
        streamData = streamMatch[1];
        tail = body.slice(streamMatch.index + streamMatch[0].length);
      }
      var encHeader = encryptStrings(headerPart, objKey(obj.num));
      writeStr(encHeader);
      if (streamData !== null) {
        var raw = latin1Encode(streamData);
        var enc = rc4(objKey(obj.num), raw);
        var lenRe = /\/Length\s+\d+/;
        if (lenRe.test(encHeader)) {
          var patched = encHeader.replace(lenRe, '/Length ' + enc.length);
          outPos -= encHeader.length;
          writeStr(patched);
        }
        writeStr('stream\n');
        writeBytes(enc);
        writeStr('\nendstream');
        writeStr(tail);
      }
    }

    // /Encrypt object
    var encObjNum = 99999998;
    xref.push({ num: encObjNum, offset: outPos });
    writeStr(encObjNum + ' 0 obj\n<< /Filter /Standard /V 1 /R 2 /O <' + hex(O) + '> /U <' + hex(U) + '> /P ' + P + ' /Length 40 >>\nendobj\n');

    // xref table (two subsections: original objects + /Encrypt object)
    var xrefOffset = outPos;
    var sorted = xref.sort(function (a, b) { return a.num - b.num; });
    var normal = sorted.filter(function (e) { return e.num < 10000000; });
    var encEntry = null;
    for (var si = 0; si < sorted.length; si++) if (sorted[si].num >= 10000000) encEntry = sorted[si];
    var xrefStr = 'xref\n0 ' + (normal.length + 1) + '\n0000000000 65535 f \n';
    for (var xi = 0; xi < normal.length; xi++) {
      xrefStr += String(normal[xi].offset).padStart(10, '0') + ' 00000 n \n';
    }
    if (encEntry) {
      xrefStr += encEntry.num + ' 1\n' + String(encEntry.offset).padStart(10, '0') + ' 00000 n \n';
    }
    writeStr(xrefStr);

    // trailer + startxref
    // Handle BOTH classic trailer ("trailer <<...>>") and xref-stream
    // style (pdf-lib save() output: no "trailer" keyword; /Root /Size live
    // in the /Type /XRef object's dict). We always append our own classic
    // xref table + trailer at the end — readers follow the LAST startxref,
    // so the original xref stream (now encrypted, stale offsets) is ignored.
    var trailerDict = null;
    var trailerIdx = text.lastIndexOf('trailer');
    if (trailerIdx !== -1) {
      var trailerBody = text.slice(trailerIdx + 'trailer'.length);
      var dictStart = trailerBody.indexOf('<<');
      var dictEnd = trailerBody.indexOf('>>');
      trailerDict = trailerBody.slice(dictStart, dictEnd + 2);
    } else {
      // xref-stream style: pull /Size /Root /Info out of the XRef object dict
      var xrefObjRe = /(\d+)\s+0\s+obj\b([\s\S]*?)\/Type\s*\/XRef/;
      var xm = xrefObjRe.exec(text);
      var sizeM = null, rootM = null, infoM = null;
      if (xm) {
        sizeM = /\/Size\s+(\d+)/.exec(xm[2]);
        rootM = /\/Root\s+(\d+)\s+(\d+)\s+R/.exec(xm[2]);
        infoM = /\/Info\s+(\d+)\s+(\d+)\s+R/.exec(xm[2]);
      }
      trailerDict = '<< /Size ' + (sizeM ? sizeM[1] : (normal.length + 1)) +
        ' /Root ' + (rootM ? rootM[1] + ' ' + rootM[2] + ' R' : '1 0 R') +
        (infoM ? ' /Info ' + infoM[1] + ' ' + infoM[2] + ' R' : '') + ' >>';
    }
    trailerDict = trailerDict.replace(/\/ID\s*\[[^\]]*\]/, '');
    trailerDict = trailerDict.slice(0, trailerDict.length - 2) + ' /Encrypt ' + encObjNum + ' 0 R /ID [<' + idHex + '> <' + idHex + '>] >>';
    writeStr('trailer\n' + trailerDict + '\nstartxref\n' + xrefOffset + '\n%%EOF');

    return out.slice(0, outPos);
  }

  global.PDFEncrypt = { encryptPdf: encryptPdf };
})(typeof window !== 'undefined' ? window : globalThis);
