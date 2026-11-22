import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { FRAMES, FRAME_SCALE, ICON, ICON_SCALE, PAL, S, crop, files, png, raster } from "../scripts/sprite.js";

const framesDir = join(import.meta.dir, "..", "mods", "parrot", "frames");

function size(bytes) {
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe("raster", () => {
  test("draws a 32 by 32 grid in the palette's colours only", () => {
    const grid = raster({});
    expect(grid).toHaveLength(S);
    for (const row of grid) {
      expect(row).toHaveLength(S);
      for (const cell of row) if (cell !== null) expect(Object.keys(PAL)).toContain(cell);
    }
  });

  test("opens the eye on the calm frame and closes it on the blink", () => {
    expect(raster(FRAMES.calm)[9][11]).toBe("K");
    expect(raster(FRAMES.blink)[9][11]).toBe("W");
    expect(raster(FRAMES.blink)[10].slice(10, 13)).toEqual(["K", "K", "K"]);
  });

  test("keeps the perch in place when the head drops to sleep", () => {
    const calm = raster(FRAMES.calm), asleep = raster(FRAMES.sleep);
    expect(asleep[25]).toEqual(calm[25]);
    expect(asleep).not.toEqual(calm);
  });

  test("outlines the bird so it reads on light and dark terminals", () => {
    const grid = raster({});
    const outline = grid.flat().filter((c) => c === "o").length;
    expect(outline).toBeGreaterThan(40);
  });
});

describe("png", () => {
  test("writes a PNG of the grid's size times the scale", () => {
    const bytes = png(raster({}), 3);
    expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(size(bytes)).toEqual({ width: 96, height: 96 });
  });
});

describe("the mod's frames", () => {
  test("has a file for every frame and the button's icon in colour and grey", () => {
    expect(Object.keys(files()).sort()).toEqual(
      [...Object.keys(FRAMES).map((n) => `${n}.png`), "icon.png", "icon-off.png"].sort(),
    );
  });

  test("sizes the frames for 96 points and the icon for 16, sharp on a Retina screen", () => {
    const all = files();
    expect(size(all["calm.png"])).toEqual({ width: S * FRAME_SCALE, height: S * FRAME_SCALE });
    expect(size(all["icon.png"])).toEqual({ width: ICON.size * ICON_SCALE, height: ICON.size * ICON_SCALE });
    expect(crop(raster({}), ICON.x, ICON.y, ICON.size)).toHaveLength(ICON.size);
  });

  test("are up to date in mods/parrot/frames (run bun run frames after changing the sprite)", () => {
    const all = files();
    const onDisk = readdirSync(framesDir).filter((n) => n.endsWith(".png")).sort();
    expect(onDisk).toEqual(Object.keys(all).sort());
    for (const [name, bytes] of Object.entries(all)) {
      expect(Buffer.compare(readFileSync(join(framesDir, name)), bytes)).toBe(0);
    }
  });
});
