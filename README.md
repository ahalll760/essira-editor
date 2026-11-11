# Essira Editor

A browser-based AI video editing foundation built with React, TypeScript, Zustand, and Canvas rendering for real-time preview and timeline operations.

## Features

- Timeline state with undo/redo
- Multi-track editor model
- Canvas-based preview player
- AI action schema validation
- Media analysis helpers for silence detection and waveform extraction
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
- More advanced timeline interactions
- Full server-side AI orchestration and media storage
