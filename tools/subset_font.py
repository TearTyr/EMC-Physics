#!/usr/bin/env python3
"""Subset the licensed FOT-Yuruka Std TTF to the characters this site uses.

Why: the full Japanese TTF is ~4.5 MB; every visitor would download it.
The subset (Latin + Latin-1 + Greek + punctuation + arrows + maths symbols,
i.e. everything the prose, labels and readouts actually contain) is typically
~40-80 KB as woff2 - a 98% payload cut with no visual difference here.

Usage:
    pip install fonttools brotli
    python3 tools/subset_font.py                 # defaults to fot-yuruka-std.ttf
    python3 tools/subset_font.py path/to/other.ttf
    npm run font:scan                            # manifest then prefers the woff2

The original .ttf stays untouched as the source of truth; the loader picks the
woff2 automatically because the scanner lists alternates woff2-first.
"""
import sys, subprocess
from pathlib import Path

src = Path(sys.argv[1] if len(sys.argv) > 1 else 'vendor/fonts/fot-yuruka-std.ttf')
if not src.exists():
    sys.exit(f'{src} not found - copy your licensed TTF there first')
dst = src.with_suffix('.woff2')

UNICODES = ','.join([
    'U+0020-007E',   # basic latin
    'U+00A0-00FF',   # latin-1: degree, plus/minus, micro, middot, curly quotes
    'U+0370-03FF',   # greek: alpha beta theta lambda mu pi sigma phi omega ...
    'U+2000-206F',   # general punctuation: dashes, ellipsis, narrow spaces
    'U+2070-209F',   # super/subscripts (legacy prose fragments)
    'U+2190-21FF',   # arrows
    'U+2200-22FF',   # mathematical operators: times div integral proportional
])
cmd = [sys.executable, '-m', 'fontTools.subset', str(src),
       f'--unicodes={UNICODES}', '--layout-features=*',
       f'--output-file={dst}', '--flavor=woff2']
try:
    subprocess.run(cmd, check=True)
except (subprocess.CalledProcessError, OSError):
    sys.exit('fonttools/brotli missing:  pip install fonttools brotli')
print(f'wrote {dst} ({dst.stat().st_size // 1024} KB, was {src.stat().st_size // 1024} KB)')
print('next: npm run font:scan   (manifest will prefer the woff2)')
