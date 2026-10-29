// Strings. Every user-facing string lives in public/i18n/<lang>.json under a
// flat key (the copy-deck keys from docs/HANDOFF.md §8 where they exist).
//
// Messages use a small subset of ICU MessageFormat:
//   "Hello {name}"
//   "Waiting on {n, plural, one {# player} other {# players}}"
//   "{team, select, good {Good} evil {Evil} other {}}"
// Plural categories come from Intl.PluralRules, so Chinese (no plural forms)
// works with the same messages. `=0`-style exact matches are supported too.

let messages = {};
let locale = 'en';

// The languages with a strings file in public/i18n/. Each one's name is
// shown in its own language in the picker ("English", "中文").
export const LANGUAGES = ['en', 'zh-Hans'];

// The language to start in: the player's choice if they made one, else
// Chinese for a phone set to any Chinese, else English.
export function pickLanguage(saved, browserLangs = []) {
  if (LANGUAGES.includes(saved)) return saved;
  return browserLangs.some((l) => /^zh\b/i.test(l)) ? 'zh-Hans' : 'en';
}

export async function loadLocale(lang = 'en') {
  const res = await fetch(`i18n/${lang}.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`could not load strings for ${lang}`);
  setMessages(await res.json(), lang);
}

export function setMessages(dict, lang = 'en') {
  messages = dict;
  locale = lang;
}

export function hasKey(key) {
  return Object.prototype.hasOwnProperty.call(messages, key);
}

export function t(key, params = {}) {
  const msg = messages[key];
  if (msg === undefined) {
    console.warn(`missing string: ${key}`);
    return key;
  }
  return format(msg, params, locale);
}

// ---------- the formatter ----------

export function format(msg, params = {}, lang = locale) {
  return render(parse(msg), params, lang, null);
}

// Parse into a list of parts: strings, and { arg, type, options } nodes.
function parse(src) {
  let i = 0;
  function parseText(stopAtBrace) {
    const parts = [];
    let buf = '';
    while (i < src.length) {
      const ch = src[i];
      if (ch === '{') {
        if (buf) parts.push(buf), (buf = '');
        i++;
        parts.push(parseArg());
      } else if (ch === '}' && stopAtBrace) {
        break;
      } else {
        buf += ch;
        i++;
      }
    }
    if (buf) parts.push(buf);
    return parts;
  }
  function readUntil(chars) {
    let s = '';
    while (i < src.length && !chars.includes(src[i])) s += src[i++];
    return s.trim();
  }
  function parseArg() {
    const arg = readUntil([',', '}']);
    if (src[i] === '}') {
      i++;
      return { arg };
    }
    i++; // ,
    const type = readUntil([',', '}']);
    i++; // ,
    const options = {};
    for (;;) {
      while (src[i] === ' ' || src[i] === '\n') i++;
      if (src[i] === '}' || i >= src.length) break;
      const sel = readUntil(['{']);
      i++; // {
      options[sel] = parseText(true);
      i++; // }
    }
    i++; // closing } of the argument
    return { arg, type, options };
  }
  return parseText(false);
}

function render(parts, params, lang, hashValue) {
  let out = '';
  for (const p of parts) {
    if (typeof p === 'string') {
      out += hashValue === null ? p : p.replaceAll('#', String(hashValue));
      continue;
    }
    const value = params[p.arg];
    if (!p.type) {
      out += value === undefined || value === null ? '' : String(value);
    } else if (p.type === 'plural') {
      const n = Number(value);
      const exact = p.options[`=${n}`];
      const cat = new Intl.PluralRules(lang).select(n);
      const chosen = exact || p.options[cat] || p.options.other || [];
      out += render(chosen, params, lang, n);
    } else if (p.type === 'select') {
      out += render(p.options[String(value)] || p.options.other || [], params, lang, hashValue);
    }
  }
  return out;
}

export function currentLocale() {
  return locale;
}

// The space between two sentences: none in Chinese, where 。 already
// separates them.
export function gap() {
  return locale.startsWith('zh') ? '' : ' ';
}

// Like t(), but params may be DOM nodes (e.g. a bold name). Returns an array
// of strings and nodes for h(), so each language keeps its own word order
// and punctuation around the node.
export function tParts(key, params = {}) {
  const nodes = [];
  const plain = {};
  for (const [k, v] of Object.entries(params)) {
    if (v && typeof v === 'object' && 'nodeType' in v) {
      plain[k] = `\u0000${nodes.length}\u0000`;
      nodes.push(v);
    } else plain[k] = v;
  }
  return t(key, plain)
    .split('\u0000')
    .map((part, i) => (i % 2 ? nodes[Number(part)] : part))
    .filter((part) => part !== '');
}

// Join names as "Kofi", "Kofi and Mei", "Kofi, Mei and Jude" (localised).
export function list(names) {
  if (typeof Intl.ListFormat === 'function') {
    // British English, like the design's copy: "Kofi, Mei and Jude" (no Oxford comma).
    const lang = locale === 'en' ? 'en-GB' : locale;
    return new Intl.ListFormat(lang, { style: 'long', type: 'conjunction' }).format(names);
  }
  return names.join(', ');
}
