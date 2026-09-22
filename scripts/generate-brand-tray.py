"""Render original simplified Say Less tray marks with librsvg."""
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[1]
out = root / 'src-tauri/resources'
source = root / 'docs/diagrams/say-less-tray.svg'
mark = '<path d="M46 14H26c-15 0-17 17-2 20l13 2c13 3 10 16-3 16H18l-8 8 2-16h21c5 0 6-5 1-6l-13-3C-2 30 6 6 26 6h24z" fill="{color}"/>'
source.write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' + mark.format(color='currentColor') + '</svg>\n')
for suffix, color in [('', '#ffffff'), ('_dark', '#111318')]:
    for state in ['idle', 'recording', 'transcribing', 'idle_warning']:
        badge = ''
        if state != 'idle':
            badge = '<circle cx="49" cy="46" r="14" fill="' + ('#111318' if suffix == '' else '#ffffff') + '"/>'
            if state == 'recording': badge += '<circle cx="49" cy="46" r="9" fill="#ef4444"/>'
            if state == 'transcribing': badge += '<path d="M42 42h14M42 47h14M42 52h9" stroke="' + color + '" stroke-width="3"/>'
            if state == 'idle_warning': badge += '<path d="M49 35v13m0 5v3" stroke="#f59e0b" stroke-width="5"/>'
        svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' + mark.format(color=color) + badge + '</svg>'
        subprocess.run(['rsvg-convert', '-w', '64', '-h', '64', '-o', str(out / f'tray_{state}{suffix}.png')], input=svg.encode(), check=True)
