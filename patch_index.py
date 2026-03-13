#!/usr/bin/env python3
"""
radioAPARAT — index.html patcher
Pokreni: python3 patch_index.py
Fajl mora biti u istom folderu kao index.html
"""

import sys, os, shutil

TARGET = 'index.html'
BACKUP = 'index.html.bak'

if not os.path.exists(TARGET):
    print(f'GREŠKA: {TARGET} nije pronađen u ovom folderu.')
    sys.exit(1)

with open(TARGET, 'r', encoding='utf-8') as f:
    html = f.read()

original = html
patches = []

# ─────────────────────────────────────────────
# PATCH 1: iOS status bar
# ─────────────────────────────────────────────
OLD1 = '''  <div class="statusbar">
    <span class="statusbar-time" id="statusbar-time">9:41</span>
    <span style="width:126px"></span>
    <span style="font-size:11px">●●● 5G ▮▮▮</span>
  </div>'''

NEW1 = '''  <div class="statusbar">
    <span class="statusbar-time" id="statusbar-time">9:41</span>
    <span class="statusbar-right">
      <svg class="sb-signal" viewBox="0 0 17 12" width="17" height="12" fill="currentColor">
        <rect x="0" y="7" width="3" height="5" rx="0.5"/>
        <rect x="4.5" y="4.5" width="3" height="7.5" rx="0.5"/>
        <rect x="9" y="2" width="3" height="10" rx="0.5"/>
        <rect x="13.5" y="0" width="3" height="12" rx="0.5"/>
      </svg>
      <span class="sb-network">5G</span>
      <svg class="sb-wifi" viewBox="0 0 16 12" width="16" height="12" fill="currentColor">
        <path d="M8 10.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM8 7c1.38 0 2.63.56 3.54 1.46L13 7c-1.33-1.33-3.17-2.15-5-2.15S4.33 5.67 3 7l1.46 1.46A5.01 5.01 0 0 1 8 7zm0-4c2.44 0 4.65.99 6.26 2.59L15.7 4.1A10.98 10.98 0 0 0 8 1C4.97 1 2.24 2.24.3 4.1l1.44 1.49A8.98 8.98 0 0 1 8 3z"/>
      </svg>
      <span class="sb-battery">
        <svg viewBox="0 0 25 12" width="25" height="12" fill="none">
          <rect x="0.5" y="0.5" width="21" height="11" rx="3.5" stroke="currentColor" stroke-opacity="0.35"/>
          <rect x="22.5" y="3.5" width="2" height="5" rx="1" fill="currentColor" fill-opacity="0.4"/>
          <rect x="2" y="2" width="16" height="8" rx="2" fill="currentColor"/>
        </svg>
      </span>
    </span>
  </div>'''

if OLD1 in html:
    html = html.replace(OLD1, NEW1, 1)
    patches.append('✓ PATCH 1: iOS status bar — primenjen')
else:
    patches.append('⚠ PATCH 1: iOS status bar — već primenjen ili nije pronađen, preskačem')

# ─────────────────────────────────────────────
# PATCH 2: RDS klik otvara stream sheet
# ─────────────────────────────────────────────
OLD2 = '      <div class="track-info">'
NEW2 = '      <div class="track-info" onclick="openCurrentTrackStreamSheet()" style="cursor:pointer;">'

if OLD2 in html:
    html = html.replace(OLD2, NEW2, 1)
    patches.append('✓ PATCH 2: RDS klik — primenjen')
else:
    patches.append('⚠ PATCH 2: RDS klik — već primenjen ili nije pronađen, preskačem')

# ─────────────────────────────────────────────
# Sačuvaj samo ako ima promena
# ─────────────────────────────────────────────
if html != original:
    shutil.copy2(TARGET, BACKUP)
    print(f'Backup: {BACKUP}')
    with open(TARGET, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f'Sačuvano: {TARGET}')
else:
    print('Nema promena.')

for msg in patches:
    print(msg)

print('\nGotovo.')
