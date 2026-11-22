// Which mood the parrot is in, whether it shows and where it lands, from what Herdr reports. No
// Herdr imports, so it is tested with bun test.

export const SLEEP_AFTER = 10 * 60 * 1000;
export const PREVIEW_FOR = 10 * 1000;
export const MOODS = ["calm", "watch", "sleep"];
export const MARGIN = 16;

const SHELLS = ["zsh", "bash", "fish", "sh", "dash", "nu", "pwsh"];

// A shell session: a terminal started as a shell (zsh, bash, ...). It stays one while a command
// runs in it, and is not one while an agent such as Claude Code runs in it.
export function isShell(terminal) {
  const exe = String(terminal?.argv?.[0] ?? "").split("/").pop().replace(/^-/, "");
  return SHELLS.includes(exe) || Boolean(terminal?.program?.shell);
}

export function isAgent(focus, terminal) {
  return Boolean(focus?.agent || terminal?.program?.agent || terminal?.status);
}

// The terminal the parrot watches: a shell session in the focused tab where no agent runs (an
// agent has a Claude of its own). The focused pane when it is one, else the tab's first, so the
// parrot keeps watching the terminal beside an agent while you type to the agent.
export function watched(focus, panes, list) {
  if (!focus?.tab) return null;
  const shell = (address, agent) => {
    const terminal = list.find((one) => one.address === address);
    return terminal && !isAgent({ agent }, terminal) && isShell(terminal) ? terminal : null;
  };
  const own = focus.terminal ? shell(focus.terminal, focus.agent) : null;
  if (own) return own;
  for (const pane of panes) {
    if (pane.tab !== focus.tab || !pane.terminal || pane.status || pane.program?.agent) continue;
    const terminal = shell(pane.terminal, null);
    if (terminal) return terminal;
  }
  return null;
}

// Parrot can be turned on in a tab with a terminal to watch; a tab with only an agent has none.
// It shows while it is on and there is one.
export function shows({ on, terminal }) {
  return Boolean(on && terminal);
}

// A shell runs a command when what runs in it now is not the shell itself.
export function runsCommand(terminal) {
  if (!terminal) return false;
  if (terminal.program) return !terminal.program.shell && !terminal.program.agent;
  const now = terminal.foreground?.pid;
  return Boolean(now && terminal.pid && now !== terminal.pid);
}

// What counts as something happening: another pane taking the focus, or another program in it.
export function activity(focus, terminal) {
  return [focus?.terminal ?? "", terminal?.program?.key ?? "", terminal?.program?.name ?? "", terminal?.foreground?.pid ?? ""].join("|");
}

export function mood({ terminal, idleFor, preview }) {
  if (preview) return preview;
  if (runsCommand(terminal)) return "watch";
  if (idleFor >= SLEEP_AFTER) return "sleep";
  return "calm";
}

// The picture for a mood, with its eyes shut while it blinks. Asleep, they are shut anyway.
export function frame(current, blinking) {
  if (!blinking || current === "sleep") return current;
  return current === "watch" ? "watch-blink" : "blink";
}

// Four to seven seconds between blinks, as a real bird does it: never on a beat.
export function blinkGap(random = Math.random) {
  return 4000 + Math.floor(random() * 3000);
}

export function find(node, test) {
  if (!node || typeof node !== "object") return null;
  if (test(node)) return node;
  for (const child of node.children ?? []) {
    const hit = find(child, test);
    if (hit) return hit;
  }
  return null;
}

// Where the parrot lands in a window `width` points wide: in the top right corner, under the tab
// bar and the panes' title bars, so it covers neither the tabs nor a pane's buttons.
export function corner(width, layout, size) {
  const bar = find(layout, (n) => n.id === "tabs-row") ?? find(layout, (n) => n.id === "tabs");
  const header = find(layout, (n) => n.header && n.header.position !== "bottom")?.header;
  return {
    x: Math.max(0, Math.round(width - size - MARGIN)),
    y: (bar?.size?.px ?? 42) + (header?.height ?? 0) + 8,
  };
}
