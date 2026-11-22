// Writes the parrot's frames and the button's icon into mods/parrot/frames.
//   bun scripts/make-frames.js
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { files } from "./sprite.js";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "mods", "parrot", "frames");
mkdirSync(out, { recursive: true });
const all = files();
for (const [name, bytes] of Object.entries(all)) writeFileSync(join(out, name), bytes);
console.log(`frames: wrote ${Object.keys(all).length} files to ${out}`);
