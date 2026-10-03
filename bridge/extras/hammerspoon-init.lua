-- Say Less tools — global hotkeys (Luis, 2026-09-29)
local function launch(name)
  return function() hs.execute('open -a "' .. name .. '"') end
end
hs.hotkey.bind({"cmd","alt"}, "T", "Title Ideas", launch("Title Ideas"))
hs.hotkey.bind({"cmd","alt"}, "I", "Say Less Image", launch("Say Less Image"))
hs.hotkey.bind({"cmd","alt"}, "L", "Say Less Recordings", launch("Say Less Recordings"))
hs.hotkey.bind({"cmd","alt"}, "S", "Read Screens", launch("Read Screens"))
hs.menuBarIcon = "SL"
hs.alert.show("Say Less hotkeys live: ⌥⌘T titles · ⌥⌘I image · ⌥⌘L recordings · ⌥⌘S read screens")
