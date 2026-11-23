// Which mood the parrot is in, whether it shows and where it lands, from what Herdr reports. No
// Herdr imports, so it is tested with bun test.

export const SLEEP_AFTER = 10 * 60 * 1000;
export const PREVIEW_FOR = 10 * 1000;
export const MOODS = ["calm", "watch", "sleep", "think", "alarm", "dance"];
export const DANCE = ["dance-a", "dance-b", "dance-c", "dance-b"];
export const DANCE_BEAT = 190;
export const DANCE_BEATS = 16;
export const MARGIN = 16;

const SHELLS = ["zsh", "bash", "fish", "sh", "dash", "nu", "pwsh"];

// A shell session: a terminal started as a shell (zsh, bash, ...). It stays one while a command
// runs in it, and is not one while an agent such as Claude Code runs in it.
export function isShell(terminal) {
  return Boolean(shellOf(terminal) || terminal?.program?.shell);
}

// The shell a terminal was started as, by name, when it is one parrot knows.
export function shellOf(terminal) {
  const exe = String(terminal?.argv?.[0] ?? "").split("/").pop().replace(/^-/, "");
  return SHELLS.includes(exe) ? exe : null;
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

export function mood({ terminal, idleFor, preview, thinking, alarm, dancing }) {
  if (preview) return preview;
  if (dancing) return "dance";
  if (thinking) return "think";
  if (alarm) return "alarm";
  if (runsCommand(terminal)) return "watch";
  if (idleFor >= SLEEP_AFTER) return "sleep";
  return "calm";
}

// The picture for a mood, with its eyes shut while it blinks. Asleep they are shut anyway; thinking
// or startled it does not blink, and dancing it steps through its moves by the beat.
export function frame(current, blinking, beat = 0) {
  if (current === "dance") return DANCE[beat % DANCE.length];
  if (!blinking || current === "sleep" || current === "think" || current === "alarm") return current;
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
// The panes' title bar is set on the block that holds them (content.pane.header), or on a node.
function titleBar(node) {
  const header = node.content?.pane?.header ?? node.header;
  return header && header.position !== "bottom" ? header : null;
}

// The block that holds the tab's panes: its content names the tab (content.tab) or how panes look.
function holdsPanes(node) {
  const content = node?.content;
  return Boolean(content && typeof content === "object" && ("tab" in content || content.pane));
}

// The nodes from the root down to the first one `test` accepts.
function pathTo(node, test, trail = []) {
  if (!node || typeof node !== "object") return null;
  const here = [...trail, node];
  if (test(node)) return here;
  for (const child of node.children ?? []) {
    const path = pathTo(child, test, here);
    if (path) return path;
  }
  return null;
}

// The points shown panels with a fixed width take on the right of the panes, such as Chartroom's
// or Quarterdeck's when they are open, so the parrot never lands on one.
export function rightPanels(layout) {
  const path = pathTo(layout, holdsPanes) ?? pathTo(layout, (n) => n.id === "tabs-row") ?? [];
  let taken = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const row = path[i];
    if (row.type !== "row") continue;
    const siblings = row.children ?? [];
    for (const panel of siblings.slice(siblings.indexOf(path[i + 1]) + 1)) {
      if (panel.hidden || !panel.size?.px) continue;
      taken += panel.size.px + (row.divider?.width ?? 0);
    }
  }
  return taken;
}

// With Herdr zoomed in, the window's width and a window's place are in screen points, while the
// tab bar, the panels and the parrot itself are drawn `zoom` times as big.
export function corner(width, layout, size, zoom = 1) {
  const bar = find(layout, (n) => n.id === "tabs-row") ?? find(layout, (n) => n.id === "tabs");
  const holder = find(layout, (n) => Boolean(titleBar(n)));
  const header = holder ? titleBar(holder) : null;
  return {
    x: Math.max(0, Math.round(width - zoom * (rightPanels(layout) + size + MARGIN))),
    y: Math.round(zoom * ((bar?.size?.px ?? 42) + (header?.height ?? 0) + 8)),
  };
}

// Herdr's zoom, 1 when it is not set.
export function zoomOf(settings) {
  const zoom = Number(settings?.zoom);
  return zoom > 0 ? zoom : 1;
}

export function samePlace(a, b) {
  return Boolean(a && b && a.x === b.x && a.y === b.y);
}
