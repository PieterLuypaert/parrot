# Changelog

All notable changes to parrot are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [semver](https://semver.org).

## [Unreleased]

## [0.1.0] - 2026-11-22

The parrot on the map.

### Added

- A pixel parrot in a frameless window in the top right corner of the window, watching the terminal in your tab. It sways while all is calm, tilts its head while a command runs, falls asleep after ten quiet minutes and blinks now and then.
- It watches shells, not agents: a tab with only an agent session cannot turn it on, and beside one it keeps watching the terminal while you type to the agent.
- A **Parrot** button in the tab bar, just after Chartroom's, and `⌥⌘P` (`parrot.toggle`) to turn it on or off. The button is lit while the parrot is out and dim in a tab without a terminal.
- `install.sh`: links the mod, binds the key and adds the button, keeping every file it changes beside it first. Herdr's own layouts get a copy.
- `herdr-app do parrot.calm | parrot.watch | parrot.sleep` shows a mood for ten seconds.
- The frames are drawn from one sprite definition (`scripts/sprite.js`), the same parrot as in the sketch.
- The plan (`PLAN.md`, plan version 3, with the spike's findings) and a visual sketch in English of parrot's moods and three flows: an error in the terminal, an error outside it, and a question (`sketch/moods.html`).
