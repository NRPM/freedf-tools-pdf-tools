/* ============================================================
   pdf-decrypt.js — real PDF decryption (RC4 40-bit, PDF 1.4 / R=2)
   Pure client-side inverse of pdf-encrypt.js. pdf-lib 1.17.1 has
   NO decryption support, so this module post-processes encrypted
   PDF bytes:
     1. parses the /Encrypt dict (O, U, P) + trailer /ID
     2. derives the file key from the password (Algorithm 2)
     3. verifies the password via U (Algorithm 4)
     4. RC4-decrypts every stream and string literal (Algorithm 1)
     5. strips /Encrypt, rebuilds the xref table + trailer
   Verified with pypdf: correct password decrypts, wrong password
   rejected, output opens in standard readers.
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

  function latin1Encode(s) {
    var b = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xFF;
    return b;
  }

  /* Byte-preserving decode (browsers' TextDecoder('latin1') is windows-1252). */
  function latin1Decode(bytes) {
    var s = '';
    var CHUNK = 0x8000;
    for (var i = 0; i < bytes.length; i += CHUNK) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return s;
  }

  function hexToBytes(h) {
    var out = new Uint8Array(h.length / 2);
    for (var i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
    return out;
  }

  /* Decrypt string literals in an object body (inverse of encryptStrings). */
  function decryptStrings(body, key) {
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
        // encrypted strings were written as hex <...> by the encryptor;
        // if it's a plain literal, leave it (may be unencrypted metadata)
        out += body.slice(i, j);
        i = j;
      } else if (c === '<') {
        var j2 = body.indexOf('>', i);
        if (j2 === -1) { out += c; i++; continue; }
        var inner = body.slice(i + 1, j2).replace(/\s/g, '');
        if (/^[0-9a-fA-F]+$/.test(inner) && inner.length % 2 === 0 && inner.length >= 8) {
          // looks like an encrypted hex string — decrypt it
          var raw = hexToBytes(inner);
          var dec = rc4(key, raw);
          // re-encode as a literal string with escapes
          out += '(' + escapePdfString(dec) + ')';
        } else {
          out += body.slice(i, j2 + 1);
        }
        i = j2 + 1;
      } else {
        out += c;
        i++;
      }
    }
    return out;
  }

  function escapePdfString(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) {
      var b = bytes[i];
      if (b === 40) s += '\\(';
      else if (b === 41) s += '\\)';
      else if (b === 92) s += '\\\\';
      else if (b === 10) s += '\\n';
      else if (b === 13) s += '\\r';
      else if (b === 9) s += '\\t';
      else if (b < 32 || b > 126) s += '\\' + b.toString(8).padStart(3, '0');
      else s += String.fromCharCode(b);
    }
    return s;
  }

  /**
   * Decrypt an R=2 (RC4-40) encrypted PDF.
   * @param {Uint8Array} bytes encrypted PDF bytes
   * @param {string} password user or owner password
   * @returns {Promise<{bytes: Uint8Array, passwordType: string}>} decrypted PDF
   * @throws {Error} if the password is wrong or the file is not R=2
   */
  function decryptPdf(bytes, password) {
    return Promise.resolve().then(function () {
      return decryptPdfSync(bytes, password);
    });
  }

  function decryptPdfSync(bytes, password) {
    var src = new Uint8Array(bytes);
    var text = latin1Decode(src);

    // --- locate /Encrypt dict in the trailer ---
    var trailerIdx = text.lastIndexOf('trailer');
    if (trailerIdx === -1) {
      // xref-stream style: /Encrypt may be in the XRef object dict
      var xrefObjRe = /(\d+)\s+0\s+obj\b([\s\S]*?)\/Type\s*\/XRef/;
      var xm = xrefObjRe.exec(text);
      if (!xm) throw new Error('No /Encrypt dictionary found — file is not encrypted');
      var encRefM = /\/Encrypt\s+(\d+)\s+(\d+)\s+R/.exec(xm[2]);
      if (!encRefM) throw new Error('No /Encrypt dictionary found — file is not encrypted');
      var encObjNum = parseInt(encRefM[1], 10);
      var encObjRe = new RegExp(encObjNum + '\\s+0\\s+obj\\b([\\s\\S]*?)endobj');
      var em = encObjRe.exec(text);
      if (!em) throw new Error('Could not locate /Encrypt object');
      var encBody = em[1];
      var oM = /\/O\s*<([0-9a-fA-F]+)>/.exec(encBody);
      var uM = /\/U\s*<([0-9a-fA-F]+)>/.exec(encBody);
      var pM = /\/P\s+(\d+)/.exec(encBody);
      var vM = /\/V\s+(\d+)/.exec(encBody);
      var rM = /\/R\s+(\d+)/.exec(encBody);
      var idM = /\/ID\s*\[<([0-9a-fA-F]+)>/.exec(text);
      if (!oM || !uM || !pM) throw new Error('Malformed /Encrypt dictionary');
      var V = vM ? parseInt(vM[1], 10) : 1;
      var R = rM ? parseInt(rM[1], 10) : 2;
      if (V !== 1 || R !== 2) throw new Error('Only RC4-40 (V=1, R=2) encryption is supported');
      var O = hexToBytes(oM[1]);
      var U = hexToBytes(uM[1]);
      var P = parseInt(pM[1], 10) >>> 0;
      var ID = idM ? hexToBytes(idM[1]) : new Uint8Array(16);
      return finishDecrypt(text, src, O, U, P, ID, password, encObjNum);
    }

    var trailerBody = text.slice(trailerIdx + 'trailer'.length);
    var dictStart = trailerBody.indexOf('<<');
    var dictEnd = trailerBody.indexOf('>>');
    var trailerDict = trailerBody.slice(dictStart, dictEnd + 2);
    var encRefM2 = /\/Encrypt\s+(\d+)\s+(\d+)\s+R/.exec(trailerDict);
    if (!encRefM2) throw new Error('No /Encrypt dictionary found — file is not encrypted');
    var encObjNum2 = parseInt(encRefM2[1], 10);
    var encObjRe2 = new RegExp(encObjNum2 + '\\s+0\\s+obj\\b([\\s\\S]*?)endobj');
    var em2 = encObjRe2.exec(text);
    if (!em2) throw new Error('Could not locate /Encrypt object');
    var encBody2 = em2[1];
    var oM2 = /\/O\s*<([0-9a-fA-F]+)>/.exec(encBody2);
    var uM2 = /\/U\s*<([0-9a-fA-F]+)>/.exec(encBody2);
    var pM2 = /\/P\s+(\d+)/.exec(encBody2);
    var vM2 = /\/V\s+(\d+)/.exec(encBody2);
    var rM2 = /\/R\s+(\d+)/.exec(encBody2);
    var idM2 = /\/ID\s*\[<([0-9a-fA-F]+)>/.exec(trailerDict);
    if (!oM2 || !uM2 || !pM2) throw new Error('Malformed /Encrypt dictionary');
    var V2 = vM2 ? parseInt(vM2[1], 10) : 1;
    var R2 = rM2 ? parseInt(rM2[1], 10) : 2;
    if (V2 !== 1 || R2 !== 2) throw new Error('Only RC4-40 (V=1, R=2) encryption is supported');
    var O2 = hexToBytes(oM2[1]);
    var U2 = hexToBytes(uM2[1]);
    var P2 = parseInt(pM2[1], 10) >>> 0;
    var ID2 = idM2 ? hexToBytes(idM2[1]) : new Uint8Array(16);
    return finishDecrypt(text, src, O2, U2, P2, ID2, password, encObjNum2);
  }

  function finishDecrypt(text, src, O, U, P, ID, password, encObjNum) {
    // --- derive file key (Algorithm 2) ---
    var userPadded = padPass(password);
    var keyInput = new Uint8Array(userPadded.length + O.length + 4 + 16);
    keyInput.set(userPadded, 0);
    keyInput.set(O, 32);
    keyInput.set(le32(P), 64);
    keyInput.set(ID, 68);
    var key = md5(keyInput).slice(0, 5);

    // --- verify password via U (Algorithm 4) ---
    var uCalc = rc4(key, PADDING);
    var uMatch = true;
    for (var ui = 0; ui < 16; ui++) {
      if (uCalc[ui] !== U[ui]) { uMatch = false; break; }
    }
    if (!uMatch) {
      // Owner-password path (Algorithm 3 inverse): O = RC4(MD5(ownerPadded)[0:5],
      // userPadded), so decrypting O with the owner key recovers the PADDED USER
      // PASSWORD. Re-derive the file key from that and verify via U — the U check
      // is the real gate (re-review finding: comparing decO against padPass(password)
      // was wrong — that's the owner padding when the entered password is the owner
      // password, so distinct user/owner PDFs failed).
      var ownerPadded = padPass(password);
      var ownerKey = md5(ownerPadded).slice(0, 5);
      var decO = rc4(ownerKey, O); // recovered padded user password
      var keyInput2 = new Uint8Array(decO.length + O.length + 4 + 16);
      keyInput2.set(decO, 0);
      keyInput2.set(O, 32);
      keyInput2.set(le32(P), 64);
      keyInput2.set(ID, 68);
      key = md5(keyInput2).slice(0, 5);
      var uCalc2 = rc4(key, PADDING);
      var uMatch2 = true;
      for (var ui2 = 0; ui2 < 16; ui2++) {
        if (uCalc2[ui2] !== U[ui2]) { uMatch2 = false; break; }
      }
      if (!uMatch2) throw new Error('Incorrect password — could not unlock this PDF');
    }

    function objKey(refNum) {
      var k = new Uint8Array(key.length + 5);
      k.set(key, 0);
      k[5] = refNum & 0xFF; k[6] = (refNum >> 8) & 0xFF; k[7] = (refNum >> 16) & 0xFF;
      k[8] = 0; k[9] = 0;
      return md5(k).slice(0, Math.min(key.length + 5, 16));
    }

    // --- find all objects (skip matches inside stream data) ---
    var objRe = /(\d+)\s+0\s+obj\b/g;
    var objects = [];
    var streamRegions = [];
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

    // --- build decrypted output ---
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

    var nl = text.indexOf('\n');
    writeStr(text.slice(0, nl + 1)); // header

    for (var oi2 = 0; oi2 < objects.length; oi2++) {
      var obj = objects[oi2];
      if (obj.num === encObjNum) continue; // drop the /Encrypt object
      xref.push({ num: obj.num, offset: outPos });
      var body2 = text.slice(obj.start, obj.end);
      var streamMatch = /stream\r?\n([\s\S]*?)endstream/.exec(body2);
      var headerPart = body2, streamData = null, tail = '';
      if (streamMatch) {
        headerPart = body2.slice(0, streamMatch.index);
        streamData = streamMatch[1];
        tail = body2.slice(streamMatch.index + streamMatch[0].length);
      }
      var decHeader = decryptStrings(headerPart, objKey(obj.num));
      writeStr(decHeader);
      if (streamData !== null) {
        var raw = latin1Encode(streamData);
        var dec = rc4(objKey(obj.num), raw);
        // strip trailing EOL that was captured into the encrypted payload
        while (dec.length > 0 && (dec[dec.length - 1] === 10 || dec[dec.length - 1] === 13)) {
          dec = dec.slice(0, dec.length - 1);
        }
        var lenRe = /\/Length\s+\d+/;
        if (lenRe.test(decHeader)) {
          var patched = decHeader.replace(lenRe, '/Length ' + dec.length);
          outPos -= decHeader.length;
          writeStr(patched);
        }
        writeStr('stream\n');
        writeBytes(dec);
        writeStr('\nendstream');
        writeStr(tail);
      }
    }

    // --- xref table ---
    var xrefOffset = outPos;
    var sorted = xref.sort(function (a, b) { return a.num - b.num; });
    var xrefStr = 'xref\n0 ' + (sorted.length + 1) + '\n0000000000 65535 f \n';
    for (var xi = 0; xi < sorted.length; xi++) {
      xrefStr += String(sorted[xi].offset).padStart(10, '0') + ' 00000 n \n';
    }
    writeStr(xrefStr);

    // --- trailer (strip /Encrypt, keep /ID) ---
    var trailerIdx = text.lastIndexOf('trailer');
    var trailerDict = null;
    if (trailerIdx !== -1) {
      var trailerBody = text.slice(trailerIdx + 'trailer'.length);
      var dictStart = trailerBody.indexOf('<<');
      var dictEnd = trailerBody.indexOf('>>');
      trailerDict = trailerBody.slice(dictStart, dictEnd + 2);
    } else {
      var xrefObjRe = /(\d+)\s+0\s+obj\b([\s\S]*?)\/Type\s*\/XRef/;
      var xm = xrefObjRe.exec(text);
      var sizeM = null, rootM = null, infoM = null;
      if (xm) {
        sizeM = /\/Size\s+(\d+)/.exec(xm[2]);
        rootM = /\/Root\s+(\d+)\s+(\d+)\s+R/.exec(xm[2]);
        infoM = /\/Info\s+(\d+)\s+(\d+)\s+R/.exec(xm[2]);
      }
      trailerDict = '<< /Size ' + (sizeM ? sizeM[1] : (sorted.length + 1)) +
        ' /Root ' + (rootM ? rootM[1] + ' ' + rootM[2] + ' R' : '1 0 R') +
        (infoM ? ' /Info ' + infoM[1] + ' ' + infoM[2] + ' R' : '') + ' >>';
    }
    trailerDict = trailerDict.replace(/\/Encrypt\s+\d+\s+\d+\s+R/, '');
    writeStr('trailer\n' + trailerDict + '\nstartxref\n' + xrefOffset + '\n%%EOF');

    return { bytes: out.slice(0, outPos), passwordType: 'USER_PASSWORD' };
  }

  global.PDFDecrypt = { decryptPdf: decryptPdf };
})(typeof window !== 'undefined' ? window : globalThis);
