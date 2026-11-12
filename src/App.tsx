import React, { useEffect, useMemo, useRef, useState } from "react";
import { VideoCanvasPlayer } from "./components/player/VideoCanvasPlayer";
import { executeAIResponse } from "./services/aiEngine";
import { useTimelineStore, createEmptyProject } from "./store/timelineStore";
import type { Clip, Track, TrackKind } from "./types/timeline";

const makeId = () => crypto.randomUUID();
const baseTransform: Clip["transform"] = {
  x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, blendMode: "source-over",
};

function createTrack(id: string, name: string, kind: TrackKind, order: number): Track {
  return {
    id, name, kind, order, muted: false, solo: false, hidden: false,
    locked: false, snapping: true, rippleEdit: false, clips: [],
  };
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remainder = Math.floor(safe % 60);
  const frames = Math.floor((safe % 1) * 30);
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}:${String(frames).padStart(2, "0")}`;
}

function defaultClip(file: File, url: string, duration: number, trackId: string): Omit<Clip, "trackId"> {
  const type = file.type.startsWith("audio/") ? "audio" : file.type.startsWith("image/") ? "image" : "video";
  return {
    id: makeId(), kind: type, name: file.name, start: 0, duration: Math.max(0.5, duration),
    sourceStart: 0, mediaUrl: url, transform: { ...baseTransform }, filters: [],
    speed: 1, volume: 1, pan: 0, keyframes: {}, metadata: { fileSize: file.size, mimeType: file.type },
  };
}

export default function App(): React.ReactElement {
  const project = useTimelineStore((state) => state.project);
  const past = useTimelineStore((state) => state.past);
  const future = useTimelineStore((state) => state.future);
  const [playing, setPlaying] = useState(false);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<"media" | "text" | "ai">("media");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiMessage, setAiMessage] = useState("");
  const [zoom, setZoom] = useState(70);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ clipId: string; pointerX: number; initialStart: number } | null>(null);
  const store = useTimelineStore;

  const allClips = useMemo(() => project.tracks.flatMap((track) => track.clips), [project.tracks]);
  const selectedClip = allClips.find((clip) => clip.id === selectedClipId) ?? null;
  const timelineDuration = Math.max(project.duration, 15);
  const timelineWidth = Math.max(960, timelineDuration * zoom);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")) return;
      if (event.code === "Space") { event.preventDefault(); setPlaying((value) => !value); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault(); event.shiftKey ? store.getState().redo() : store.getState().undo();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d" && selectedClipId) {
        event.preventDefault(); setSelectedClipId(store.getState().duplicateClip(selectedClipId));
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedClipId) {
        store.getState().deleteClip(selectedClipId); setSelectedClipId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedClipId, store]);

  const seekFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left + event.currentTarget.scrollLeft;
    store.getState().setPlayhead(Math.min(timelineDuration, Math.max(0, x / zoom)));
  };

  const addTrack = (kind: TrackKind) => {
    const id = store.getState().addTrack(kind, `${kind[0].toUpperCase()}${kind.slice(1)} ${project.tracks.filter((track) => track.kind === kind).length + 1}`);
    return id;
  };

  const importFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      const isAudio = file.type.startsWith("audio/");
      const isImage = file.type.startsWith("image/");
      if (!isAudio && !isImage && !file.type.startsWith("video/")) continue;
      const kind: TrackKind = isAudio ? "audio" : isImage ? "overlay" : "video";
      let track = store.getState().project.tracks.find((candidate) => candidate.kind === kind);
      if (!track) {
        const trackId = store.getState().addTrack(kind, `${kind[0].toUpperCase()}${kind.slice(1)} 1`);
        track = store.getState().project.tracks.find((candidate) => candidate.id === trackId);
      }
      if (!track) continue;
      const url = URL.createObjectURL(file);
      let duration = isImage ? 5 : 10;
      if (!isImage) {
        duration = await new Promise<number>((resolve) => {
          const media = document.createElement(isAudio ? "audio" : "video");
          media.preload = "metadata";
          media.onloadedmetadata = () => resolve(Number.isFinite(media.duration) ? media.duration : 10);
          media.onerror = () => resolve(10);
          media.src = url;
        });
      }
      const start = store.getState().project.playhead;
      const clip = defaultClip(file, url, duration, track.id);
      store.getState().addClip(track.id, { ...clip, start });
      setSelectedClipId(clip.id);
    }
  };

  const addText = () => {
    let track = store.getState().project.tracks.find((candidate) => candidate.kind === "text");
    if (!track) {
      const id = store.getState().addTrack("text", "Text / captions");
      track = store.getState().project.tracks.find((candidate) => candidate.id === id);
    }
    if (!track) return;
    const id = makeId();
    store.getState().addClip(track.id, {
      id, kind: "text", name: "New title", start: project.playhead,
      duration: 3, sourceStart: 0, text: "Your title", transform: { ...baseTransform, y: 320 },
      filters: [], speed: 1, volume: 1, pan: 0, keyframes: {},
      captionStyle: { fontFamily: "Arial", fontSize: 64, color: "#ffffff", strokeColor: "#111827", strokeWidth: 3, align: "center" },
    });
    setSelectedClipId(id);
    setActivePanel("text");
  };

  const createProject = () => {
    store.getState().setProject(createEmptyProject("Untitled project"));
    setSelectedClipId(null);
    setPlaying(false);
  };

  const loadDemo = () => {
    createProject();
    const videoTrackId = store.getState().addTrack("video", "Video 1");
    const textTrackId = store.getState().addTrack("text", "Captions");
    store.getState().addClip(videoTrackId, {
      id: "demo-video", kind: "video", name: "Flower footage", start: 0, duration: 12, sourceStart: 0,
      mediaUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
      transform: { ...baseTransform }, filters: [], speed: 1, volume: 1, pan: 0, keyframes: {},
    });
    store.getState().addClip(textTrackId, {
      id: "demo-caption", kind: "text", name: "Opening title", start: 0.5, duration: 3, sourceStart: 0,
      text: "A moment in bloom", transform: { ...baseTransform, y: 350 }, filters: [], speed: 1,
      volume: 1, pan: 0, keyframes: {}, captionStyle: { fontFamily: "Arial", fontSize: 54, color: "#ffffff", strokeColor: "#111827", strokeWidth: 3, align: "center" },
    });
    setZoom(70);
  };

  const splitSelected = () => {
    if (!selectedClip) return;
    try { store.getState().splitClip(selectedClip.id, project.playhead); }
    catch (error) { setAiMessage(error instanceof Error ? error.message : "Could not split clip."); }
  };

  const runAI = () => {
    try {
      executeAIResponse(aiPrompt);
      setAiMessage("Actions applied to the timeline. Use Undo to revert.");
    } catch (error) {
      setAiMessage(error instanceof Error ? error.message : "Could not parse AI action JSON.");
    }
  };

  const updateSelected = (patch: Partial<Clip>) => {
    if (selectedClip) store.getState().updateClip(selectedClip.id, patch);
  };

  const dragClipStart = (event: React.PointerEvent<HTMLButtonElement>, clip: Clip) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedClipId(clip.id);
    dragRef.current = { clipId: clip.id, pointerX: event.clientX, initialStart: clip.start };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const dragClipMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current) return;
    const delta = (event.clientX - dragRef.current.pointerX) / zoom;
    store.getState().moveClip(dragRef.current.clipId, Math.max(0, dragRef.current.initialStart + delta));
  };

  const stopDrag = () => { dragRef.current = null; };
  const applyDemoAI = () => {
    const firstVideo = project.tracks.find((track) => track.kind === "video")?.clips[0];
    if (!firstVideo) { setAiMessage("Add or import a video clip before applying this sample action."); return; }
    setAiPrompt(JSON.stringify([{ type: "APPLY_FILTER", clipId: firstVideo.id, filter: { type: "saturation", value: 125, enabled: true } }], null, 2));
  };

  return (
    <div className="studio-shell">
      <header className="studio-topbar">
        <button className="brand-mark" onClick={createProject} aria-label="New project">E</button>
        <div className="project-title"><strong>ESSIRA</strong><span>Video studio</span></div>
        <span className="topbar-divider" />
        <input className="project-name" aria-label="Project name" value={project.name} onChange={(event) => store.getState().setProject({ ...project, name: event.target.value })} />
        <span className="saved-status"><i /> Saved locally</span>
        <div className="topbar-spacer" />
        <button className="button button-quiet" onClick={() => fileInputRef.current?.click()}>＋ Import</button>
        <button className="button button-primary" onClick={() => alert("Export foundation: browser MediaRecorder export is available in the media service.")}>Export</button>
        <input ref={fileInputRef} className="sr-only" type="file" accept="video/*,audio/*,image/*" multiple onChange={(event) => { if (event.target.files) void importFiles(event.target.files); event.currentTarget.value = ""; }} />
      </header>

      <main className="studio-main">
        <aside className="tool-rail" aria-label="Editor tools">
          <button className={activePanel === "media" ? "tool active" : "tool"} onClick={() => setActivePanel("media")}><span>▧</span>Media</button>
          <button className={activePanel === "text" ? "tool active" : "tool"} onClick={() => { setActivePanel("text"); addText(); }}><span>T</span>Text</button>
          <button className={activePanel === "ai" ? "tool active" : "tool"} onClick={() => setActivePanel("ai")}><span>✦</span>AI tools</button>
          <button className="tool" onClick={() => addTrack("audio")}><span>♫</span>Audio</button>
          <button className="tool" onClick={() => addTrack("overlay")}><span>▱</span>Overlay</button>
        </aside>

        <section className="asset-panel">
          <div className="panel-heading"><div><span className="eyebrow">WORKSPACE</span><h2>{activePanel === "media" ? "Media" : activePanel === "text" ? "Text" : "AI assistant"}</h2></div><button className="icon-button" onClick={() => setActivePanel("media")} aria-label="Media panel">···</button></div>
          {activePanel === "media" && <>
            <div className="asset-tabs"><span className="selected">Local</span><span>Project</span></div>
            <button className="import-drop" onClick={() => fileInputRef.current?.click()}><b>＋</b><strong>Import media</strong><span>Video, audio, or images</span></button>
            <div className="asset-list">
              {allClips.filter((clip) => clip.mediaUrl).map((clip) => <button className="asset-item" key={clip.id} onClick={() => { setSelectedClipId(clip.id); store.getState().setPlayhead(clip.start); }}><span className={`asset-thumb ${clip.kind}`}>{clip.kind === "audio" ? "♫" : clip.kind === "image" ? "▧" : "▶"}</span><span className="asset-copy"><strong>{clip.name}</strong><small>{clip.kind} · {clip.duration.toFixed(1)}s</small></span><span className="asset-add" onClick={(event) => { event.stopPropagation(); const track = store.getState().project.tracks.find((item) => item.kind === (clip.kind === "audio" ? "audio" : clip.kind === "image" ? "overlay" : "video")); if (track) store.getState().addClip(track.id, { ...clip, id: makeId(), trackId: track.id, start: project.playhead }); }}>＋</span></button>)}
              {allClips.filter((clip) => clip.mediaUrl).length === 0 && <p className="empty-hint">Your imported assets will appear here. Try the demo project to explore the timeline.</p>}
            </div>
            <button className="button button-outline full-width" onClick={loadDemo}>Load sample project</button>
          </>}
          {activePanel === "text" && <div className="panel-content"><p className="muted-copy">Add titles and captions to the selected timeline.</p><button className="button button-primary full-width" onClick={addText}>＋ Add title</button>{selectedClip?.kind === "text" && <label className="field-label">Text<textarea value={selectedClip.text ?? ""} onChange={(event) => updateSelected({ text: event.target.value, name: event.target.value.slice(0, 28) || "Title" })} /></label>}</div>}
          {activePanel === "ai" && <div className="panel-content"><div className="ai-badge">✦ Timeline copilot</div><p className="muted-copy">Paste a validated action JSON array to apply edits. AI model calls are not connected yet.</p><textarea className="ai-input" value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} placeholder={'[{"type":"APPLY_FILTER","clipId":"…","filter":{"type":"saturation","value":120,"enabled":true}}]'} /><button className="button button-primary full-width" onClick={runAI}>Apply actions</button><button className="text-button" onClick={applyDemoAI}>Create sample filter action</button>{aiMessage && <p className="status-message">{aiMessage}</p>}</div>}
        </section>

        <section className="work-area">
          <div className="preview-toolbar"><div className="tool-group"><span className="eyebrow">PREVIEW</span><span className="resolution-chip">{project.width} × {project.height}</span></div><div className="preview-center"><button className="icon-button" onClick={() => store.getState().setPlayhead(0)} aria-label="Go to beginning">|◀</button><button className="play-button" onClick={() => setPlaying((value) => !value)} aria-label={playing ? "Pause" : "Play"}>{playing ? "Ⅱ" : "▶"}</button><button className="icon-button" onClick={() => store.getState().setPlayhead(Math.min(project.duration, project.playhead + 1))} aria-label="Step forward">▶|</button></div><div className="time-readout">{formatTime(project.playhead)} <span>/ {formatTime(project.duration)}</span></div></div>
          <div className="preview-stage"><div className="preview-frame"><VideoCanvasPlayer project={project} playing={playing} onTimeChange={(time) => store.getState().setPlayhead(time)} className="canvas-preview" /></div></div>
          <div className="playback-footer"><span>Preview quality <strong>Full</strong></span><span>⤢ Fit</span></div>

          <section className="timeline-panel">
            <div className="timeline-toolbar"><div className="timeline-actions"><span className="eyebrow">TIMELINE</span><button className="icon-button" onClick={() => addTrack("video")} title="Add video track">＋ Video</button><button className="icon-button" onClick={() => addTrack("audio")} title="Add audio track">＋ Audio</button><button className="icon-button" onClick={addText} title="Add text track">＋ Text</button><button className="icon-button" onClick={splitSelected} disabled={!selectedClip} title="Split selected clip at playhead">✂ Split</button><button className="icon-button" onClick={() => selectedClip && setSelectedClipId(store.getState().duplicateClip(selectedClip.id))} disabled={!selectedClip} title="Duplicate selected clip">▢ Duplicate</button><button className="icon-button danger-action" onClick={() => { if (selectedClip) store.getState().deleteClip(selectedClip.id); setSelectedClipId(null); }} disabled={!selectedClip} title="Delete selected clip">⌫</button></div><label className="zoom-control">−<input aria-label="Timeline zoom" type="range" min="25" max="150" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />＋</label></div>
            <div className="timeline-scroller" ref={timelineRef}>
              <div className="timeline-content" style={{ width: `${timelineWidth}px` }}>
                <div className="ruler-row"><div className="track-label ruler-label">Time</div><div className="ruler" onPointerDown={seekFromPointer}>{Array.from({ length: Math.ceil(timelineDuration / 5) + 1 }, (_, index) => <span className="ruler-tick" key={index} style={{ left: `${index * 5 * zoom}px` }}>{formatTime(index * 5)}</span>)}<div className="playhead-line" style={{ left: `${project.playhead * zoom}px` }} /></div></div>
                {project.tracks.length === 0 && <div className="timeline-empty"><span>＋</span><div><strong>Start editing</strong><p>Import media or add a track to begin.</p></div><button className="button button-outline" onClick={() => fileInputRef.current?.click()}>Import media</button></div>}
                {project.tracks.map((track) => <div className="track-row" key={track.id}>
                  <div className="track-label"><div className="track-name"><span className={`track-kind-icon ${track.kind}`}>{track.kind === "audio" ? "♫" : track.kind === "text" ? "T" : track.kind === "overlay" ? "▧" : "▣"}</span><span><strong>{track.name}</strong><small>{track.kind}</small></span></div><div className="track-controls"><button title={track.kind === "audio" ? "Mute track" : "Hide track"} onClick={() => store.getState().updateTrack(track.id, track.kind === "audio" ? { muted: !track.muted } : { hidden: !track.hidden })}>{track.kind === "audio" ? (track.muted ? "M̸" : "M") : (track.hidden ? "◉̸" : "◉")}</button><button title="Lock track" onClick={() => store.getState().updateTrack(track.id, { locked: !track.locked })}>{track.locked ? "▣" : "▢"}</button></div></div>
                  <div className={`track-lane ${track.kind}`} style={{ width: `${timelineWidth}px` }} onPointerDown={(event) => { if (event.target === event.currentTarget) seekFromPointer(event); }}>
                    {Array.from({ length: Math.ceil(timelineDuration / 5) + 1 }, (_, index) => <span className="lane-grid" key={index} style={{ left: `${index * 5 * zoom}px` }} />)}
                    {track.clips.map((clip) => <button key={clip.id} className={`timeline-clip ${clip.kind} ${selectedClipId === clip.id ? "selected" : ""}`} style={{ left: `${clip.start * zoom}px`, width: `${Math.max(clip.duration * zoom, 28)}px` }} onPointerDown={(event) => dragClipStart(event, clip)} onPointerMove={dragClipMove} onPointerUp={stopDrag} onPointerCancel={stopDrag} onClick={() => setSelectedClipId(clip.id)} title={`${clip.name} · ${clip.duration.toFixed(2)}s`}><span className="clip-handle left" aria-hidden="true" /><span className="clip-title">{clip.kind === "text" ? "T  " : clip.kind === "audio" ? "♫  " : "▣  "}{clip.name}</span><span className="clip-duration">{clip.duration.toFixed(1)}s</span><span className="clip-handle right" aria-hidden="true" /></button>)}
                    <div className="playhead-line" style={{ left: `${project.playhead * zoom}px` }} onPointerDown={seekFromPointer} />
                  </div>
                </div>)}
              </div>
            </div>
            <div className="timeline-status"><span>{project.tracks.length} tracks · {allClips.length} clips</span><span>Zoom {zoom}%</span><span>Undo {past.length} · Redo {future.length}</span></div>
          </section>
        </section>

        <aside className="inspector-panel">
          <div className="panel-heading"><div><span className="eyebrow">PROPERTIES</span><h2>Inspector</h2></div></div>
          {!selectedClip ? <div className="inspector-empty"><span>◈</span><strong>No clip selected</strong><p>Select a timeline clip to edit its properties.</p></div> : <div className="inspector-form">
            <div className="selected-kind"><span className={`track-kind-icon ${selectedClip.kind}`}>{selectedClip.kind === "text" ? "T" : selectedClip.kind === "audio" ? "♫" : "▣"}</span><div><strong>{selectedClip.name}</strong><small>{selectedClip.kind} clip</small></div></div>
            <label className="field-label">Name<input value={selectedClip.name} onChange={(event) => updateSelected({ name: event.target.value })} /></label>
            {selectedClip.kind === "text" && <label className="field-label">Caption text<textarea value={selectedClip.text ?? ""} onChange={(event) => updateSelected({ text: event.target.value, name: event.target.value.slice(0, 28) || "Title" })} /></label>}
            <div className="field-grid"><label className="field-label">Position<input type="number" min="0" step="0.1" value={selectedClip.start} onChange={(event) => store.getState().moveClip(selectedClip.id, Number(event.target.value))} /></label><label className="field-label">Duration<input type="number" min="0.1" step="0.1" value={selectedClip.duration} onChange={(event) => updateSelected({ duration: Math.max(0.1, Number(event.target.value)) })} /></label></div>
            <div className="inspector-section-title">Transform</div>
            <div className="field-grid"><label className="field-label">X<input type="number" value={selectedClip.transform.x} onChange={(event) => updateSelected({ transform: { ...selectedClip.transform, x: Number(event.target.value) } })} /></label><label className="field-label">Y<input type="number" value={selectedClip.transform.y} onChange={(event) => updateSelected({ transform: { ...selectedClip.transform, y: Number(event.target.value) } })} /></label><label className="field-label">Scale<input type="number" min="0.1" step="0.1" value={selectedClip.transform.scaleX} onChange={(event) => updateSelected({ transform: { ...selectedClip.transform, scaleX: Number(event.target.value), scaleY: Number(event.target.value) } })} /></label><label className="field-label">Rotation<input type="number" value={selectedClip.transform.rotation} onChange={(event) => updateSelected({ transform: { ...selectedClip.transform, rotation: Number(event.target.value) } })} /></label></div>
            <label className="field-label slider-field">Opacity <span>{Math.round(selectedClip.transform.opacity * 100)}%</span><input type="range" min="0" max="1" step="0.01" value={selectedClip.transform.opacity} onChange={(event) => updateSelected({ transform: { ...selectedClip.transform, opacity: Number(event.target.value) } })} /></label>
            <div className="inspector-section-title">Playback</div>
            <label className="field-label">Speed<input type="number" min="0.1" max="8" step="0.1" value={selectedClip.speed} onChange={(event) => updateSelected({ speed: Math.max(0.1, Number(event.target.value)) })} /></label>
            <label className="field-label">Volume <span>{Math.round(selectedClip.volume * 100)}%</span><input type="range" min="0" max="1" step="0.01" value={selectedClip.volume} onChange={(event) => updateSelected({ volume: Number(event.target.value) })} /></label>
            <button className="button button-outline full-width" onClick={() => { store.getState().deleteClip(selectedClip.id); setSelectedClipId(null); }}>Delete clip</button>
          </div>}
        </aside>
      </main>
      <footer className="studio-footer"><span>Essira Editor <b>Beta</b></span><span>Shortcuts: Space play/pause · Ctrl+Z undo · Ctrl+D duplicate · Delete remove</span><span>Local browser session</span></footer>
    </div>
  );
}
