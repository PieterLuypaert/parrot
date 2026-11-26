// Parrot's settings, as the chat's settings strip shows them and shared state keeps them. No Herdr
// imports, so it is tested with bun test.

// The models the chat can ask on, fastest first. The quick guesses after a typo stay on Haiku.
export const MODELS = [
  { id: "haiku", label: "Haiku", tip: "The fastest: quick questions get a quick answer" },
  { id: "sonnet", label: "Sonnet", tip: "Quick and sharp, for most questions" },
  { id: "opus", label: "Opus", tip: "The deepest, for hard questions: it takes longer" },
];

export const DEFAULTS = { model: "sonnet", silent: false, pirate: false };

// An on/off setting's two choices, as the settings strip shows them.
export const OFF_ON = [{ id: false, label: "Off" }, { id: true, label: "On" }];

// The settings as kept, with anything missing or unknown at its default, so an older or broken
// value never reaches Claude.
export function settingsFrom(kept) {
  const model = MODELS.some((one) => one.id === kept?.model) ? kept.model : DEFAULTS.model;
  return { model, silent: kept?.silent === true, pirate: kept?.pirate === true };
}

// The settings with one changed; a value it does not know leaves them as they were.
export function withSetting(kept, key, value) {
  const now = settingsFrom(kept);
  if (!(key in now)) return now;
  const next = settingsFrom({ ...now, [key]: value });
  return next[key] === value ? next : now;
}

export function modelLabel(id) {
  return MODELS.find((one) => one.id === id)?.label ?? id;
}
