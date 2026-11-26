import { describe, expect, test } from "bun:test";
import { DEFAULTS, MODELS, OFF_ON, modelLabel, settingsFrom, withSetting } from "../mods/parrot/settings.js";

describe("settingsFrom", () => {
  test("starts on Sonnet when nothing is kept yet", () => {
    expect(settingsFrom(null)).toEqual(DEFAULTS);
    expect(settingsFrom(undefined).model).toBe("sonnet");
  });

  test("keeps a model it knows", () => {
    for (const { id } of MODELS) expect(settingsFrom({ model: id }).model).toBe(id);
  });

  test("is not silent until you turn it on, and only by a real true", () => {
    expect(settingsFrom(null).silent).toBe(false);
    expect(settingsFrom({ silent: true }).silent).toBe(true);
    expect(settingsFrom({ silent: "yes" }).silent).toBe(false);
  });

  test("talks plainly until pirate talk is turned on", () => {
    expect(settingsFrom(null).pirate).toBe(false);
    expect(settingsFrom({ pirate: true }).pirate).toBe(true);
    expect(settingsFrom({ pirate: 1 }).pirate).toBe(false);
    expect(withSetting({ model: "haiku", silent: true }, "pirate", true)).toEqual({ model: "haiku", silent: true, pirate: true });
  });

  test("never passes on a model it does not know", () => {
    expect(settingsFrom({ model: "gpt-4" }).model).toBe("sonnet");
    expect(settingsFrom({ model: "--dangerously-skip-permissions" }).model).toBe("sonnet");
    expect(settingsFrom({ model: 7 }).model).toBe("sonnet");
  });
});

describe("withSetting", () => {
  test("changes one setting", () => {
    expect(withSetting(null, "model", "opus")).toEqual({ ...DEFAULTS, model: "opus" });
  });

  test("turns silent mode on and off, keeping the model", () => {
    const on = withSetting({ model: "opus" }, "silent", true);
    expect(on).toEqual({ ...DEFAULTS, model: "opus", silent: true });
    expect(withSetting(on, "silent", false)).toEqual({ ...DEFAULTS, model: "opus", silent: false });
    expect(OFF_ON.map((one) => one.id)).toEqual([false, true]);
  });

  test("leaves the settings as they were for a value or a key it does not know", () => {
    expect(withSetting({ model: "haiku" }, "model", "gpt-4").model).toBe("haiku");
    expect(withSetting({ model: "haiku" }, "colour", "red")).toEqual({ ...DEFAULTS, model: "haiku" });
  });
});

describe("modelLabel", () => {
  test("names each model as the settings strip does", () => {
    expect(MODELS.map((one) => modelLabel(one.id))).toEqual(["Haiku", "Sonnet", "Opus"]);
  });
});
