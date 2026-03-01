import { hyphenateSync } from "hyphen/en";

export function softHyphenate(text: string): string {
  return text
    .split(/(\s+)/)
    .map((t) => (/\S/.test(t) ? hyphenateSync(t) : t))
    .join("");
}
