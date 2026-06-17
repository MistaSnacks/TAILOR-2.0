/**
 * Return the first COMPLETE, balanced JSON value (object/array) in `text`, string-aware so
 * braces inside strings don't miscount. Tolerates surrounding prose or an appended second value.
 */
export function firstJsonValue(text: string): string {
  let i = 0;
  while (i < text.length && text[i] !== "{" && text[i] !== "[") i++;
  if (i >= text.length) throw new Error("no JSON value in text");
  const open = text[i];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = i; j < text.length; j++) {
    const c = text[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close && --depth === 0) return text.slice(i, j + 1);
  }
  throw new Error("unterminated JSON value in text");
}
