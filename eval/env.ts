import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Load KEY=VALUE lines from .env.local into process.env (does not overwrite existing). */
export function loadEnvLocal(path = resolve(process.cwd(), ".env.local")): void {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return; // no .env.local — rely on the ambient environment
  }
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const idx = line.indexOf("=");
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = val;
  }
}
