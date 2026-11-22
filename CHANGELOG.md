# Changelog

All notable changes to parrot are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [semver](https://semver.org).

## [Unreleased]

## [0.2.0] - 2026-11-22

Chat with parrot.

### Added

- A click on the parrot, or `⌥⇧⌘P` (`parrot.chat`), opens a chat beside it about the project of the terminal in your tab. It follows the tab, keeps one conversation per project (its last 40 messages, the 12 projects talked about last) and starts a project over with **New chat**.
- Questions go to your own Claude on your own subscription, as Chartroom asks it: `claude -p` in the terminal's folder with only Read, Grep and Glob, no MCP servers and none of your hooks or plugins, and `--resume` for follow-ups. The terminal's branch and last 60 lines go along, with keys, tokens and passwords masked.
- A thinking mood while Claude works on a question, and `parrot.think` to preview it.

### Changed

- Plan versions 4 and 5: the chat comes first; errors outside the terminal are out of scope for now, and a mistyped command gets a suggestion in 0.3.0.

### Fixed

- The parrot lands under the panes' title bar also where the layout sets it on the block that holds the panes.

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
