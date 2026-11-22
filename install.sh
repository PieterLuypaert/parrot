#!/bin/sh
# Puts parrot into the Herdr app: links the mod into ~/.config/herdr-app/mods, binds cmd-alt-p (turn
# the parrot on or off) in keys.json, and adds the on/off button to the tab bar of a layout of your
# own, just after Chartroom's when that is there.
# Herdr replaces its own layouts (main, terminals, win98) on every start, so for one of those the
# button goes into a copy, <name>-parrot, which it makes and shows while the app is open. Run it
# again any time, after a pull too: the mod is linked anew (from whichever parrot checkout runs it),
# keys and layouts already set are left alone, and every file it changes is kept beside it first.
#
#   ./install.sh [layout]     the layout to add the button to; default: the one shown now
set -eu

here=$(cd "$(dirname "$0")" && pwd -P)
app_home="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
stamp=$(date +%Y%m%d-%H%M%S)

fail() { echo "install: $*" >&2; exit 1; }

# herdr-app, the Herdr app's command line: from the PATH, else from ~/.local/bin, which a new
# terminal on macOS does not search.
herdr=$(command -v herdr-app 2>/dev/null || true)
if [ -z "$herdr" ] && [ -x "$HOME/.local/bin/herdr-app" ]; then herdr="$HOME/.local/bin/herdr-app"; fi
[ -n "$herdr" ] || fail "needs herdr-app, the Herdr app's command line, on the PATH or in ~/.local/bin"
command -v jq >/dev/null 2>&1 || fail "needs jq on the PATH (brew install jq)"
[ -d "$app_home/layouts" ] || fail "no Herdr app at $app_home: open the app once first"

version=$(jq -r .version "$here/package.json")

is_parrot_link() {
  case "$(readlink "$1")" in
    */mods/parrot) return 0 ;;
    *) return 1 ;;
  esac
}

# The app does not see edits behind the link, so linking again is what makes it load the mod anew
# (after a pull, say). A link to another parrot checkout points here instead; anything else at that
# place is left alone.
link_mod() {
  src="$here/mods/parrot" dest="$app_home/mods/parrot"
  if [ -L "$dest" ] && is_parrot_link "$dest"; then
    from=$(readlink "$dest")
    rm "$dest" && ln -s "$src" "$dest"
    if [ "$from" = "$src" ]; then echo "mod: linked again, so the app loads it anew"; else echo "mod: linked here instead of $from"; fi
    return
  fi
  if [ -e "$dest" ] || [ -L "$dest" ]; then fail "$dest is there already and is not a parrot checkout's mod: move it aside first"; fi
  ln -s "$src" "$dest"
  echo "mod: linked $dest"
}

# Each key in keys.json: added when free, and moved to its new action when it still does one parrot
# gave it before (mod.open:parrot or a parrot.* command). A key the person bound to something else
# is left alone. keys.json is kept beside it once before the first change, unless this makes it.
add_keys() {
  keys="$app_home/keys.json" ours="$here/keys.json" kept=""
  if [ ! -f "$keys" ]; then echo '{}' >"$keys" && kept=new; fi
  for key in $(jq -r '.global | keys[]' "$ours"); do
    action=$(jq -r --arg k "$key" '.global[$k]' "$ours")
    bound=$(jq -r --arg k "$key" '.global[$k] // empty' "$keys")
    if [ "$bound" = "$action" ]; then echo "key: $key already does $action"; continue; fi
    case "$bound" in
      ""|mod.open:parrot|parrot.*) ;;
      *) echo "key: $key does $bound; bind $action to a free key in $keys yourself" >&2; continue ;;
    esac
    if [ -z "$kept" ]; then cp "$keys" "$keys.backup-$stamp" && kept=yes; fi
    # Written beside it first, so a failing jq leaves keys.json as it was.
    jq --arg k "$key" --arg a "$action" '.global[$k] = $a' "$keys" >"$keys.tmp" || { rm -f "$keys.tmp"; fail "could not set $key in $keys"; }
    mv "$keys.tmp" "$keys"
    echo "key: $key does $action${bound:+ (it did $bound)}"
  done
  if [ "$kept" = yes ]; then echo "key: keys.json was kept as keys.json.backup-$stamp"; fi
}

shown_layout() {
  jq -r '.layout // "main"' "$app_home/shared.json" 2>/dev/null || echo main
}

# The layout the button goes into, in $layout. It is tried first, so a layout that cannot take the
# button changes nothing. One of Herdr's own is replaced on every start, so it goes into a copy,
# <name>-parrot: made with layout.clone, which also shows it, or shown when an earlier install made
# it. Both need the app open; with it closed, nothing is changed.
own_layout() {
  layout=$1
  [ -f "$app_home/layouts/$layout.json" ] || fail "there is no layout $app_home/layouts/$layout.json"
  why=$(jq -f "$here/layout.jq" "$app_home/layouts/$layout.json" 2>&1 >/dev/null) \
    || fail "the button cannot go into $layout: $(echo "$why" | sed 's/^jq: error (at [^)]*): //')"
  jq -e --arg n "layout:$layout" 'has($n)' "$app_home/installed.json" >/dev/null 2>&1 || return 0
  copy="$layout-parrot"
  if ! "$herdr" status >/dev/null 2>&1; then
    fail "$layout is one of Herdr's own layouts, which Herdr replaces on every start, so the button goes into a copy of it, $copy. Open the Herdr app and run this again: it makes the copy and shows it."
  fi
  if [ -f "$app_home/layouts/$copy.json" ]; then
    "$herdr" "do" layout.switch "{\"name\":\"$copy\"}" >/dev/null || fail "could not show $copy"
    echo "layout: $layout is one of Herdr's own; showing $copy, the copy an earlier install made"
  else
    "$herdr" "do" layout.clone "{\"name\":\"$layout\",\"as\":\"$copy\"}" >/dev/null || fail "could not copy $layout to $copy"
    tries=0
    while [ ! -f "$app_home/layouts/$copy.json" ] && [ "$tries" -lt 50 ]; do sleep 0.1; tries=$((tries + 1)); done
    [ -f "$app_home/layouts/$copy.json" ] || fail "Herdr did not write $copy"
    echo "layout: $layout is one of Herdr's own, which it replaces on every start; the button goes into a copy, $copy, shown now (ctrl-shift-l switches layouts)"
  fi
  layout=$copy
}

add_button() {
  name=$1 file="$app_home/layouts/$1.json"
  if jq -e '[.. | objects | select(.id? == "parrot-button")] | length > 0' "$file" >/dev/null; then echo "layout: $name has the button already"; return; fi
  cp "$file" "$file.old-$stamp"
  jq -f "$here/layout.jq" "$file.old-$stamp" >"$file.tmp" || { rm -f "$file.tmp"; fail "could not add the button to $name"; }
  mv "$file.tmp" "$file"
  echo "layout: added the button to $name's tab bar ($name.json was kept as $name.json.old-$stamp)"
}

echo "parrot $version"
own_layout "${1:-$(shown_layout)}"
link_mod
add_keys
add_button "$layout"
"$herdr" check "$app_home/mods/parrot"
echo "Parrot in the tab bar, or cmd-alt-p, turns the parrot on or off."
