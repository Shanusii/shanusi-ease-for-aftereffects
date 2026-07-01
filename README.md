# Shanusi Ease

A custom easing toolkit for **Adobe After Effects** — design bezier easing
curves visually, save them as presets, and generate spring-style motion
(bounce / elastic) right on your keyframes. Inspired by tools like Flow and
Ease and Wizz.

It ships in two flavors:

| Version | Location | Best for |
|---|---|---|
| **CEP extension** | [`com.shanusi.ease/`](com.shanusi.ease/) | Smooth, real-time graph editor (HTML/canvas). Recommended. |
| **ScriptUI script** | [`ShanusiEase.jsx`](ShanusiEase.jsx) | Single file, no install — runs from the Scripts menu. |

## Features
- **Visual graph editor** — drag the P1/P2 bezier handles; scroll to zoom; the
  curve can overshoot outside the 0–1 box for back/anticipate easing.
- **Apply / Get** — apply the curve to selected keyframes, or read an existing
  keyframe's easing back into the graph.
- **Presets** — built-in eases plus your own custom presets, with export/import.
- **Copy / Paste easing** — transfer the exact easing between keyframes.
- **Mode & randomize** — apply to the in side, out side, or both; optionally
  randomize influence for a more organic feel.
- **Bounce** — ball-style motion that rebounds on one side of the target, with
  decreasing amplitude and shrinking intervals (gravity feel).
- **Elastic** — spring-style oscillation that crosses the target on both sides
  at a constant frequency, damping over time.
- **Make Out** — turn an in-animation into a reversed out-animation at the
  playhead (values, easing, interpolation, and spatial tangents all reversed).

## Install

### CEP extension (recommended)
Full steps: [`com.shanusi.ease/README.md`](com.shanusi.ease/README.md).
Quick version (personal use):
1. Run `enable-debug.reg` once.
2. Run `install-dev.bat` (or copy the `com.shanusi.ease` folder into
   `%APPDATA%\Adobe\CEP\extensions\`).
3. Restart AE → **Window → Extensions → Shanusi Ease**.

### ScriptUI script
Copy `ShanusiEase.jsx` into the After Effects `ScriptUI Panels` folder:

- Windows: `C:\Program Files\Adobe\Adobe After Effects <version>\Support Files\Scripts\ScriptUI Panels\`
- macOS: `/Applications/Adobe After Effects <version>/Scripts/ScriptUI Panels/`

Then open it from **Window → ShanusiEase.jsx**. To save presets, enable
*Allow Scripts to Write Files and Access Network* under
`Preferences → Scripting & Expressions`. Custom presets are stored in the user
data folder under `ShanusiEase/presets.txt`.

## Usage
1. Select keyframes in the timeline (most actions need at least 2).
2. Open the panel and adjust the bezier handles or pick a preset.
3. Apply the easing, or use the Create tab for Bounce / Elastic / Make Out.

## Troubleshooting
- Panel missing from the menu → make sure the file/folder is in the correct
  location and After Effects was restarted after installing.
- Presets not saving (script version) → enable script file access in Preferences.

## Compatibility
After Effects 2020 (17.0) and newer.

## License
[MIT](LICENSE)
