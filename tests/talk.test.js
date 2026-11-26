import { describe, expect, test } from "bun:test";
import { LINE_KEYS, say } from "../mods/parrot/talk.js";

describe("say", () => {
  test("has a plain and a pirate version of every line, and they differ", () => {
    for (const key of LINE_KEYS) {
      const plain = say(key, false, "shop");
      const pirate = say(key, true, "shop");
      expect([key, typeof plain, typeof pirate]).toEqual([key, "string", "string"]);
      expect([key, plain === pirate]).toEqual([key, false]);
    }
  });

  test("talks plainly by default", () => {
    expect(say("thinking")).toBe("Your Claude is thinking");
    expect(say("ask")).toBe("Shall I explain it, or fix it?");
  });

  test("puts the project's name in a line that takes one", () => {
    expect(say("emptyTitle", false, "shop")).toBe("Ask anything about shop");
    expect(say("emptyTitle", true, "shop")).toBe("Ask anything about shop, matey");
  });

  test("says so when a line is missing, instead of showing nothing", () => {
    expect(() => say("nope")).toThrow("parrot has no line called nope");
  });
});
