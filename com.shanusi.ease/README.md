# Shanusi Ease — CEP Extension (After Effects 2020+)

The extension version of Shanusi Ease. The UI is HTML/canvas, so dragging,
scrolling, and zooming are **smooth and real-time** (no ScriptUI repaint limits).

## Structure
```
com.shanusi.ease/
├── CSXS/manifest.xml      Extension definition (targets AE 17.0+)
├── client/                UI: index.html, style.css, main.js, CSInterface.js
├── host/ShanusiEase.jsx   AE logic (called from the UI via evalScript)
├── .debug                 Remote debugging (Chrome localhost:8088)
├── enable-debug.reg       Enable debug mode (run unsigned extensions)
└── install-dev.bat        Install via a junction into the CEP folder
```

## Install (personal use — no signing required)
1. **Double-click `enable-debug.reg`** → Yes. (once per machine)
2. **Double-click `install-dev.bat`** → creates a link into `%APPDATA%\Adobe\CEP\extensions\`.
   - Manual alternative: copy the whole `com.shanusi.ease` folder there.
3. **Restart After Effects.**
4. Open the panel: **Window → Extensions → Shanusi Ease**. Dock it like any panel.

If the panel shows up empty or with an error, see **Debugging** below.

## Usage
- **Ease tab**: drag the blue point (P1) and orange point (P2) on the graph;
  scroll to zoom; `Fit` resets the view.
  Presets (★ = custom, stored on your machine). `Get` reads easing from the
  selected keyframes, `Apply` applies it. `Copy/Paste` transfers the raw easing
  between keyframes. `Mode` = in / out / both side. `Rnd` = randomize influence.
- **Create tab**: `MAKE OUT` (reverse the in-animation into an out-animation at
  the playhead), `Bounce`, and `Elastic`.

Everything needs an active composition with selected keyframes
(Bounce / Elastic / Get / Apply require at least 2 keyframes).

## Debugging (if needed)
The `.debug` file opens port 8088. With the panel open in AE, point **Chrome** to
`http://localhost:8088` → click the panel → DevTools (Console, inspect).

## Build a `.zxp` (optional, for sharing)
Not required for personal use. If you want to distribute it:
1. Download `ZXPSignCmd` (Adobe).
2. Create a self-signed certificate:
   `ZXPSignCmd -selfSignedCert <country> <state> <org> <commonName> <password> cert.p12`
3. Sign:
   `ZXPSignCmd -sign "com.shanusi.ease" ShanusiEase.zxp cert.p12 <password>`
4. End users install the `.zxp` via Anastasiy Extension Manager / ZXP Installer.

> Note: for public distribution, ship a signed `.zxp` instead of telling users to
> enable `PlayerDebugMode` — enabling debug mode lowers their security by allowing
> any unsigned extension to run.
