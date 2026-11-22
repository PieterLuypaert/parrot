# Adds parrot's on/off button to a Herdr app layout, at the end of the tab bar's row, just after
# Chartroom's button when that is there. The tab bar's own mod stays as it is: where no row holds
# it yet, it goes into one, tabs-row, as Chartroom and Quarterdeck do, so they share it.
def button: { id: "parrot-button", type: "block", size: { px: 92 }, window_drag: true, content: { mod: "parrot", props: { button: true } } };
def after($id; $block):
  if any(.children[]; .id? == $id) then .children |= [.[] | if .id? == $id then ., $block else . end]
  else .children += [$block] end;
def tabs_row: { id: "tabs-row", type: "row", resizable: false, children: [(del(.size) + { size: { weight: 1 } }), button] } + (if .size then { size: .size } else {} end);

# The tab bar: the block called tabs, else the first block drawn by one of Herdr's tab bar mods
# (tabs in main, terminals-bar in terminals), whatever its id.
def is_block: type == "object" and .type? == "block";
def tab_bar: first(paths(is_block and .id? == "tabs")) // first(paths(is_block and ((.content.mod? // "") | . == "tabs" or . == "terminals-bar"))) // null;

if type != "object" or (.id? | type) != "string" then error("it is not a layout: its root has no id")
elif any(.. | objects; .id? == "parrot-button") then .
elif any(.. | objects; .id? == "tabs-row") then walk(if type == "object" and .id? == "tabs-row" then after("chartroom-button"; button) else . end)
else tab_bar as $at
  | if $at == null then error("it has no tab bar: a block with id \"tabs\", or one drawn by the tabs or terminals-bar mod")
    else setpath($at; getpath($at) | tabs_row) end
end
