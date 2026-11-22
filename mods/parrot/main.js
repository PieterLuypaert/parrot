// Parrot: a pixel parrot in the top right corner of the window that watches the tab's terminal. It
// sways while calm, tilts its head while a command runs and falls asleep when nothing happens for a
// while. It needs a terminal pane in the tab: a tab with only an agent session cannot turn it on.
//
// One mod, three roles, by props:
// - {button: true}: the tab bar's on/off button, which install.sh adds. It is the copy that is
//   always there, so it also opens and closes the parrot as the focus moves, and takes ⌥⌘P
//   (parrot.toggle).
// - {measure: true}: a strip two points high across the window, open for a moment, that tells the
//   button how wide the window is. Herdr gives mods no window size.
// - {perch: true}: the parrot itself, in a frameless window the button opens.
// `herdr-app do parrot.calm | parrot.watch | parrot.sleep` shows a mood for ten seconds.

import { View, div, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { checking, closeOverlay, focused, layout, nextCommand, notify, openOverlay, panes, props, setShared, shared, terminals, theme } from "herdr";
import { MOODS, PREVIEW_FOR, activity, blinkGap, corner, find, frame, mood, shows, watched } from "./mood.js";

const FRAMES = "mods/parrot/frames/";
const SIZE = 96;
const BOX = SIZE + 8;
const BUTTON = "parrot-button";
const KEY = "parrot-corner";
const ON = "parrot.on";
const OPEN = "parrot.open";
const OVERLAY = "parrot.overlay";
const WIDTH = "parrot.width";
const SETTLE = 1500;
const SWAY = { calm: { from: 0, to: 2, period: 2800 }, watch: { from: 0, to: 2, period: 2800 }, sleep: { from: 0, to: 3, period: 4200 } };

export default class Parrot extends View {
  init(_props, cx) {
    const p = props() ?? {};
    if (p.measure) return;
    if (p.button) return this.initButton(cx);
    // Only the button opens the parrot, in its corner. A window Herdr kept from an older version, or
    // one opened another way, closes at once.
    if (!p.perch) {
      if (!checking()) closeOverlay(p.overlay);
      return;
    }
    this.lastKey = null;
    this.lastActive = Date.now();
    this.blinking = false;
    this.preview = null;
    this.previews = 0;
    this.shown = "calm";
    if (checking()) return;
    setShared(OPEN, true);
    setShared(OVERLAY, p.overlay ?? null);
    this.blinkLater(cx);
    // Falling asleep is the one change nothing in Herdr announces, so look once a minute.
    cx.timer.every(60 * 1000, (cx) => { if (this.currentMood() !== this.shown) cx.notify(); });
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (MOODS.includes(command)) this.showFor(command, cx);
      }
    });
  }

  async close() {
    const p = props() ?? {};
    if (!p.perch) return;
    setShared(OPEN, false);
    setShared(OVERLAY, null);
  }

  initButton(cx) {
    this.since = Date.now();
    this.pending = 0;
    if (checking()) return;
    openOverlay({ mod: "parrot", props: { measure: true }, kind: "window", frame: "none", width: 1, height: 2, at: { x: 0, y: 0 } });
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (command !== "toggle") continue;
        // cx first: after a reload, the old build's loop ends here instead of toggling twice.
        cx.notify();
        this.toggle();
      }
    });
  }

  // On or off, from the button or ⌥⌘P. Turning it on needs a terminal in the tab to watch.
  toggle() {
    const on = shared(ON) === true;
    if (!on && !this.terminal()) {
      notify({ title: "Parrot needs a terminal", body: "Open a terminal pane in this tab: parrot watches shells, not agents.", level: "info" });
      return;
    }
    setShared(ON, !on);
  }

  terminal() {
    return watched(focused(), panes(), terminals());
  }

  // The button keeps the parrot in step with the tab: open while parrot is on and the tab has a
  // terminal to watch, closed otherwise. A change it asked for gets a moment to land before it asks
  // again.
  sync() {
    if (checking()) return;
    const want = shows({ on: shared(ON) === true, terminal: this.terminal() });
    const open = shared(OPEN) === true;
    if (want === open) { this.pending = 0; return; }
    if (Date.now() - this.pending < SETTLE) return;
    if (!want) {
      const id = shared(OVERLAY);
      if (id) closeOverlay(id);
      this.pending = Date.now();
      return;
    }
    const width = shared(WIDTH);
    if (!width || width.at < this.since) return;
    openOverlay({ mod: "parrot", props: { perch: true }, kind: "window", frame: "none", key: KEY, at: corner(width.points, layout(), BOX) });
    this.pending = Date.now();
  }

  blinkLater(cx) {
    cx.timer.after(blinkGap(), (cx) => {
      if (this.shown === "sleep") return this.blinkLater(cx);
      this.blinking = true;
      cx.notify();
      cx.timer.after(120, (cx) => {
        this.blinking = false;
        cx.notify();
        this.blinkLater(cx);
      });
    });
  }

  showFor(preview, cx) {
    const turn = ++this.previews;
    this.preview = preview;
    cx.notify();
    cx.timer.after(PREVIEW_FOR, (cx) => {
      if (turn !== this.previews) return;
      this.preview = null;
      cx.notify();
    });
  }

  currentMood() {
    const focus = focused();
    const terminal = watched(focus, panes(), terminals());
    const key = activity(focus, terminal);
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.lastActive = Date.now();
    }
    return mood({ terminal, idleFor: Date.now() - this.lastActive, preview: this.preview });
  }

  render() {
    const t = theme();
    const p = props() ?? {};
    if (p.measure) return this.measure();
    if (p.button) {
      this.sync();
      return this.button(t);
    }
    this.shown = this.currentMood();
    const picture = FRAMES + frame(this.shown, this.blinking) + ".png";
    return div().id("parrot").relative().w(BOX).h(BOX).cursor_pointer()
      .tooltip(this.shown === "sleep" ? "Parrot is asleep: click to wake it" : "Parrot")
      .on_click((_e, cx) => {
        this.lastActive = Date.now();
        this.preview = null;
        cx.notify();
      })
      .child(div().relative().top(0).loop("top", SWAY[this.shown]).child(image(picture).w(SIZE).h(SIZE)))
      .when(this.shown === "sleep", (el) => el.child(
        div().absolute().top(2).right(4).text_size(13).font_semibold().text_color(t.muted).frames(["z", "z z", "z z Z", ""], 700),
      ));
  }

  measure() {
    return div().id("parrot-measure").size_full().on_size_change((size) => {
      if (this.measured || !size?.width) return;
      this.measured = true;
      setShared(WIDTH, { points: Math.round(size.width), at: Date.now() });
      closeOverlay(props()?.overlay);
    });
  }

  // The tab bar's button, drawn as Chartroom's is, beside it in the tab bar's row. Lit while the
  // parrot is out; dim in a tab without a terminal to watch, where it cannot be turned on.
  button(t) {
    const on = shared(ON) === true;
    const can = Boolean(this.terminal());
    const lit = on && can;
    const tip = !can ? "Parrot needs a terminal pane in this tab: it watches shells, not agents (⌥⌘P)"
      : on ? "Parrot is on and watches this tab's terminal. Click to turn it off (⌥⌘P)"
        : "Parrot is off: click to turn it on (⌥⌘P)";
    const isLast = find(layout(), (n) => n.id === "tabs-row")?.children?.at(-1)?.id === BUTTON;
    return h_flex().size_full().pr(isLast ? 10 : 3).items_center().justify_end().bg(t.chrome).border_b(1).border_color(t.border)
      .child(h_flex().id(BUTTON).h(26).px(8).gap(5).flex_none().items_center().rounded(6).text_size(12)
        .bg(lit ? t.selected : t.chrome).text_color(lit ? t.foreground : can ? t.muted : t.dim)
        .hover((s) => s.bg(t.hover)).cursor_pointer()
        .tooltip(tip)
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click((_e, cx) => { this.toggle(); cx.notify(); })
        .child(image(FRAMES + (lit ? "icon.png" : "icon-off.png")).w(16).h(16))
        .child("Parrot"));
  }
}
