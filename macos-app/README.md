# 🧠 The Cognitive Redline

A **privacy-first student burnout detection** app, rebuilt as a **native macOS menu-bar app** in TypeScript + Electron.

It works like a *performance profiler for your brain* — quietly reading real system signals to estimate cognitive overload, then closing the loop with a trusted contact when you hit the redline.

> **Share the light, not the data.**

---

## Why native (vs. the web version)

A browser tab is sandboxed — it can only see *its own* page. This Electron app runs as a real OS-level menu-bar agent, so it can read **system-wide telemetry** a website never could:

| Signal | Source | Permission |
| --- | --- | --- |
| Context switching | frontmost-app polling (`osascript` / System Events) | Accessibility |
| Attention gaps / breaks | system idle time (`powerMonitor.getSystemIdleTime`) | none |
| Edit instability | keystroke/delete ratio in the scratch pad | none |
| Session intensity | active-time tracking | none |

Everything is still processed **100% locally** — no accounts, no backend, no network calls.

## Features

- **Live Cognitive Load Index (CLI)** with an animated canvas gauge and color states (green / yellow / red)
- **Transparent formula:** `CLI = (complexity × workHrs × assignments × deadline × stress) ÷ max(sleep,1)`, normalized 0–100, blended with behavioral telemetry
- **Live telemetry stream** — DevTools-style console of raw system + local events
- **Diagnostic fault codes** — `ERR_COGNITIVE_SATURATION`, `ERR_CONTEXT_THRASHING`, `ERR_SLEEP_DEPRIVATION`, …
- **Cognitive Redline event** (CLI > 75): ambient UI shift, native OS notification, **30-second decompression block** with breathing animation
- **Close the Loop:** one-tap daily check-in (🟢🟡🔴) + a trusted contact who **only ever sees a color** — never your notes, telemetry, sleep, or workload
- **Menu-bar title** recolors live to your current load (🟢 / 🟡 / 🔴 + score)
- **⚡ SIMULATE BURNOUT** button to demo every feature instantly

## Run it

```bash
cd cognitive-redline-app
npm install      # fetches Electron (incl. its runtime binary) + TypeScript
npm start        # builds and launches the menu-bar app
```

Then click the **🧠** item in your macOS menu bar to open the dashboard.

> On first run, macOS will ask to grant **Accessibility** permission (System Settings ▸ Privacy & Security ▸ Accessibility) — this enables live context-switch tracking. The app still works without it; idle, session, and keystroke telemetry need no permission.

## Tech

TypeScript · Electron 30 · Node (main process) · zero runtime dependencies in the UI (custom canvas gauge, no CDN).

## Project structure

```
src/
  main.ts              # Electron main: tray, window, native telemetry loop, IPC
  preload.ts           # secure contextBridge → window.cognitive
  renderer/
    index.html         # dashboard markup + styles
    renderer.ts        # CLI model, gauge, faults, redline, intervention, UI
```
