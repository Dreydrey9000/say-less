#!/usr/bin/env bash
# macOS 27 beta leaves extra "Say Less" tiles in the Dock: one for every window
# the app opens after its first, and they stay after you quit. Restarting the
# Dock removes them (your pinned apps are untouched).
killall Dock
