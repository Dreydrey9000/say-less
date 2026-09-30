# Attached rail and dock snapping

This change is stacked on the compact status island branch. It is a draft and has not replaced `/Applications/Say Less.app`.

## Verified

- Frontend production build, lint, formatting, and all 25 translation checks pass.
- The ten compact/learning checks pass across the initial run and targeted rerun. The new rail test checks flat 44px controls, inward placement, tooltip bounds, and hover dismissal. Keyboard focus reveals and reaches both actions.
- The broader UI pass covered desktop/mobile appearance and accessibility; the two initial failures passed on targeted rerun after correcting keyboard focus expectations.
- Four native geometry tests cover corner/side snapping, right-aligned emblem position, free placement outside the edge zone, and placement with the requested size after an asynchronous resize.
- The interaction video uses the actual dock renderer. Recording events are mocked and desktop movement is staged, rather than a recording of native dragging.

## Native acceptance still required

The rebuilt isolated Mac preview opened and expanded/collapsed through accessibility controls. The top-right expanded dock visibly painted across its full 460pt width and stayed on screen after the requested-size placement fix. The automation tool returned `noWindowsAvailable` for coordinate input on the nonactivating panel, so it could not complete a real drag gesture.

Before merging or installing this release, verify in the Mac preview:

1. Drag the emblem without opening the full dock; ordinary click still expands it.
2. Release near every corner and side; drag back into the middle to return to free placement.
3. Open/close the attached rail without moving the emblem, including the right edge.
4. Expand to the full dock and confirm every control paints across the whole window.
5. Hide, then Show Dock repeatedly; the dock remains visible and inside the current work area.
6. Repeat on a second monitor and after a display scale or work-area change.

The Mac snapping code waits for the actual left-button release and uses the current monitor's work area and scale. Windows/Linux retain manual placement through Appearance and switch to free placement when dragged; automatic release snapping is Mac-only.
