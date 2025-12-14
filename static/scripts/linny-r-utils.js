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
Copyright (c) 2017-2025 Delft University of Technology

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

function isEmpty(obj) {
  // Test to check whether `obj` is like the "empty" object {}.
  for(const prop in obj) {
    if (Object.hasOwn(obj, prop)) return false;
  }
  return true;
}

function noDrag(event) {
  // Function to prevent undesired dragging of elements.
  event.preventDefault();
  return false;
}

//
// Functions that facilitate HTTP requests
//

function postData(obj) {
  // Convert a JavaScript object to an object that can be passed to a server
  // in a POST request.
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

const b62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function posIntToB62(n) {
  // Return the radix-62 encoding of positive integer value `n`.
  let s = '';
  while(n > 0) {
    s = b62.charAt(n % 62) + s;
    n = Math.floor(n / 62);
  }
  return s;
}

function B62ToInt(s) {
  // Return the value of a B62-encoded integer, or -1 if `s` contains an
  // invalid character.
  const digits = s.split('');
  let n = 0;
  for(const d of digits) {
    const index = b62.indexOf(d);
    if(index < 0) return -1;
    n = n * 62 + index;
  }
  return n;
}

function packFloat(f) {
  // Return floating point number `f` in a compact string notation.
  // The first character encodes whether `f` is an integer (then no exponent),
  // whether the sign of `f` is + or -, and whether the sign of the exponent
  // (if any) is + or - in the following manner:
  //      (no leading special character) => positive integer (no exponent)
  //   -  negative integer (no exponent)
  //   ^  positive number, positive exponent
  //   _  negative number, positive exponent
  //   ~  positive number, negative exponent
  //   =  negative number, negative exponent
  // NOTE: 
  if(Math.abs(f) < 1e-10) return '0';
  let sign = '',
      mant = '',
      exp = 0;
  if(f < 0.0) {
    sign = '-';
    f = -f;
  }
  const rf = Math.round(f);
  // When number is integer, it has no exponent part.
  if(rf === f) return sign + posIntToB62(rf);
  const me = f.toExponential().split('e');
  // Remove the decimal period from the mantissa.
  mant = posIntToB62(parseInt(me[0].replace('.', '')));
  // Determine the exponent part and its sign.
  exp = parseInt(me[1]);
  if(exp < 0) {
    exp = -exp;
    sign = (sign ? '=' : '~');
  } else {
    sign = (sign ? '_' : '^');
  }
  // NOTE: Exponent is always codes as a single character. This limits
  // its value to 61, which for Linny-R suffices to code even its error
  // values (highest error code exponent is +50).
  return sign + mant + (exp ? posIntToB62(Math.min(exp, 61)) : '0');
}

function unpackFloat(s) {
  // Return the number X that was encoded using packFloat(X).
  // NOTE: When decoding fails, -1e+48 is returned to signal #INVALID.
  if(s === '0') return 0;
  const
      INVALID = -1e+48,
      ss = s.split('');
  const index = '-^_~='.indexOf(ss[0]);
  if(index < 1) {
    // No exponent => get the absolute integer value.
    const n = B62ToInt(s.substring(index + 1));
    if(n < 0) return INVALID;
    // Return the signed integer value.
    return (index ? n : -n);
  }
  // Now the last character codes the exponent.
  const
      // Odd index (1 and 3) indicates positive number.
      sign = (index % 2 ? '' : '-'),
      // Low index (1 and 2) indicates positive exponent.
      esign = (index < 3 ? 'e+' : 'e-');
  // Remove the sign character.
  ss.shift();
  // Get and remove the exponent character, and decode it.
  let exp = B62ToInt(ss.pop());
  if(exp < 0) return INVALID; 
  exp = esign + exp.toString();
  let mant = B62ToInt(ss.join(''));
  if(mant < 0) return INVALID;
  mant = mant.toString();
  // NOTE: No decimal point if mantissa is a single decimal digit.
  if(mant.length > 1) mant = mant.slice(0, 1) + '.' + mant.slice(1);
  return parseFloat(sign + mant + exp);
}

function packVector(vector) {
  // Vector is coded as semicolon-separated B62-encoded floating
  // point numbers (no precision loss).
  // To represent "sparse" vectors more compactly, sequences of
  // identical values are encoded as N*F where N is the length of
  // the sequence and F the B62-encoded numerical value.
  let prev = false,
      cnt = 0;
  const vl = [];
  for(let v of vector) {
    // Apply the NEAR_ZERO threshold of the Virtual Machine.
    if(Math.abs(v) < 1e-10) v = 0; 
    // While value is same as previous, do not store, but count.
    // NOTE: JavaScript precision is about 15 decimals, so test for
    // equality with this precision.
    if(prev === false || Math.abs(v - prev) < 0.5e-14) {
      cnt++;
    } else {
      const b62 = packFloat(prev);
      if(cnt > 1) {
        // More than one => "compress".
        vl.push(cnt + '*' + b62);
        cnt = 1;
      } else {
        vl.push(b62);
      }
    }
    prev = v;
  }
  if(cnt) {
    const b62 = packFloat(prev);
    // Add the last "batch" of numbers.
    if(cnt > 1) {
      // More than one => "compress".
      vl.push(cnt + '*' + b62);
    } else {
      vl.push(b62);
    }
  }
  return vl.join(';');
}
 
function unpackVector(str, b62=true) {
  // Convert semicolon-separated data to a numeric array.
  // NOTE: Until version 2.1.7, numbers were represented in standard
  // decimal notation with limited precision. From v2.1.7 onwards, numbers
  // are B62-encoded. When `b62` is FALSE, the legacy decoding is used.
  vector = [];
  if(str) {
    const
        ss = str.split(';'),
        multi = (b62 ? '*' : 'x'),
        parse = (b62 ? unpackFloat : parseFloat);
    for(const parts of ss) {
      const tuple = parts.split(multi);
      if(tuple.length === 2) {
        const f = parse(tuple[1]);
        let n = parseInt(tuple[0]);
        while(n > 0) {
          vector.push(f);
          n--;
        }
      } else {
        vector.push(parse(tuple[0]));
      }
    }
  }
  return vector;
}

function pluralS(n, s, special='') {
  // Return string with noun `s` in singular only if `n` = 1.
  // NOTE: Third parameter can be used for nouns with irregular plural form.
  return (n === 0 ? 'No ' : n + ' ') +
      // NOTE: To accomodate for plural form of ex-ante unknown entity types,
      // nouns ending on "s" (specifically "process") form a special case.
      (n === 1 ? s : (special ? special : s + (s.endsWith('s') ? 'es' : 's')));
}

function safeStrToFloat(str, val=0) {
  // Return numeric value of floating point string, interpreting both period
  // and comma as decimal point.
  // NOTE: Return default value `val` if `str` is empty, null or undefined,
  // or contains a character that is invalid in a number.
  if(!str || str.match(/[^0-9eE\.\,\+\-]/)) return val;
  str = str.replace(',', '.');
  const f = (str ? parseFloat(str) : val);
  return (isNaN(f) ? val : f);
}

function safeStrToInt(str, val=0) {
  // Return numeric value of integer string, IGNORING decimals after
  // point or comma.
  // NOTE: Return default value `val` if `str` is empty, null or undefined.
  const n = (str ? parseInt(str) : val);
  return (isNaN(n) ? val : n);
}

function safeToPrecision(n, digits) {
  // Return number `n` as string with specified precision.
  // If `n` is not a number, return whatever it is between double quotes.
  if(typeof n === 'number') return n.toPrecision(digits);
  return `"${n}"`;
}

function rangeToList(str, max=0) {
  // Parse ranges "n-m/i" into a list of integers.
  // Return FALSE if range is not valid according to the convention below:
  // The part "/i" is optional and denotes the increment; by default, i = 1.
  // The returned list will contain all integers starting at n and up to
  // at most (!) m, with increments of i, so [n, n+i, n+2i, ...].
  // If `str` contains only the "/i" part, the range is assumed to start at 0
  // and end at `max`; if only one number precedes the "/i", this denotes the
  // first number in the range, while `max` again defines the highest number
  // that can be included.
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
  // Create the range number list.
  for(let i = first; i <= last; i += incr) list.push(i);
  return list;
}

function listToRange(list) {
  // Return a string that represents the given list of integers as a series
  // of subranges, e.g., [0,1,2,3,5,6,9,11] results in "0-3, 5-6, 9, 11".
  const
      n = list.length,
      subs = [];
  if(!n) return '';
  let i = 0,
      from = list[0],
      to = from;
  while(i < n) {
    i++;
    if(list[i] === to + 1) {
      to++;
    } else {
      if(from === to) {
        subs.push(from);
      } else {
        subs.push(`${from}-${to}`);
      }
      from = list[i];
      to = from;
    }
  }
  return subs.join(', ');
}

function dateToString(d) {
  // Return date-time `d` in UTC format, accounting for time zone.
  const offset = d.getTimezoneOffset();
  d = new Date(d.getTime() - offset * 60000);
  return d.toISOString().split('T')[0];
}

function msecToTime(msec) {
  // Return milliseconds as "minimal" string hh:mm:ss.msec.
  const ts = new Date(msec).toISOString().slice(11, -1).split('.');
  let hms = ts[0], ms = ts[1];
  // Trim zero hours and minutes.
  while(hms.startsWith('00:')) hms = hms.substring(3);
  // Trim leading zero on first number.
  if(hms.startsWith('00')) hms = hms.substring(1);
  // Trim msec when minutes > 0.
  if(hms.indexOf(':') > 0) return hms;
  // If < 1 second, return as milliseconds.
  if(parseInt(hms) === 0) return parseInt(ms) + ' msec';
  // Otherwise, return seconds with one decimal.
  return hms + '.' + ms.slice(0, 1) + ' sec';
}

function compactClockTime() {
  // Return current time (no date) in 6 digits hhmmss. 
  const d = new Date();
  return d.getHours().toString().padStart(2, '0') +
      d.getMinutes().toString().padStart(2, '0') +
      d.getSeconds().toString().padStart(2, '0');
}

function uniformDecimals(data) {
  // Format the numbers in the array `data` so that they have uniform decimals.
  // NOTE: (1) This routine assumes that all number strings have sig4Dig format.
  //       (2) It changes the values of the `data` array elements to strings.
  // STEP 1: Scan the data array to get the longest integer part, the shortest
  // fraction part, and longest exponent part.
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
  // STEP 2: Convert the data to a uniform format.
  const special = ['\u221E', '-\u221E', '\u2047', '\u00A2'];
  for(let i = 0; i < data.length; i++) {
    const
        v = data[i],
        f = parseFloat(v);
    if(isNaN(f)) {
      // Keep special values such as infinity, and replace error values
      // by Unicode warning sign.
      if(special.indexOf(v) < 0) data[i] = '\u26A0'; 
    } else if(maxe > 0) {
      // Convert ALL numbers to exponential notation with two decimals (1.23e+7)
      const v = f.toExponential(2);
      ss = v.split('e');
      x = ss[1];
      if(x.length < maxe) {
        x = x[0] + '0' + x.substring(1);
      }
      data[i] = ss[0] + 'e' + x;
    } else if(maxi > 3) {
      // Round to integer if longest integer part has 4 or more digits.
      data[i] = Math.round(f).toString();
    } else {
      // Round fractions to `maxf` digits (but at most 4).
      data[i] = f.toFixed(Math.min(4 - maxi, maxf));
    }
  }
}

function capitalized(s) {
  // Return string `s` with its first letter capitalized.
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function ellipsedText(text, n=50, m=10) {
  // Return `text` with ellipsis " ... " between its first `n` and
  // last `m` characters. 
  if(text.length <= n + m + 3) return text;
  return text.slice(0, n) + ' \u2026 ' + text.slice(text.length - m);
}

function unquoteCSV(s) {
  // Return a double-quoted string `s` without its quotes, and with
  // quote pairs "" replaced by single " quotes.
  if(!s.startsWith('"') || !s.endsWith('"')) return s;
  return s.slice(1, -1).replaceAll('""', '"');
}

//
// Functions used when comparing two Linny-R models
//

function majorNewVersion(v1, v2) {
  // Return TRUE iff version `v2` has a higher major number. 
  v1 = v1.split('.').shift();
  v2 = v2.split('.').shift();
  return(safeStrToInt(v2, 0) > safeStrToInt(v1, 0));
}

function earlierVersion(v1, v2) {
  // Compare two version numbers and return TRUE iff `v1` is earlier
  // than `v2`.
  v1 = v1.split('.');
  v2 = v2.split('.');
  for(let i = 0; i < Math.min(v1.length, v2.length); i++) {
    // NOTE: For legacy JS models, the major version number evaluates as 0.
    if(safeStrToInt(v1[i]) < safeStrToInt(v2[i])) return true;
    if(safeStrToInt(v1[i]) > safeStrToInt(v2[i])) return false;
  }
  // Fall-through: same version numbers => NOT earlier.
  return false;
}

function differences(a, b, props) {
  // Compare values of properties (in list `props`) of entities `a` and `b`,
  // and return a "dictionary" object with differences.
  const d = {};
  // Only compare entities of the same type.
  if(a.type === b.type) {
    for(let i = 0; i < props.length; i++) {
      const p = props[i];
      // NOTE: Model entity properties can be expressions => compare their text.
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
  // Return `s1` with bold-faced from point of first difference with `s2`
  // up to position where `s1` and `s2` have the same tail.
  // NOTE: Ensure that both parameters are strings.
  s1 = '' + s1;
  s2 = '' + s2;
  const l = Math.min(s1.length, s2.length);
  let i = 0;
  while(i < l && s1.charAt(i) === s2.charAt(i)) i++;
  if(i >= s1.length) {
    // No differences, but tail may have been cut.
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

function ciCompare(a, b) {
  // Perform case-insensitive comparison that does differentiate between
  // accented characters (as this differentiates between identifiers).
  return a.localeCompare(b, undefined, {sensitivity: 'accent'});
}

function compareTailFirst(a, b, tail) {
  // Sort strings while prioritizing the group of elements that end on `tail`.
  const
      a_tail = a.endsWith(tail),
      b_tail = b.endsWith(tail);
  if(a_tail && !b_tail) return -1;
  if(!a_tail && b_tail) return 1;
  return ciCompare(a, b);
}

function endsWithDigits(str) {
  // Return trailing digts of `str` (empty string will evaluate as FALSE).
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
  // Return index of closing bracket, ignoring matched [...] inside.
  // NOTE: Start at offset + 1, assuming that character at offset = '['.
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
  // No matching bracket => return -1.
  return -1;
}

function monoSpaced(vbl) {
  // Remove all non-essential spaces from variable reference `vbl`.
  // First reduce all whitespace to a single space.
  return vbl.replace(/\s+/g, ' ')
       // Then remove spaces after the opening bracket.
      .replace(/\[\s+/g, '[')
      // Also remove spaces after a leading colon (if any).
      .replace(/\[:\s+/g, '[:')
      // Also remove spaces before closing bracket.
      .replace(/\s+\]/, ']');
}

function monoSpacedVariables(xt) {
  // Return expression text `xt` with all non-functional whitespace
  // *inside* its variable references (i.e., substrings like
  // "[entity name|attribute]") removed.
  // NOTE: All spacing *outside* variable references is preserved.
  return xt.replace(/\[[^\]]*\]/g, monoSpaced);
}

function patternList(str) {
  // Return the &|^-pattern defined by `str`
  // Pattern operators: & (and), ^ (not) and | (or) in sequence.
  // Example: this&that^not this|just this|^just not that
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
          // NOTE: First subterm is a MUST!
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
  // Return TRUE when `str` matches the &|^-pattern.
  // NOTE: If a pattern starts with a tilde ~ then `str` must start with
  // the rest of the pattern to match. If it ends with a tilde, then `str`
  // must end with the first part of the pattern.
  // In this way, ~pattern~ denotes that `str` should exactly match.
  for(let i = 0; i < patterns.length; i++) {
    const p = patterns[i];
    // NOTE: `p` is an OR sub-pattern that tests for a set of "plus"
    // sub-sub-patterns (all of which should match) and a set of "min"
    // sub-sub-patters (all should NOT match)
    let pm,
        swt,
        ewt,
        re,
        match = true;
    for(let j = 0; match && j < p.plus.length; j++) {
      pm = p.plus[j];
      swt = pm.startsWith('~');
      ewt = pm.endsWith('~');
      if(swt && ewt) {
        match = (str === pm.slice(1, -1));
      } else if(swt) {
        match = str.startsWith(pm.substring(1));
      } else if(ewt) {
        match = str.endsWith(pm.slice(0, -1));
      } else {
        match = (str.indexOf(pm) >= 0);
      }
      // If no match, check whether pattern contains wildcards.
      if(!match && pm.indexOf('#') >= 0) {
        // If so, rematch using regular expression that tests for a
        // number or a ?? wildcard.
        let res = pm.split('#');
        for(let i = 0; i < res.length; i++) {
          res[i] = escapeRegex(res[i]);
        }
        res = res.join('(\\d+|\\?\\?)');
        if(swt) res = '^' + res;
        if(ewt) res += '$';
        re = new RegExp(res, 'g');
        match = re.test(str);
      }
    }
    // Any "min" match indicates NO match for this sub-pattern.
    for(let j = 0; match && j < p.min.length; j++) {
      pm = p.min[j];
      swt = pm.startsWith('~');
      ewt = pm.endsWith('~');
      if(swt && ewt) {
        match = (str !== pm.slice(1, -1));
      } else if(swt) {
        match = !str.startsWith(pm.substring(1));
      } else if(ewt) {
        match = !str.endsWith(pm.slice(0, -1));
      } else {
        match = (str.indexOf(pm) < 0);
      }
      // If still matching, check whether pattern contains wildcards.
      if(match && pm.indexOf('#') >= 0) {
        // If so, now "negatively" rematch using regular expressions.
        let res = pm.split('#');
        for(let i = 0; i < res.length; i++) {
          res[i] = escapeRegex(res[i]);
        }
        res = res.join('(\\d+|\\?\\?)');
        if(swt) res = '^' + res;
        if(ewt) res += '$';
        re = new RegExp(res, 'g');
        match = !re.test(str);
      }
    }
    // Iterating through OR list, so any match indicates TRUE.
    if(match) return true;
  }
  return false;
}

function matchingWildcardNumber(str, patterns) {
  // Return the number that, when substituted for #, caused `str` to
  // match with the pattern list `patterns`, or FALSE if no such number
  // exists.
  // First get the list of all groups of consecutive digits in `str`.
  let nlist = str.match(/(\d+)/g);
  // If none, then evidently no number caused the match.
  if(!nlist) return false;
  // Now for each number check whether `str` still matches when the
  // number is replaced by the wildcard #.
  const mlist = [];
  for(let i = 0; i < nlist.length; i++) {
    const
        rstr = str.replaceAll(nlist[i], '#'),
        pm = patternMatch(rstr, patterns);
    // If it still matches, add it to the list.
    if(pm) addDistinct(nlist[i], mlist);
  }
  // NOTE This is only a quick and dirty heuristic. For intricate patterns
  // there may be mutliple matches, and there may be false positives for
  // patterns like "abc1#2" (so a hashtag with adjacent digits) but for
  // now this is good enough.
  if(mlist.length) return mlist[0];
  return false;
}

function escapeRegex(str) {
  // Return `str` with its RegEx special characters escaped.
  return str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function wildcardMatchRegex(name, equation=false) {
  // Return a RegEx object that will match wildcards in an entity name
  // with an integer number (\d+), or NULL if `name` does not contain
  // wildcards.
  // By default, # denotes a wildcard, but this may be changed to ??
  // when an equation name is parsed.
  const sl = name.split(equation ? '??' : '#');
  if(sl.length < 2) return null;
  for(let i = 0; i < sl.length; i++) {
    sl[i] = escapeRegex(sl[i]);
  }
  // NOTE: Match against integer numbers, but also match for ?? because
  // wildcard equation entities also match!
  return new RegExp(`^${sl.join('(\\d+|\\?\\?)')}$`, 'gi');
}

function wildcardFormat(name, modifier=false) {
  // Return string with CSS classes if it contains wildcards.
  // NOTES:
  // (1) Modifiers can contain * and single ? as wildcards.
  // (2) Equation names can contain at most one ?? as wildcard.
  const re = (modifier ? /(\?+|\*)/ : /(\?\?)/g);
  return name.replace(re, '<span class="wildcard">$1</span>');
}

function matchingNumber(m, s) {
  // Return an integer value if string `m` matches selector pattern `s`
  // (where asterisks match 0 or more characters, and question marks 1
  // character) and the matching parts jointly denote an integer.
  // NOTE: A "+" must be escaped, "*" and "?" must become groups.
  let raw = s.replaceAll('+', '\\+')
          .replace(/\*/g, '(.*)').replace(/\?/g, '(.)'),
      match = m.match(new RegExp(`^${raw}$`)),
      n = '';
  if(match) {
    // Concatenate all matching characters (need not be digits).
    m = match.slice(1).join('');
    n = parseInt(m);
  }
  // Return number only if when match is parsed as integer.
  return (n == m ? n : false);
}

function matchingNumberInList(ml, s) {
  // Traverse list `ml` and return the first matching number, or FALSE
  // if no match is found.
  for(const m of ml) {
    const n = matchingNumber(m, s);
    if(n !== false) return n;
  }
  return false;
}

function compareWithTailNumbers(s1, s2) {
  // Return 0 on equal, an integer < 0 if `s1` comes before `s2`, and
  // an integer > 0 if `s2` comes before `s1`.
  if(s1 === s2) return 0;
  let tn1 = endsWithDigits(s1),
      tn2 = endsWithDigits(s2);
  if(tn1) s1 = s1.slice(0, -tn1.length);
  if(tn2) s2 = s2.slice(0, -tn2.length);
  let c = ciCompare(s1, s2);
  if(c !== 0 || !(tn1 || tn2)) return c;
  if(tn1 && tn2) return parseInt(tn1) - parseInt(tn2);
  if(tn2) return -1;
  return 1;
}

function compareSelectors(s1, s2) {
  // Dataset selectors comparison is case-insensitive, and puts wildcards
  // last, where * comes later than ?, and leading colons come AFTER
  // regular selector names.
  // NOTES:
  // (1) Without wildcards, strings that are identical except for
  //     the digits they *end* on are sorted on this "end number"
  //     (so abc12 > abc2).
  // (2) This also applies to percentages ("end number"+ %).
  // (3) As of version 1.9.0, the order of selectors can be (partially)
  //     specified by the modeler.
  if(MODEL) {
    const
        i1 = MODEL.selector_order_list.indexOf(s1),
        i2 = MODEL.selector_order_list.indexOf(s2);
    // BOTH selectors must be in the list, or regular sorting order is
    // applied.
    if(i1 >= 0 && i2 >= 0) return i1 - i2;
  }
  if(s1 === s2) return 0;
  if(s1 === '*') return 1;
  if(s2 === '*') return -1;
  // Replace leading colon by | because | has a higher ASCII value than
  // all other characters. This will move selectors with leading colons
  // to the end of the list.
  if(s1.startsWith(':')) s1 = '|' + s1.substring(1);
  if(s2.startsWith(':')) s2 = '|' + s2.substring(1);
  const
      star1 = s1.indexOf('*'),
      star2 = s2.indexOf('*');
  if(star1 >= 0) {
    if(star2 < 0) return 1;
    return ciCompare(s1, s2);
  }
  if(star2 >= 0) return -1;  
  // Now replace ? by | to make it sort further down than other characters.
  let s_1 = s1.replace('?', '|').toLowerCase(), 
      s_2 = s2.replace('?', '|').toLowerCase(),
      // NOTE: Selectors ending on a number or percentage are special.
      n_1 = endsWithDigits(s_1),
      p_1 = (s1.endsWith('%') ? endsWithDigits(s1.slice(0, -1)) : '');
  if(n_1) {
    const
        ss_1 = s1.slice(0, -n_1.length),
        n_2 = endsWithDigits(s2);
    if(n_2 && ss_1 === s2.slice(0, -n_2.length)) {
      return parseInt(n_1) - parseInt(n_2);
    }
  } else if(p_1) {
    const
        ss_1 = s1.slice(0, -p_1.length - 1),
        p_2 = (s2.endsWith('%') ? endsWithDigits(s2.slice(0, -1)) : '');
    if(p_2 && ss_1 === s2.slice(0, -p_2.length - 1)) {
      return parseInt(p_1) - parseInt(p_2);
    }
  }
  // Also sort selectors ending on minuses lower than those ending on
  // plusses, and so that X-- comes before X-, like X+ automatically comes
  // before X++. ASCII(+) = 43, ASCII(-) = 45, so replace trailing minuses
  // by as many spaces (ASCII 32) and add a '!' (ASCII 33). This will then
  // "sorts things out".
  let n = s_1.length,
      i = n - 1,
      plusmin = false;
  while(i >= 0 && s_1[i] === '-') i--;
  // If trailing minuses, replace by as many spaces and add an exclamation
  // point.
  if(i < n - 1) {
    s_1 = s_1.substring(0, i + 1);
    // NOTE: Consider X- as lower than just X.
    if(s_1 === s_2) return -1;
    while(s_1.length < n) s_1 += ' ';
    s_1 += '!';
    plusmin = true;
  }
  // Do the same for the second "normalized" selector.
  n = s_2.length;
  i = n - 1;
  while(i >= 0 && s_2[i] === '-') i--;
  if(i < n - 1) {
    s_2 = s_2.substring(0, i + 1);
    // NOTE: Consider X as higher than X-.
    if(s_2 === s_1) return 1;
    while(s_2.length < n) s_2 += ' ';
    s_2 += '!';
    plusmin = true;
  }
  if(plusmin) {
    // As X0 typically denotes "base case", replace a trailing zero by
    // ")" to ensure that X- < X0 < X+.
    s_1.replace(/([^0])0$/, '$1)');
    s_2.replace(/([^0])0$/, '$1)');
  }
  // Now compare the two "normalized" selectors
  if(s_1 < s_2) return -1;
  if(s_1 > s_2) return 1;
  return 0;
}

function compareCombinations(c1, c2) {
  // Compare two selector lists.
  const n = Math.min(c1.length, c2.length);
  for(let i = 0; i < n; i++) {
    const cs = compareSelectors(c1[i], c2[i]);
    if(cs) return cs;
  }
  if(c1.length > l) return 1;
  if(c2.length > l) return -1;
  return 0;
}

//
// Functions that perform set-like operations on lists of string
//

function addDistinct(e, list) {
  // Add element `e` to `list` only if it does not already occur in `list`.
  if(list.indexOf(e) < 0) list.push(e);
}

function mergeDistinct(list, into) {
  // Add elements of `list` to `into` if not already in `into`.
  for(const e of list) addDistinct(e, into);
}

function iteratorSet(list) {
  // Return TRUE iff list is something like ['i=1', 'i=2', 'i=3'].
  if(list.length === 0) return false;
  // Analyze the first element: must start with i=, j= or k=.
  const
      parts = list[0].split('='),
      iterator = parts[0];
  if(parts.length !== 2 || 'ijk'.indexOf(iterator) < 0) return false;
  // Left-hand part must be an integer number: the first iterator value.
  const first = parts[1] - 0;
  if(first != parts[1]) return false;
  // If OK, generate the list one would expect.
  const
      series = [],
      last = first + list.length - 1;
  for(let i = first; i <= last; i++) {
    series.push(iterator + '=' + i);
  }
  // Then compare with the list to be tested.
  if(list.join(',') === series.join(',')) {
    // If match, return a shorthand string like 'i=1, ..., i=5'.
    // NOTE: No ellipsis if fewer than 4 steps.
    if(list.length < 4) return `{${list.join(', ')}}`;
    return `{${list[0]}, ..., ${list[list.length - 1]}}`;
  }
  return false;
}

function integerSet(list) {
  // Return TRUE iff all elements in list evaluate as integer numbers.
  if(list.length === 0) return false;
  for(const n of list) if(n - 0 != n) return false;
  return true;
}

function setString(sl) {
  // Return elements of stringlist `sl` in set notation.
  if(integerSet(sl)) {
    // If all set elements are integers, return a range shorthand.
    const sorted = sl.slice().sort();
    let i = 0,
        j = 1;
    while(i < sorted.length) {
      while(j < sorted.length && sorted[j] - sorted[j - 1] === 1) j++;
      if(j - i > 2) {
        sorted[i] += ', ... , ' + sorted[j - 1];
        sorted.splice(i + 1, j - i - 1);
        j = i + 1;
      }
      i = j;
      j++;
    }
    return '{' + sorted.join(', ') + '}';
  }
  // Otherwise, return an iterator set shorthand, or the complete set.
  return iteratorSet(sl) || '{' + sl.join(', ') + '}';
}

function setStringList(lsl) {
  // Return list of selector lists as array of set strings.
  const ssl = [];
  for(const sl of lsl) ssl.push(setString(sl));
  return ssl;
}
  
function tupelString(sl) {
  // Return elements of stringlist `sl` in tupel notation.
  return '(' + sl.join(', ') + ')';
}

function tupelSetString(ssl) {
  // Return string of stringlists `sll` as set of tuples.
  const tl = [];
  for(const ss of ssl) tl.push(tupelString(ss));
  return setString(tl);
}

function tupelIndex(sl, ssl) {
  // Return index of stringlist `sl` if it exists in `ssl`, otherwise -1.
  for(let i = 0; i < ssl.length; i++) {
    let n = 0;
    for(const s of sl) {
      if(ssl[i].indexOf(s) < 0) break;
      n++;
    }
    if(n == sl.length) return i;
  }
  return -1;
}

function intersection(sl1, sl2) {
  // Return the list of common elements of stringlists `l1` and `l2`.
  const shared = [];
  for(const s of sl1) if(sl2.indexOf(s) >= 0) shared.push(s);
  return shared;
}
  
function complement(sl1, sl2) {
  // Return the list of elements of stringlist `l1` that are NOT in `l2`.
  const cmplmnt = [];
  for(const s of sl1) if(sl2.indexOf(s) < 0) cmplmnt.push(s);
  return cmplmnt;
}

//
// Functions that support loading and saving data and models
//

function xmlEncoded(str) {
  // Replace &, <, >, ', and " by their XML entity code.
  return str.replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('\'', '&apos;')
      .replaceAll('"', '&quot;')
      // NOTE: To prevent data from breaking when saving via the browser.
      .replaceAll('#', '%23');
}

function xmlDecoded(str) {
  // Replace XML entity code for &, <, >, ' and " by the original character
  return str.replaceAll('&lt;', '<')
      .replaceAll('&gt', '>')
      .replaceAll('&apos;', '\'')
      .replaceAll('&quot;', '"')
      .replaceAll('&amp;', '&')
      // NOTE: The %23 encoding of # is applied in all Linny-R models since its
      // browser-based implementation.
      .replaceAll('%23', '#')
      // NOTE: Also replace Linny-R *legacy* newline encoding $$\n by two
      // newline characters.
      .replaceAll('$$\n', '\n\n');
}

function customizeXML(str) {
  // This function can be customized to pre-process a model file,
  // for example to rename entities in one go -- USE WITH CARE!
  // NOTE: To prevent unintended customization, check whether the model
  // name ends with "!!CUSTOMIZE". This check ensures that the modeler
  // must first save the model with this text as the (end of the) model
  // name and then load it again for the customization to be performed.
  if(str.indexOf('!!CUSTOMIZE</name><author>') >= 0) {
    // Modify `str` -- by default, do nothing, but typical modifications
    // will replace RexEx patterns by other strings.    

    const
        re = /pattern/g,
        r = 'replacement';

    // Trace the changes to the console.
    console.log('Customizing:', re, r);
    console.log('Matches:', str.match(re));
    str = str.replace(re, r);
  }
  // Finally, return the modified string.
  return str;
}

function cleanXML(node) {
  // Remove all unnamed text nodes and comment nodes from the XML
  // subtree under node.
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
  // Parse string `xml` into an XML document, and return its root node
  // (or null if errors).
  xml = XML_PARSER.parseFromString(customizeXML(xml), 'application/xml');
  const
      de = xml.documentElement,
      pe = de.getElementsByTagName('parsererror').item(0);
  if(pe) throw de.nodeValue;
  cleanXML(de);
  return de;
}

function childNodeByTag(node, tag) {
  // Return the XML child node of `node` having node name `tag`, or NULL if
  // no such child node exists.
  let cn = null;
  for (let ci = 0; ci < node.childNodes.length; ci++) {
    if(node.childNodes[ci].tagName === tag) {
      cn = node.childNodes[ci];
      break;
    }
  }
  return cn;
}

function nodeContentByTag(node, tag) {
  // Return the text content of the child node of `node` having name `tag`,
  // or the empty string if no such node exists.
  return nodeContent(childNodeByTag(node, tag));
}

function nodeContent(node) {
  // Return the text content of XML element `node`.
  if(node) {
    // For text nodes, return their value.
    if(node.nodeType === 3) return node.nodeValue;
    // For empty nodes, return empty string.
    if(node.childNodes.length === 0) return '';
    // If first child is text, return its value.
    const fcn = node.childNodes.item(0);
    if(fcn && fcn.nodeType === 3) return fcn.nodeValue;
    console.log('UNEXPECTED XML', fcn.nodeType, node);
  }
  return '';
}

function nodeParameterValue(node, param) {
  // Return the value of parameter `param` as string if `node` has
  // this parameter, otherwise the empty string.
  const a = node.getAttribute(param);
  return a || '';
}

//
// Functions that support naming and identifying Linny-R entities
//

function letterCode(n) {
  // Encode a non-negative integer as base-26 (0 = A, 25 = Z, 26 = AA, etc.)
  const r = n % 26, d = (n - r) / 26, c = String.fromCharCode(65 + r);
  // NOTE: recursion!
  if(d) return letterCode(d) + c;
  return c;
}

function parseLetterCode(lc) {
  // Decode a base-26 code into an integer. NOTE: does not check whether
  // the code is indeed base-26
  let n = 0;
  for(let i = 0; i < lc.length; i++) {
    n = 10*n + (lc.charCodeAt(i) - 65);
  }
  return n;
}

function randomID() {
  // Generate a 22+ hex digit ID: timestamp plus 12 random bits as suffix
  // plus 8 more random hex digits (earlier shorter version caused doubles!)
  const d = ((new Date()).getTime() + Math.random()) * 4096,
        e = Math.floor(Math.random() * 4294967296);
  return (Math.floor(d)).toString(16) + e.toString(16);
}

function escapedSingleQuotes(s) {
  // Return string `s` with "escaped" single quotes.
  return s.replace('\'', '\\\'');
}

function safeDoubleQuotes(s) {
  // Return string `s` with ASCII quotes " replaced by curly quotes to
  // ensure that it does not break HTML attribute strings.
  const q = ['\u201C', '\u201D'];
  let index = 0; 
  while(s.indexOf('"') >= 0) {
    s = s.replace('"', q[index]);
    index = 1 - index;
  }
  return s;
}

function nameToLines(name, actor_name = '') {
  // Return the name of a Linny-R entity as a string-with-line-breaks
  // that fits nicely in an oblong box. For efficiency reasons, a fixed
  // width/height ratio is assumed, as this produces quite acceptable
  // results. Actor names are not split, so their length may stretch
  // the node box.
  let m = actor_name.length;
  const
      d = Math.floor(Math.sqrt(0.25 * name.length)),
      // Do not wrap strings shorter than 13 characters (about 50 pixels).
      limit = Math.max(Math.ceil(name.length / d), m, 13),
      // NOTE: Do not split on spaces followed by a number or a single
      // capital letter.
      a = name.split(/\s(?!\d+:|\d+$|[A-Z]\W)/);
  // Split words at '-' when wider than limit.
  for(let j = 0; j < a.length; j++) {
    if(a[j].length > limit) {
      const sw = a[j].split('-');
      if(sw.length > 1) {
        // Replace j-th word by last fragment of split string.
        a[j] = sw.pop();
        // Insert remaining fragments before.
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
  // Actor cash flow indicators like $FLOW have their own line.
  if(a[0].startsWith('$')) {
    n++;
    lines[n] = a[1];
  }
  for(let i = 1 + n; i < a.length; i++) {
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
// Linny-R legacy model conversion functions
//

function hexToFloat(s) {
  const n = parseInt('0x' + s, 16);
  if(isNaN(n)) return 0;
  const
      sign = (n >> 31 ? -1 : 1),
      exp = Math.pow(2, ((n >> 23) & 0xFF) - 127);
      f = sign * (n & 0x7fffff | 0x800000) * 1.0 / Math.pow(2, 23) * exp;
  // NOTE: must consider precision of 32-bit floating point numbers!
  return parseFloat(f.toPrecision(7));
}

function stringToFloatArray(s) {
  let i = 8,
      a = [];
  while(i <= s.length) {
    const
        h = s.substring(i - 8, i),
        r = h.substring(6, 2) + h.substring(4, 2) +
            h.substring(2, 2) + h.substring(0, 2);
    a.push(hexToFloat(r));
    i += 8;
  }
  return a;
}

//
// Encryption-related functions
//

function hexToBytes(hex) {
  // Converts a hex string to a Uint8Array
  const bytes = [];
  for(let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substring(i, i + 2), 16));
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
  isEmpty: isEmpty,
  noDrag: noDrag,
  postData: postData,
  pluralS: pluralS,
  safeStrToFloat: safeStrToFloat,
  safeStrToInt: safeStrToInt,
  safeToPrecision: safeToPrecision,
  rangeToList: rangeToList,
  listToRange: listToRange,
  dateToString: dateToString,
  msecToTime: msecToTime,
  compactClockTime: compactClockTime,
  uniformDecimals: uniformDecimals,
  capitalized: capitalized,
  ellipsedText: ellipsedText,
  unquoteCSV: unquoteCSV,
  majorNewVersion: majorNewVersion,
  earlierVersion: earlierVersion,
  differences: differences,
  markFirstDifference: markFirstDifference,
  ciCompare: ciCompare,
  compareTailFirst: compareTailFirst,
  endsWithDigits: endsWithDigits,
  indexOfMatchingBracket: indexOfMatchingBracket,
  monoSpaced: monoSpaced,
  monoSpacedVariables: monoSpacedVariables,
  patternList: patternList,
  patternMatch: patternMatch,
  matchingWildcardNumber: matchingWildcardNumber,
  escapeRegex: escapeRegex,
  wildcardMatchRegex: wildcardMatchRegex,
  wildcardFormat: wildcardFormat,
  matchingNumber: matchingNumber,
  matchingNumberInList: matchingNumberInList,
  compareWithTailNumbers: compareWithTailNumbers,
  compareSelectors: compareSelectors,
  compareCombinations: compareCombinations,
  addDistinct: addDistinct,
  mergeDistinct: mergeDistinct,
  iteratorSet: iteratorSet,
  integerSet: integerSet,
  setString: setString,
  setStringList: setStringList,
  tupelString: tupelString,
  tupelSetString: tupelSetString,
  tupelIndex: tupelIndex,
  intersection: intersection,
  complement: complement,
  xmlEncoded: xmlEncoded,
  xmlDecoded: xmlDecoded,
  customizeXML: customizeXML,
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
  safeDoubleQuotes: safeDoubleQuotes,
  nameToLines: nameToLines,
  hexToFloat: hexToFloat,
  stringToFloatArray: stringToFloatArray,
  unpackFloat: unpackFloat,
  unpackVector: unpackVector,
  hexToBytes: hexToBytes,
  bytesToHex: bytesToHex,
  arrayBufferToBase64: arrayBufferToBase64,
  base64ToArrayBuffer: base64ToArrayBuffer,
  encryptionKey: encryptionKey,
  encryptMessage: encryptMessage,
  decryptMessage: decryptMessage,
  tryToDecrypt: tryToDecrypt
}