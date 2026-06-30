# Shanusi Ease

Shanusi Ease is an Adobe After Effects ScriptUI panel for editing easing curves, applying keyframe easing, managing presets, and generating simple animation keyframes.

## Requirements

- Adobe After Effects 2020 or newer
- Windows or macOS
- The `ShanusiEase.jsx` file from this repository

## Installation

1. Close Adobe After Effects if it is currently running.
2. Copy `ShanusiEase.jsx` into the After Effects `ScriptUI Panels` folder.

   Windows:

   ```text
   C:\Program Files\Adobe\Adobe After Effects <version>\Support Files\Scripts\ScriptUI Panels\
   ```

   macOS:

   ```text
   /Applications/Adobe After Effects <version>/Scripts/ScriptUI Panels/
   ```

3. Open Adobe After Effects.
4. Go to `Window > ShanusiEase.jsx`.
5. Dock the panel wherever you prefer in the After Effects workspace.

## Enable Preset Saving

To allow Shanusi Ease to save custom presets:

1. Open `Edit > Preferences > Scripting & Expressions` on Windows, or `After Effects > Settings > Scripting & Expressions` on macOS.
2. Enable `Allow Scripts to Write Files and Access Network`.
3. Restart After Effects if needed.

Custom presets are saved in the user data folder under `ShanusiEase/presets.txt`.

## Usage

1. Select keyframes in the After Effects timeline.
2. Open the Shanusi Ease panel from the `Window` menu.
3. Adjust the Bezier handles or choose a preset.
4. Apply the easing to the selected keyframes.
5. Optionally save, export, import, or delete custom presets.

## Troubleshooting

- If the panel does not appear in the `Window` menu, confirm that `ShanusiEase.jsx` is inside the `ScriptUI Panels` folder, not the regular `Scripts` folder.
- If presets do not save, make sure script file access is enabled in After Effects preferences.
- If After Effects was open during installation, restart it so the panel can be detected.

