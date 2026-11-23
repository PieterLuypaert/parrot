import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const script = join(import.meta.dir, "..", "layout.jq");
const undo = join(import.meta.dir, "..", "unlayout.jq");

function apply(layout, file = script) {
  const run = Bun.spawnSync(["jq", "-c", "-f", file], { stdin: Buffer.from(JSON.stringify(layout)) });
  if (run.exitCode !== 0) throw new Error(run.stderr.toString().trim());
  return JSON.parse(run.stdout.toString());
}

function ids(node) {
  return (node.children ?? []).map((child) => child.id);
}

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const hit = find(child, id);
    if (hit) return hit;
  }
  return null;
}

const tabs = { id: "tabs", type: "block", size: { px: 42 }, window_drag: true, content: { mod: "tabs" } };
const work = { id: "work", type: "block", content: { mod: "terminals-pane" } };

describe("layout.jq", () => {
  test("puts the button just after Chartroom's in a shared tab bar row", () => {
    const layout = {
      id: "root", type: "column",
      children: [{
        id: "tabs-row", type: "row", size: { px: 42 },
        children: [
          { ...tabs, size: { weight: 1 } },
          { id: "chartroom-button", type: "block", size: { px: 108 } },
          { id: "quarterdeck-button", type: "block", size: { px: 124 } },
        ],
      }, work],
    };
    expect(ids(find(apply(layout), "tabs-row"))).toEqual(["tabs", "chartroom-button", "parrot-button", "quarterdeck-button"]);
  });

  test("ends the row with the button when Chartroom is not there", () => {
    const layout = { id: "root", type: "column", children: [{ id: "tabs-row", type: "row", children: [tabs, { id: "quarterdeck-button", type: "block" }] }] };
    expect(ids(find(apply(layout), "tabs-row"))).toEqual(["tabs", "quarterdeck-button", "parrot-button"]);
  });

  test("wraps Herdr's own tab bar in a row and keeps its size", () => {
    const layout = { id: "root", type: "row", children: [{ id: "sidebar", type: "block" }, { id: "main", type: "column", children: [tabs, work] }] };
    const row = find(apply(layout), "tabs-row");
    expect(ids(row)).toEqual(["tabs", "parrot-button"]);
    expect(row.size).toEqual({ px: 42 });
    expect(find(row, "tabs").size).toEqual({ weight: 1 });
    expect(find(row, "tabs").content).toEqual({ mod: "tabs" });
  });

  test("finds a tab bar by the mod that draws it", () => {
    const layout = { id: "root", type: "column", children: [{ id: "bar", type: "block", content: { mod: "terminals-bar" } }, work] };
    expect(ids(find(apply(layout), "tabs-row"))).toEqual(["bar", "parrot-button"]);
  });

  test("fills a tabs row that has no children yet", () => {
    const layout = { id: "root", type: "column", children: [{ id: "tabs-row", type: "row" }] };
    expect(ids(find(apply(layout), "tabs-row"))).toEqual(["parrot-button"]);
  });

  test("leaves a layout that has the button already as it is", () => {
    const layout = { id: "root", type: "column", children: [{ id: "tabs-row", type: "row", children: [tabs, { id: "parrot-button", type: "block" }] }] };
    expect(apply(layout)).toEqual(layout);
  });

  test("refuses a layout without a tab bar, or that is no layout", () => {
    expect(() => apply({ id: "root", type: "column", children: [work] })).toThrow("it has no tab bar");
    expect(() => apply({ type: "column" })).toThrow("it is not a layout");
  });
});

describe("unlayout.jq", () => {
  test("gives back Herdr's own tab bar as it was, row and all", () => {
    const layout = { id: "root", type: "row", children: [{ id: "sidebar", type: "block" }, { id: "main", type: "column", children: [tabs, work] }] };
    expect(apply(apply(layout), undo)).toEqual(layout);
  });

  test("keeps a shared row with the other buttons in it", () => {
    const layout = {
      id: "root", type: "column",
      children: [{ id: "tabs-row", type: "row", size: { px: 42 }, children: [{ ...tabs, size: { weight: 1 } }, { id: "chartroom-button", type: "block" }] }, work],
    };
    expect(apply(apply(layout), undo)).toEqual(layout);
  });

  test("leaves a layout without the button as it is", () => {
    const layout = { id: "root", type: "column", children: [tabs, work] };
    expect(apply(layout, undo)).toEqual(layout);
  });
});
