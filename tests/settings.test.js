import { describe, expect, test } from "bun:test";
import { DEFAULTS, MODELS, modelLabel, settingsFrom, withSetting } from "../mods/parrot/settings.js";

describe("settingsFrom", () => {
  test("starts on Sonnet when nothing is kept yet", () => {
    expect(settingsFrom(null)).toEqual(DEFAULTS);
    expect(settingsFrom(undefined).model).toBe("sonnet");
  });

  test("keeps a model it knows", () => {
    for (const { id } of MODELS) expect(settingsFrom({ model: id }).model).toBe(id);
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
