/*
Linny-R is an executable graphical specification language for (mixed integer)
linear programming (MILP) problems, especially unit commitment problems (UCP).
The Linny-R language and tool have been developed by Pieter Bots at Delft
University of Technology, starting in 2009. The project to develop a browser-
based version started in 2017. See https://linny-r.org for more information.

This JavaScript file (linny-r-utils.js) defines a variety of "helper" functions
that are used in other Linny-R modules.
*/
/*
Copyright (c) 2017-2022 Delft University of Technology

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

//
// Functions that facilitate HTTP requests
//

function postData(obj) {
  // Converts a JavaScript object to an object that can be passed to a server
  // in a POST request
  const fields = [];
  for(let k in obj) if(obj.hasOwnProperty(k)) {
    fields.push(encodeURIComponent(k) + "=" + encodeURIComponent(obj[k]));
  }
  return {
      method: 'post',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      mode: 'no-cors',
      body: fields.join('&')
    };
}

//
// Functions that convert numbers to strings, or strings to numbers
//

function pluralS(n, s, special='') {
  // Returns string with noun `s` in singular only if `n` = 1
  // NOTE: third parameter can be used for nouns with irregular plural form
  return (n === 0 ? 'No ' : n + ' ') +
      // NOTE: to accomodate for plural form of ex-ante unknown entity types,
      // nouns ending on "s" (specifically "process") form a special case 
      (n === 1 ? s : (special ? special : s + (s.endsWith('s') ? 'es' : 's')));
}

function safeStrToFloat(str, val=0) {
  // Returns numeric value of floating point string, interpreting both
  // dot and comma as decimal point
  // NOTE: returns default value val if str is empty, null or undefined
  const f = (str ? parseFloat(str.replace(',', '.')) : val);
  return (isNaN(f) ? val : f);
}

function safeStrToInt(str, val=0) {
  // Returns numeric value of integer string, IGNORING decimals after
  // point or comma.
  // NOTE: returns default value `val` if `str` is empty, null or undefined
  const n = (str ? parseInt(str) : val);
  return (isNaN(n) ? val : n);
}

function rangeToList(str, max=0) {
  // Parses ranges "n-m/i" into a list of integers
  // Returns FALSE if range is not valid according to the convention below
  // The part "/i" is optional and denotes the increment; by default, i = 1.
  // The returned list will contain all integers starting at n and up to
  // at most (!) m, with increments of i, so [n, n+i, n+2i, ...]
  // If `str` contains only the "/i" part, the range is assumed to start at 0
  // and end at `max`; if only one number precedes the "/i", this denotes the
  // first number in the range, while `max` again defines the highest number
  // that can be included
  const
      list = [],
      ssep = str.split('/');
  if(ssep.length > 2) return false;
  let incr = (ssep.length === 2 ? parseInt(ssep[1]) : 1);
  if(isNaN(incr)) return false;
  let range = ssep[0].trim(),
      first = 0,
      last = max;
  if(range.length > 0) {
    range = range.split('-');
    if(range.length > 2) return false;
    first = parseInt(range[0]);
    if(range.length === 2) last = parseInt(range[1]);
    if(isNaN(first) || isNaN(last)) return false;
  }
  // Create the range number list
  for(let i = first; i <= last; i += incr) list.push(i);
  return list;
}

function dateToString(d) {
  // Returns date-time `d` in UTC format, accounting for time zone
  const offset = d.getTimezoneOffset();
  d = new Date(d.getTime() - offset*60000);
  return d.toISOString().split('T')[0];
}

function msecToTime(msec) {
  // Returns milliseconds as "minimal" string hh:mm:ss.msec
  const ts = new Date(msec).toISOString().slice(11, -1).split('.');
  let hms = ts[0], ms = ts[1];
  // Trim zero hours and minutes
  while(hms.startsWith('00:')) hms = hms.substr(3);
  // Trim leading zero on first number
  if(hms.startsWith('00')) hms = hms.substr(1);
  // Trim msec when minutes > 0
  if(hms.indexOf(':') > 0) return hms;
  // If < 1 second, return as milliseconds
  if(parseInt(hms) === 0) return parseInt(ms) + ' msec';
  // Otherwise, return seconds with one decimal
  return hms + '.' + ms.slice(0, 1) + ' sec';
}

function uniformDecimals(data) {
  // Formats the numbers in the array `data` so that they have uniform decimals
  // NOTE: (1) this routine assumes that all number strings have sig4Dig format;
  //       (2) it changes the values of the `data` array elements to strings
  // STEP 1: Scan the data array to get the longest integer part, the shortest
  // fraction part, and longest exponent part
  let ss, x, maxi = 0, maxf = 0, maxe = 0;
  for(let i = 0; i < data.length; i++) {
    const v = data[i].toString();
    ss = v.split('e');
    if(ss.length > 1) {
      maxe = Math.max(maxe, ss[1].length);
    }
    ss = ss[0].split('.');
    if(ss.length > 1) {
      maxf = Math.max(maxf, ss[1].length);
    }
    maxi = Math.max(maxi, ss[0].length);
  }
  // STEP 2: Convert the data to a uniform format
  for(let i = 0; i < data.length; i++) {
    const f = parseFloat(data[i]);
    if(isNaN(f)) {
      data[i] = '\u26A0'; // Unicode warning sign
    } else if(maxe > 0) {
    // Convert ALL numbers to exponential notation with one decimal (1.3e7)
      const v = f.toExponential(1);
      ss = v.split('e');
      x = ss[1];
      if(x.length < maxe) {
        x = x[0] + '0' + x.substr(1);
      }
      data[i] = ss[0] + 'e' + x;
    } else if(maxi > 3) {
      // Round to integer if longest integer part has 4 or more digits
      data[i] = Math.round(f).toString();
    } else {
      // Round fractions to `maxf` digits (but at most 4)
      data[i] = f.toFixed(Math.min(4 - maxi, maxf));
    }
  }
}

function ellipsedText(text, n=50, m=10) {
  // Returns `text` with ellipsis " ... " between its first `n` and last `m`
  // characters 
  if(text.length <= n + m + 3) return text;
  return text.slice(0, n) + ' \u2026 ' + text.slice(text.length - m);
}

//
// Functions used when comparing two Linny-R models
//

function differences(a, b, props) {
  // Compares values of properties (in list `props`) of entities `a` and `b`,
  // and returns a "dictionary" object with differences
  const d = {};
  // Only compare entities of the same type
  if(a.type === b.type) {
    for(let i = 0; i < props.length; i++) {
      const p = props[i];
      // NOTE: model entity properties can be expressions => compare their text 
      if(a[p] instanceof Expression) {
        if(a[p].text !== b[p].text) d[p] = {A: a[p].text, B: b[p].text};
      } else if(a[p] instanceof Date) {
        if(Math.abs(a[p].getTime() - b[p].getTime()) > 1000) {
          d[p] = {A: dateToString(a[p]), B: dateToString(b[p])};
        }
      } else if(a[p] !== b[p]) {
        d[p] = {A: a[p], B: b[p]};
      }
    }
  }
  // NOTE: `d` may still be an empty object {}
  return d;
}

function markFirstDifference(s1, s2) {
  // Returns `s1` with bold-faced from point of first difference with `s2`
  // up to position where `s1` and `s2` have the same tail
  // NOTE: ensure that both parameters are strings
  s1 = '' + s1;
  s2 = '' + s2;
  const l = Math.min(s1.length, s2.length);
  let i = 0;
  while(i < l && s1.charAt(i) === s2.charAt(i)) i++;
  if(i >= s1.length) {
    // No differences, but tail may have been cut
    if(i < s2.length) s1 += '<span class="mc-hilite">&hellip;</span>';
    return s1;
  }
  let j1 = s1.length - 1,
      j2 = s2.length - 1;
  while(j1 > 0 && j2 > 0 && s1.charAt(j1) === s2.charAt(j2)) {
    j1--;
    j2--;
  }
  return s1.substring(0, i) + '<span class="mc-hilite">' +
      s1.substring(i, j1 + 1) + '</span>' + s1.substring(j1 + 1);
}

//
// Functions that perform string search, comparison and/or substitution
//

function endsWithDigits(str) {
  // Returns trailing digts of `str` (empty string will evaluate as FALSE)
  let i = str.length - 1,
      c = str[i],
      d = '';
  while(i >= 0 && '0123456789'.indexOf(c) >= 0) {
    d = c + d;
    i--;
    c = str[i];
  }
  return d;
}

function indexOfMatchingBracket(str, offset) {
  // Returns index of closing bracket, ignoring matched [...] inside
  // NOTE: starts at offset + 1, assuming that character at offset = '['
  let ob = 0, c;
  for(let i = offset + 1; i < str.length; i++) {
    c = str.charAt(i);
    if(c === '[') {
      ob++;
    } else if (c === ']') {
      if(ob > 0) {
        ob--;
      } else {
        return i;
      }
    }
  }
  // No matching bracket => return -1
  return -1;
}

function patternList(str) {
  // Returns the &|^-pattern defined by `str`
  // Pattern operators: & (and), ^ (not) and | (or) in sequence, e.g.,
  // this&that^not this|just this|^just not that
  const
      pat = str.split('|'),
      or_list = [];
  for(let i = 0; i < pat.length; i++) {
    const
        pm = ({plus:[], min: []}),
        term = pat[i].split('&');
    for(let j = 0; j < term.length; j++) {
      const subterm = term[j].split('^');
      for(let k = 0; k < subterm.length; k++) {
        const s = subterm[k];
        if(s) {
          // NOTE: first subterm is a MUST!
          if(k == 0) {
            pm.plus.push(s);
          } else {
            pm.min.push(s);
          }
        }
      }
    }
    if(pm.plus.length + pm.min.length > 0) {
      or_list.push(pm);
    }
  }
  return or_list;
}

function patternMatch(str, patterns) {
  // Returns TRUE when `str` matches the &|^-pattern
  for(let i = 0; i < patterns.length; i++) {
    const p = patterns[i];
    let match = true;
    for(let j = 0; j < p.plus.length; j++) {
      match = match && str.indexOf(p.plus[j]) >= 0;
    }
    for(let j = 0; j < p.min.length; j++) {
      match = match && str.indexOf(p.min[j]) < 0;
    }
    if(match) {
      return true;
    }
  }
  return false;
}

function escapeRegex(str) {
  // Returns `str` with its RegEx special characters escaped
  return str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

//
// Functions that perform set-like operations on lists of string
//

function addDistinct(e, list) {
  // Adds element `e` to `list` only if it does not already occur in `list`
  if(list.indexOf(e) < 0) list.push(e);
}

function setString(sl) {
  // Returns elements of stringlist `sl` in set notation
  return '{' + sl.join(', ') + '}';
}

function tupelString(sl) {
  // Returns elements of stringlist `sl` in tupel notation
  return '(' + sl.join(', ') + ')';
}

function tupelSetString(ssl) {
  // Returns string of stringlists `sll` as set of tuples
  const tl = [];
  for(let i = 0; i < ssl.length; i++) {
    tl.push(tupelString(ssl[i]));
  }
  return setString(tl);
}

function tupelIndex(sl, ssl) {
  // Returns index of stringlist `sl` if it exists in `ssl`, otherwise -1
  for(let i = 0; i < ssl.length; i++) {
    let n = 0;
    for(let j = 0; j < sl.length; j++) {
      if(ssl[i].indexOf(sl[j]) < 0) break;
      n++;
    }
    if(n == sl.length) return i;
  }
  return -1;
}

function intersection(sl1, sl2) {
  // Returns the list of common elements of stringlists `l1` and `l2`
  const shared = [];
  for(let i = 0; i < sl1.length; i++) {
    if(sl2.indexOf(sl1[i]) >= 0) shared.push(sl1[i]);
  }
  return shared;
}
  
function complement(sl1, sl2) {
  // Returns the list of elements of stringlist `l1` that are NOT in `l2`
  const cmplmnt = [];
  for(let i = 0; i < sl1.length; i++) {
    if(sl2.indexOf(sl1[i]) < 0) cmplmnt.push(sl1[i]);
  }
  return cmplmnt;
}

//
// Functions that support loading and saving data and models
//

function xmlEncoded(str) {
  // Replaces &, <, >, ' and " by their HTML entity code
  return str.replace(/\&/g, '&amp;').replace(/</g, '&lt;'
    ).replace(/>/g, '&gt;').replace(/\'/g, '&apos;'
    ).replace(/\"/g, '&quot;');
}

function xmlDecoded(str) {
  // Replaces HTML entity code for &, <, >, ' and " by the original character
  // NOTE: also replaces Linny-R legacy newline encoding $$\n by two newline
  // characters
  return str.replace(/\&lt;/g, '<').replace(/\&gt;/g, '>'
    ).replace(/\&apos;/g, '\'').replace(/\&quot;/g, '"'
    ).replace(/\&amp;/g, '&').replace(/\$\$\\n/g, '\n\n');
}

function cleanXML(node) {
  // Removes all unnamed text nodes and comment nodes from the XML
  // subtree under node
  const cn = node.childNodes;
  if(cn) {
    for(let i = cn.length - 1; i >= 0; i--) {
      let n = cn[i];
      if(n.nodeType === 3 && !/\S/.test(n.nodeValue) || n.nodeType === 8) {
        node.removeChild(n);
      } else if(n.nodeType === 1) {
        cleanXML(n);
      }
    }
  }
}

function parseXML(xml) {
  // Parses string `xml` into an XML document, and returns its root node
  // (or null if errors)
  xml = XML_PARSER.parseFromString(xml, 'application/xml');
  const
      de = xml.documentElement,
      pe = de.getElementsByTagName('parsererror').item(0);
  if(pe) throw de.nodeValue;
  cleanXML(de);
  return de;
}

function childNodeByTag(node, tag) {
  // Returns the XML child node of `node` having node name `tag`, or NULL if
  // no such child node exists
  let cn = null;
  for (let i = 0; i < node.children.length; i++) {
    if(node.children[i].tagName === tag) {
      cn = node.children[i];
      break;
    }
  }
  return cn;
}

function nodeContentByTag(node, tag) {
  // Returns the text content of the child node of `node` having name `tag`,
  // or the empty string if no such node exists
  return nodeContent(childNodeByTag(node, tag));
}

function nodeContent(node) {
  // Returns the text content of XML element `node`
  if(node) {
    // For text nodes, return their value
    if(node.nodeType === 3) return node.nodeValue;
    // For empty nodes, return empty string
    if(node.childNodes.length === 0) return '';
    // If first child is text, return its value
    const fcn = node.childNodes.item(0);
    if(fcn && fcn.nodeType === 3) return fcn.nodeValue;
    console.log('UNEXPECTED XML', fcn.nodeType, node);
  }
  return '';
}

function nodeParameterValue(node, param) {
  // Returns the value of parameter `param` as string if `node` has
  // this parameter, otherwise the empty string
  const a = node.getAttribute(param);
  return a || '';
}

//
// Functions that support naming and identifying Linny-R entities
//

function letterCode(n) {
  // Encodes a non-negative integer as base-26 (0 = A, 25 = Z, 26 = AA, etc.)
  const r = n % 26, d = (n - r) / 26, c = String.fromCharCode(65 + r);
  // NOTE: recursion!
  if(d) return letterCode(d) + c;
  return c;
}

function parseLetterCode(lc) {
  // Decodes a base-26 code into an integer. NOTE: does not check whether
  // the code is indeed base-26
  let n = 0;
  for(let i = 0; i < lc.length; i++) {
    n = 10*n + (lc.charCodeAt(i) - 65);
  }
  return n;
}

function randomID() {
  // Generates a 22+ hex digit ID: timestamp plus 12 random bits as suffix
  // plus 8 more random hex digits (earlier shorter version caused doubles!)
  const d = ((new Date()).getTime() + Math.random()) * 4096,
        e = Math.floor(Math.random() * 4294967296);
  return (Math.floor(d)).toString(16) + e.toString(16);
}

function escapedSingleQuotes(s) {
  // Returns string `s` with "escaped" single quotes
  return s.replace('\'', '\\\'');
}

function nameToLines(name, actor_name = '') {
  // Returns the name of a Linny-R entity as a string-with-line-breaks that
  // fits nicely in an oblong box. For efficiency reasons, a fixed width/height
  // ratio is assumed, as this produces quite acceptable results
  let m = actor_name.length;
  const
      d = Math.floor(Math.sqrt(0.3 * name.length)),
      // Do not wrap strings shorter than 13 characters (about 50 pixels)
      limit = Math.max(Math.ceil(name.length / d), m, 13),
      a = name.split(' ');
  // Split words at '-' when wider than limit
  for(let j = 0; j < a.length; j++) {
    if(a[j].length > limit) {
      const sw = a[j].split('-');
      if(sw.length > 1) {
        // Replace j-th word by last fragment of split string
        a[j] = sw.pop();
        // Insert remaining fragments before
        while(sw.length > 0) a.splice(j, 0, sw.pop() + '-');
      }
    }
  }
  const ww = [];
  for(let i = 0; i < a.length; i++) {
    ww[i] = a[i].length;
    m = Math.max(m, ww[i]);
  }
  const lines = [a[0]];
  let n = 0,
      l = ww[n],
      space;
  for(let i = 1; i < a.length; i++) {
    if(l + ww[i] < limit) {
      space = (lines[n].endsWith('-') ? '' : ' ');
      lines[n] += space + a[i];
      l += ww[i] + space.length;
    } else {
      n++;
      lines[n] = a[i];
      l = ww[i];
    }
  }
  return lines.join('\n');
}

//
// Encryption-related functions
//

function hexToBytes(hex) {
  // Converts a hex string to a Uint8Array
  const bytes = [];
  for(let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substr(i, 2), 16));
  }
  return new Uint8Array(bytes);
}

function bytesToHex(bytes) {
  // Converts a byte array to a hex string
  return Array.from(bytes,
      function(byte) { return ('0' + (byte & 0xFF).toString(16)).slice(-2); }
    ).join('');
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const
      bytes = new Uint8Array(buffer),
      l = bytes.byteLength;
  for(let i = 0; i < l; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToArrayBuffer(base64) {
  let binary = window.atob(base64);
  const
      l = binary.length,
      bytes = new Uint8Array(l);
  for(let i = 0; i < l; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function encryptionKey(password) {
  let material = await window.crypto.subtle.importKey(
      'raw', new TextEncoder().encode(password), 'PBKDF2', false,
      ['deriveBits', 'deriveKey']);
  let key = await window.crypto.subtle.deriveKey(
      {name: 'PBKDF2', salt: new TextEncoder().encode(ENCRYPTION.salt),
       iterations: ENCRYPTION.iterations, hash: 'SHA-256'}, material,
          {name: 'AES-GCM', length: 256}, true, ['encrypt', 'decrypt']);
  return key;
}

async function encryptMessage(msg, key) {
  let encoded = new TextEncoder().encode(msg),
      iv = window.crypto.getRandomValues(new Uint8Array(12)),
      ciphertext = await window.crypto.subtle.encrypt(
          {name: 'AES-GCM', iv: iv}, key, encoded);
  return {encryption: arrayBufferToBase64(ciphertext), latch: bytesToHex(iv)};
}

async function decryptMessage(msg, key) {
  const
      latch = hexToBytes(msg.latch),
      buffer = base64ToArrayBuffer(msg.encryption);
  let decrypted = await window.crypto.subtle.decrypt(
          {name: 'AES-GCM', iv: latch}, key, buffer);
  return new TextDecoder().decode(decrypted);
}

async function tryToDecrypt(msg, password, on_ok, on_error) {
  // Attempts decryption with the entered password, and performs the
  // post-decryption action on the decrypted data if successful
  let data = null;
  try {
    const key = await encryptionKey(password);
    data = await decryptMessage(msg, key);
    on_ok(data);
  } catch(err) {
    on_error(err);
  }
}

///////////////////////////////////////////////////////////////////////
// Define exports so that this file can also be included as a module //
///////////////////////////////////////////////////////////////////////

if(NODE) module.exports = {
  postData: postData,
  pluralS: pluralS,
  safeStrToFloat: safeStrToFloat,
  safeStrToInt: safeStrToInt,
  dateToString: dateToString,
  msecToTime: msecToTime,
  uniformDecimals: uniformDecimals,
  ellipsedText: ellipsedText,
  differences: differences,
  markFirstDifference: markFirstDifference,
  endsWithDigits: endsWithDigits,
  indexOfMatchingBracket: indexOfMatchingBracket,
  patternList: patternList,
  patternMatch: patternMatch,
  escapeRegex: escapeRegex,
  addDistinct: addDistinct,
  setString: setString,
  tupelString: tupelString,
  tupelSetString: tupelSetString,
  tupelIndex: tupelIndex,
  intersection: intersection,
  complement: complement,
  xmlEncoded: xmlEncoded,
  xmlDecoded: xmlDecoded,
  cleanXML: cleanXML,
  parseXML: parseXML,
  childNodeByTag: childNodeByTag,
  nodeContentByTag: nodeContentByTag,
  nodeContent: nodeContent,
  nodeParameterValue: nodeParameterValue,
  letterCode: letterCode,
  parseLetterCode: parseLetterCode,
  randomID: randomID,
  escapedSingleQuotes: escapedSingleQuotes,
  nameToLines: nameToLines,
  hexToBytes: hexToBytes,
  arrayBufferToBase64: arrayBufferToBase64,
  base64ToArrayBuffer: base64ToArrayBuffer,
  encryptionKey: encryptionKey,
  encryptMessage: encryptMessage,
  decryptMessage: decryptMessage,
  tryToDecrypt: tryToDecrypt  
}