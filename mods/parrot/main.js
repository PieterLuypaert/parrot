// Parrot: a pixel parrot that stands on the work area and watches the focused shell. It sways while
// calm, tilts its head while a command runs and falls asleep when nothing happens for a while.
// It lives in a frameless window (mod.json), opened and closed by mod.open: ⌥⌘P or the tab bar's
// button. With props {button: true} this mod is that button, which install.sh puts in the tab bar.
// `herdr-app do parrot.calm | parrot.watch | parrot.sleep` shows a mood for ten seconds.

import { View, div, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { checking, closeOverlay, focused, layout, nextCommand, openOverlay, props, setShared, shared, terminals, theme } from "herdr";
import { MOODS, PREVIEW_FOR, activity, blinkGap, frame, mood, watched } from "./mood.js";

const FRAMES = "mods/parrot/frames/";
const SIZE = 96;
const BUTTON = "parrot-button";
const OPEN = "parrot.open";
const OVERLAY = "parrot.overlay";
const SWAY = { calm: { from: 0, to: 2, period: 2800 }, watch: { from: 0, to: 2, period: 2800 }, sleep: { from: 0, to: 3, period: 4200 } };

function find(node, id) {
  if (!node || typeof node !== "object") return null;
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const hit = find(child, id);
    if (hit) return hit;
  }
  return null;
}

export default class Parrot extends View {
  init(_props, cx) {
    if (props()?.button) return;
    this.lastKey = null;
    this.lastActive = Date.now();
    this.blinking = false;
    this.preview = null;
    this.shown = "calm";
    if (checking()) return;
    setShared(OPEN, true);
    setShared(OVERLAY, props()?.overlay ?? null);
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
    if (!props()?.button) setShared(OPEN, false);
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
    this.preview = preview;
    cx.notify();
    cx.timer.after(PREVIEW_FOR, (cx) => {
      if (this.preview !== preview) return;
      this.preview = null;
      cx.notify();
    });
  }

  currentMood() {
    const focus = focused();
    const terminal = watched(focus, terminals());
    const key = activity(focus, terminal);
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.lastActive = Date.now();
    }
    return mood({ terminal, idleFor: Date.now() - this.lastActive, preview: this.preview });
  }

  render() {
    const t = theme();
    if (props()?.button) return this.button(t);
    this.shown = this.currentMood();
    const picture = FRAMES + frame(this.shown, this.blinking) + ".png";
    return div().id("parrot").relative().w(SIZE + 8).h(SIZE + 8).cursor_pointer()
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

  // The tab bar's button, drawn as Chartroom's is, beside it in the tab bar's row. Lit while
  // parrot is on.
  button(t) {
    const on = shared(OPEN) === true;
    const isLast = find(layout(), "tabs-row")?.children?.at(-1)?.id === BUTTON;
    return h_flex().size_full().pr(isLast ? 10 : 3).items_center().justify_end().bg(t.chrome).border_b(1).border_color(t.border)
      .child(h_flex().id(BUTTON).h(26).px(8).gap(5).flex_none().items_center().rounded(6).text_size(12)
        .bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted).hover((s) => s.bg(t.hover)).cursor_pointer()
        .tooltip(on ? "Parrot is on: click to turn it off (⌥⌘P)" : "Parrot is off: click to turn it on (⌥⌘P)")
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click(() => this.toggle(on))
        .child(image(FRAMES + (on ? "icon.png" : "icon-off.png")).w(16).h(16))
        .child("Parrot"));
  }

  // Opened from the button, the parrot lands just under it; after you drag it, Herdr keeps its spot.
  toggle(on) {
    if (on) {
      const id = shared(OVERLAY);
      if (id) closeOverlay(id);
      setShared(OPEN, false);
      return;
    }
    openOverlay({ mod: "parrot", kind: "window", frame: "none", key: "parrot", keep: true, at: "pointer" });
  }
}
