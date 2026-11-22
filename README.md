# Parrot

A pixel parrot for the [Herdr app](https://herdr.dev) that stands on your work area and watches your shells. Later versions let it spot errors, in the terminal and beyond, and explain them with your own Claude, with the fix as one button. The plan, in Dutch, is in [PLAN.md](PLAN.md), and a sketch of where it is going is in [sketch/moods.html](sketch/moods.html).

**0.1.0, the parrot on the map:** it stands without a frame in the top right corner of the window and watches the terminal in your tab. It sways while all is calm, tilts its head while a command runs and falls asleep after ten quiet minutes. It watches shells, not agents: a tab with only an agent session cannot turn it on, and beside one it keeps watching the terminal while you type to the agent.

## Install

Needs the Herdr app and `jq`. Clone this repo to a folder that stays, then run its installer with the Herdr app open:

```sh
./install.sh
```

It links the mod, binds `⌥⌘P` and adds a **Parrot** button to your layout's tab bar, just after Chartroom's when that is there. Herdr replaces its own layouts on every start, so when one of those is shown, `install.sh` puts the button into a copy of it, such as `main-parrot`, and shows that. Every file it changes is kept beside it first. After pulling, run `./install.sh` again.

## Use

- **Parrot** in the tab bar, or `⌥⌘P`, turns the parrot on or off. It needs a terminal pane in the tab; without one the button is dim and tells you so.
- It lands in the top right corner, under the tab bar and the panes' title bars. Drag it anywhere and Herdr keeps that spot.
- Asleep, a click wakes it.
- `herdr-app do parrot.calm`, `parrot.watch` or `parrot.sleep` shows a mood for ten seconds.

## Development

```sh
bun test                         # the sprite, the moods and the layout change
bun run frames                   # draw the frames again after changing scripts/sprite.js
herdr-app check mods/parrot      # load the mod once
```

The app does not see edits behind the installed link: run `./install.sh` again, or turn the parrot off and on.

## License

[MIT](LICENSE)
