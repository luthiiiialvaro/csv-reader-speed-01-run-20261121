// solve.js — a fast CSV reader with exactly csv-reader 1.0.0's semantics.
//
// Single left-to-right scan of the text. The reference builds every field
// one character at a time; this one does not:
//   - an unquoted field is sliced straight out of the input (its scan is a
//     tight charCodeAt loop that stops at a comma, a line break or a stray
//     CR, which it drops and records as it goes);
//   - a quoted field jumps to its closing quote with indexOf ("" pairs
//     skipped on the way) and is sliced too, unless it holds escapes or
//     line breaks, which take a slow path that rebuilds it once;
//   - errors are recorded in the order met, against the record they belong
//     to, exactly as the reference records them.
// Pure: no clock, no randomness, no locale, nothing kept between calls.

/** How a field ended: at a comma (the record goes on), at a line break or at the end of the text. */
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input {text, header}: {columns, rows, errors}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xFEFF) pos = 1; // a U+FEFF at the very start is dropped

  while (true) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    // The record being read: the line it starts on and the index in rows it takes (null: the header).
    const recordLine = line;
    const recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let ended = COMMA;
    let onlyQuoted = false;

    do {
      const openedQuoted = text.charCodeAt(pos) === 34;
      onlyQuoted = openedQuoted;
      let value;
      let endedLocal;
      let asUnquoted = !openedQuoted;
      let prefix = '';
      let needJunkCheck = false;

      if (openedQuoted) {
        const open = pos;
        const openLine = line;
        pos += 1;
        let contentStart = pos;
        let segs = null; // slices and '"' pieces, when "" pairs split the content
        let closePos = -1;
        for (;;) {
          const q = text.indexOf('"', pos);
          if (q === -1) break;
          if (q + 1 < len && text.charCodeAt(q + 1) === 34) {
            // A doubled quote: one quote in the value, and the scan goes on.
            if (segs === null) segs = [];
            segs.push(text.slice(contentStart, q));
            segs.push('"');
            pos = q + 2;
            contentStart = q + 2;
            continue;
          }
          closePos = q;
          break;
        }
        if (closePos === -1) {
          // The quote never closes: it is a literal character, and the text
          // after it is read again as unquoted.
          pos = open + 1;
          line = openLine;
          errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
          prefix = '"';
          asUnquoted = true;
        } else {
          const origStart = open + 1;
          const raw = text.slice(origStart, closePos);
          if (raw.indexOf('\n') === -1 && raw.indexOf('\r') === -1) {
            // No line breaks inside: the value is the content as it stands,
            // with each "" pair as one quote.
            value = segs === null ? raw : segs.join('') + text.slice(contentStart, closePos);
          } else {
            // Slow path: each CRLF or lone CR inside the quotes is one LF,
            // and each "" pair is one quote.
            const parts = [];
            let i = origStart;
            while (i < closePos) {
              const c = text.charCodeAt(i);
              if (c === 34) {
                parts.push('"');
                i += 2;
              } else if (c === 13) {
                parts.push('\n');
                line += 1;
                i += i + 1 < closePos && text.charCodeAt(i + 1) === 10 ? 2 : 1;
              } else if (c === 10) {
                parts.push('\n');
                line += 1;
                i += 1;
              } else {
                let j = i + 1;
                while (j < closePos) {
                  const d = text.charCodeAt(j);
                  if (d === 34 || d === 13 || d === 10) break;
                  j += 1;
                }
                parts.push(text.slice(i, j));
                i = j;
              }
            }
            value = parts.join('');
          }
          pos = closePos + 1;
          if (pos >= len) {
            endedLocal = END;
          } else {
            const c = text.charCodeAt(pos);
            if (c === 44) {
              pos += 1;
              endedLocal = COMMA;
            } else if (c === 10) {
              pos += 1;
              line += 1;
              endedLocal = LINE_BREAK;
            } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
              pos += 2;
              line += 1;
              endedLocal = LINE_BREAK;
            } else {
              // What follows the closing quote is appended as it stands,
              // up to the next comma or line break.
              prefix = value;
              needJunkCheck = true;
              asUnquoted = true;
            }
          }
        }
      }

      if (asUnquoted) {
        // Reads unquoted characters up to the next comma or line break: a CR
        // not followed by LF is dropped (stray_cr). The field is one slice
        // when no stray CR splits it, else its pieces joined.
        const ustart = pos;
        let usegs = null;
        let usegStart = pos;
        let uended = END;
        let ufieldEnd = len;
        while (pos < len) {
          const c = text.charCodeAt(pos);
          if (c === 44) {
            ufieldEnd = pos;
            pos += 1;
            uended = COMMA;
            break;
          }
          if (c === 10) {
            ufieldEnd = pos;
            pos += 1;
            line += 1;
            uended = LINE_BREAK;
            break;
          }
          if (c === 13) {
            if (text.charCodeAt(pos + 1) === 10) {
              ufieldEnd = pos;
              pos += 2;
              line += 1;
              uended = LINE_BREAK;
              break;
            }
            errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
            if (usegs === null) usegs = [];
            usegs.push(text.slice(usegStart, pos));
            pos += 1;
            usegStart = pos;
            continue;
          }
          pos += 1;
        }
        let scanned;
        if (usegs === null) {
          scanned = text.slice(ustart, ufieldEnd);
        } else {
          usegs.push(text.slice(usegStart, ufieldEnd));
          scanned = usegs.join('');
        }
        if (needJunkCheck && scanned.length > 0) {
          errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
        }
        value = prefix === '' ? scanned : prefix + scanned;
        endedLocal = uended;
      }

      fields.push(value);
      ended = endedLocal;
    } while (ended === COMMA);

    // A line that held only stray CRs is left with no characters: no record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !onlyQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}
