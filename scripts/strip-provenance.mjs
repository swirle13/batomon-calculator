/**
 * One-shot codemod: delete the `Provenance` property assignments (`sourceRefs`, `patch`,
 * `conflicts`, `unconfirmedFields`) from every object literal in the files named on argv.
 *
 * Hand-rolled scanner rather than the TypeScript AST because typescript@7's npm package ships
 * only the compiler executable, with no JS API to parse with.
 */
import { readFileSync, writeFileSync } from "node:fs";

const TARGETS = new Set(["sourceRefs", "patch", "conflicts", "unconfirmedFields"]);
const ID = /[A-Za-z0-9_$]/;

function strip(src) {
  const removals = [];
  // Stack of bracket chars; template-literal substitutions push "(" so `}` bookkeeping stays sane.
  const stack = [];
  let prevSignificant = "";
  let i = 0;

  const skipString = (quote) => {
    i++;
    while (i < src.length) {
      const c = src[i];
      if (c === "\\") i += 2;
      else if (c === quote) return i++;
      else if (quote === "`" && c === "$" && src[i + 1] === "{") {
        i += 2;
        scan(true); // consume through the matching `}`
      } else i++;
    }
  };

  function scan(untilCloseBrace) {
    const baseDepth = stack.length;
    while (i < src.length) {
      const c = src[i];
      if (c === "/" && src[i + 1] === "/") {
        while (i < src.length && src[i] !== "\n") i++;
        continue;
      }
      if (c === "/" && src[i + 1] === "*") {
        i = src.indexOf("*/", i + 2) + 2;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        skipString(c);
        prevSignificant = '"';
        continue;
      }
      if (c === "{" || c === "[" || c === "(") {
        stack.push(c);
        prevSignificant = c;
        i++;
        continue;
      }
      if (c === "}" || c === "]" || c === ")") {
        if (untilCloseBrace && c === "}" && stack.length === baseDepth) {
          i++;
          return;
        }
        stack.pop();
        prevSignificant = c;
        i++;
        continue;
      }
      if (/\s/.test(c)) {
        i++;
        continue;
      }

      // A property name can only start where the last significant char opened or continued an
      // object literal.
      if (
        ID.test(c) &&
        stack[stack.length - 1] === "{" &&
        (prevSignificant === "{" || prevSignificant === ",")
      ) {
        const start = i;
        while (i < src.length && ID.test(src[i])) i++;
        const name = src.slice(start, i);
        let j = i;
        while (j < src.length && /\s/.test(src[j])) j++;
        if (src[j] === ":" && TARGETS.has(name)) {
          i = j + 1;
          const valueDepth = stack.length;
          // Consume the value up to the separator that ends this property.
          while (i < src.length) {
            const d = src[i];
            if (d === "/" && src[i + 1] === "/") {
              while (i < src.length && src[i] !== "\n") i++;
            } else if (d === "/" && src[i + 1] === "*") {
              i = src.indexOf("*/", i + 2) + 2;
            } else if (d === '"' || d === "'" || d === "`") {
              skipString(d);
            } else if (d === "{" || d === "[" || d === "(") {
              stack.push(d);
              i++;
            } else if (d === "}" || d === "]" || d === ")") {
              if (stack.length === valueDepth) break; // closing brace of the owning literal
              stack.pop();
              i++;
            } else if (d === "," && stack.length === valueDepth) {
              break;
            } else i++;
          }
          let end = i;
          while (end > start && /\s/.test(src[end - 1])) end--;
          let hadComma = false;
          let m = end;
          while (m < src.length && /\s/.test(src[m])) m++;
          if (src[m] === ",") {
            end = m + 1;
            hadComma = true;
          }
          // Swallow the blank line the property occupied, and if it was the last property, the
          // comma that used to precede it.
          let s = start;
          while (s > 0 && (src[s - 1] === " " || src[s - 1] === "\t")) s--;
          if (src[s - 1] === "\n") s--;
          if (!hadComma) {
            let k = s;
            while (k > 0 && /\s/.test(src[k - 1])) k--;
            if (src[k - 1] === ",") s = k - 1;
          }
          const last = removals[removals.length - 1];
          // Consecutive provenance properties: the backtrack above can reach into the previous
          // removal, so merge rather than emitting overlapping ranges.
          if (last && s <= last[1]) last[1] = end;
          else removals.push([s, end]);
          prevSignificant = hadComma ? "," : prevSignificant;
          continue;
        }
        prevSignificant = name[name.length - 1];
        continue;
      }

      prevSignificant = c;
      i++;
    }
  }

  scan(false);

  let out = src;
  for (const [s, e] of removals.reverse()) out = out.slice(0, s) + out.slice(e);
  return { out, count: removals.length };
}

for (const file of process.argv.slice(2)) {
  const src = readFileSync(file, "utf8");
  const { out, count } = strip(src);
  writeFileSync(file, out);
  console.log(`${file}: removed ${count}`);
}
