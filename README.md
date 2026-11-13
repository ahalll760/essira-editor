# Essira Editor

A browser-based AI video editing studio built with React, TypeScript, Zustand, and Canvas rendering for real-time preview and timeline operations. CapCut-inspired dark UI, rebuilt app system, and a reworked AI system with timeline tools and an AI homework page.

## Features

- **Interactive timeline** — drag clips to move, drag edges to trim, magnetic snapping to clip boundaries and the playhead, split/duplicate/delete at the playhead, per-track mute/hide/lock, zoomable ruler with scrubbing
- **Full inspector** — per-clip transform (position, scale, rotation, opacity, blend mode), speed, volume, pan, text content, filter presets with enable/remove toggles
- **AI Studio hub** — three tabs:
  - **Tools**: one-click timeline AI (silence cutter, auto captions, highlight reel, audio ducking, quick polish) that run fully in-browser
  - **Chat**: natural-language editing via an OpenAI key (BYO, browser-only) with validated, safe timeline actions, plus live task suggestions while typing
  - **Homework**: multi-step AI jobs (clean edit pass, social pack) with due dates and checkable steps
- **AI homework page** — full-page view with status tracking (todo / in-progress / done), overdue detection, step checklists, and "Run AI step" buttons that execute the underlying AI task directly
- **Asset panel** — import video/audio/images (multi-file), auto-track creation, asset list
- **Settings modal** — OpenAI key, model picker, temperature, live suggestions toggle
- Timeline state with undo/redo (Ctrl+Z / Ctrl+Shift+Z), autosave to localStorage
- Keyboard shortcuts: Space (play/pause), Delete (remove selected clip), H (toggle homework page), Ctrl+S (save)
- Canvas-based preview player with transforms, filters, and captions
- AI action schema validation (Zod) — the AI can only run whitelisted actions against real project IDs
- Export pipeline scaffold with MediaRecorder

## Stack

- React + TypeScript
- Vite
- Zustand
- Zod
- HTML5 Canvas

## Getting started

```bash
npm install
npm run dev
```

## AI system

The AI works in two modes:

1. **Offline (no key needed)** — one-click flows analyze your project and emit validated `AIAction` objects through the same pipeline as the LLM: silence detection via Web Audio decoding, caption generation, highlight assembly, auto-ducking keyframes, and look polishing. Everything runs locally in the browser.
2. **OpenAI mode** — add a key in Settings and the chat sends your project context (tracks, clips, timings) to an OpenAI model, which returns a JSON array of timeline actions. Actions are schema-validated (Zod), checked against real project IDs, then applied atomically with a single undo step. The key lives only in the browser tab and is sent directly to OpenAI.

## Deployment

For Vercel, use:

- Root directory: `.`
- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm install`

This project is intentionally a robust foundation. Real production deployment should add:

- Web Workers for decoding, waveform generation, and export
- Frame-accurate timecode handling
- Audio engine and mixer graph
- Server-side AI orchestration and media storage
