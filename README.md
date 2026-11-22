# Parrot

A pixel parrot for the [Herdr app](https://herdr.dev) that stands on your work area and watches your shells. Later versions let it spot errors, in the terminal and beyond, and explain them with your own Claude, with the fix as one button. The plan, in Dutch, is in [PLAN.md](PLAN.md), and a sketch of where it is going is in [sketch/moods.html](sketch/moods.html).

**0.2.0, chat with parrot:** it stands without a frame in the top right corner of the window and watches the terminal in your tab. It sways while all is calm, tilts its head while a command runs and falls asleep after ten quiet minutes. Click it to ask your own Claude anything about the terminal's project. It watches shells, not agents: a tab with only an agent session cannot turn it on, and beside one it keeps watching the terminal while you type to the agent.

## Install

Needs the Herdr app and `jq`. Clone this repo to a folder that stays, then run its installer with the Herdr app open:

```sh
./install.sh
```

It links the mod, binds `⌥⌘P` and adds a **Parrot** button to your layout's tab bar, just after Chartroom's when that is there. Herdr replaces its own layouts on every start, so when one of those is shown, `install.sh` puts the button into a copy of it, such as `main-parrot`, and shows that. Every file it changes is kept beside it first. After pulling, run `./install.sh` again.

## Use

- **Parrot** in the tab bar, or `⌥⌘P`, turns the parrot on or off. It needs a terminal pane in the tab; without one the button is dim and tells you so.
- It lands in the top right corner of the panes, under the tab bar and the panes' title bars, and moves left of a panel such as Quarterdeck's or Chartroom's while that is open.
- A click on the parrot, or `⌥⇧⌘P`, opens the chat beside it. Asleep, the click wakes it too.
- `herdr-app do parrot.calm`, `parrot.watch`, `parrot.sleep` or `parrot.think` shows a mood for ten seconds.

## Chat

Ask about the project of the terminal in your tab: how something works, where something lives, why a command failed. The chat opens beside the parrot in its colours, stays put, and moves along when the parrot does. It follows the tab, with one conversation per git project (a `cd` into a subfolder keeps it); follow-up questions continue it, and **New chat** starts that project over.

Every question goes to your own Claude, on your own subscription, the way Chartroom asks it: `claude -p` in the terminal's folder, with no MCP servers and none of your hooks or plugins. Nothing goes to Claude until you ask. The parrot thinks while it waits; an answer that reads files takes half a minute or so on Sonnet.

What Claude uses to answer:

- your question, and the conversation so far in that project;
- the terminal's folder, its branch and its last 60 lines, with keys, tokens and passwords masked first;
- the project's files, which Claude picks and reads itself with Read, Grep and Glob: it runs no commands and changes nothing;
- your own Claude context, as Claude Code loads it in that folder: your `~/.claude/CLAUDE.md`, the project's `CLAUDE.md` and your auto-memory for that folder.

## Development

```sh
bun test                         # the sprite, the moods, the chat's questions and the layout change
bun run frames                   # draw the frames again after changing scripts/sprite.js
herdr-app check mods/parrot      # load the mod once
```

The app does not see edits behind the installed link: run `./install.sh` again, or turn the parrot off and on.

## License

[MIT](LICENSE)
