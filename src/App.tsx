import React, { useMemo, useState } from "react";
import { VideoCanvasPlayer } from "./components/player/VideoCanvasPlayer";
import { useTimelineStore, createEmptyProject } from "./store/timelineStore";
import type { TrackKind } from "./types/timeline";

const demoProject = createEmptyProject("Essira demo");
const videoTrackId = "video-track";
const audioTrackId = "audio-track";
const textTrackId = "text-track";

demoProject.tracks = [
  {
    id: videoTrackId,
    name: "Video",
    kind: "video",
    order: 0,
    muted: false,
    solo: false,
    hidden: false,
    locked: false,
    snapping: true,
    rippleEdit: false,
    clips: [
      {
        id: "clip-1",
        trackId: videoTrackId,
        kind: "video",
        name: "Main Clip",
        start: 0,
        duration: 12,
        sourceStart: 0,
        mediaUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
        transform: {
          x: 0,
          y: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          opacity: 1,
          blendMode: "source-over",
        },
        filters: [],
        speed: 1,
        volume: 1,
        pan: 0,
        keyframes: {},
      },
    ],
  },
  {
    id: textTrackId,
    name: "Captions",
    kind: "text",
    order: 1,
    muted: false,
    solo: false,
    hidden: false,
    locked: false,
    snapping: true,
    rippleEdit: false,
    clips: [
      {
        id: "caption-1",
        trackId: textTrackId,
        kind: "text",
        name: "Intro caption",
        start: 0,
        duration: 3,
        sourceStart: 0,
        text: "Welcome to Essira Editor",
        transform: {
          x: 0,
          y: 60,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          opacity: 1,
          blendMode: "source-over",
        },
        filters: [],
        speed: 1,
        volume: 1,
        pan: 0,
        keyframes: {},
        captionStyle: {
          fontFamily: "Arial",
          fontSize: 42,
          color: "#ffffff",
          strokeColor: "#000000",
          strokeWidth: 2,
          backgroundColor: "rgba(0,0,0,0.2)",
          align: "center",
        },
      },
    ],
  },
  {
    id: audioTrackId,
    name: "Audio",
    kind: "audio",
    order: 2,
    muted: false,
    solo: false,
    hidden: false,
    locked: false,
    snapping: true,
    rippleEdit: false,
    clips: [],
  },
];

demoProject.duration = 12;
demoProject.playhead = 0;
demoProject.zoom = 100;

export default function App() {
  const project = useTimelineStore((state) => state.project);
  const [playing, setPlaying] = useState(false);

  const timeline = useMemo(() => project.tracks.flatMap((track) => track.clips), [project]);

  const setDemo = () => {
    useTimelineStore.setState({ project: structuredClone(demoProject), past: [], future: [] });
  };

  const addTrack = (kind: TrackKind) => {
    useTimelineStore.getState().addTrack(kind, `${kind} track`);
  };

  const addClip = () => {
    useTimelineStore.getState().addClip(videoTrackId, {
      id: crypto.randomUUID(),
      kind: "image",
      name: "Added asset",
      start: 4,
      duration: 4,
      sourceStart: 0,
      mediaUrl: "https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=1200&q=80",
      transform: {
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        opacity: 1,
        blendMode: "source-over",
      },
      filters: [],
      speed: 1,
      volume: 1,
      pan: 0,
      keyframes: {},
    });
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <h1>Essira</h1>
          <span>Editor</span>
        </div>

        <button onClick={setDemo}>Load demo project</button>
        <button onClick={() => addTrack("video")}>Add video track</button>
        <button onClick={() => addTrack("audio")}>Add audio track</button>
        <button onClick={() => addTrack("text")}>Add text track</button>
        <button onClick={addClip}>Add clip</button>

        <div className="panel">
          <h3>AI Actions</h3>
          <pre>{JSON.stringify([
            { type: "CUT_CLIP", clipId: "clip-1", start: 2, end: 4 },
            { type: "ADD_CAPTION_TRACK", name: "Auto captions", captions: [{ start: 0, end: 1, text: "Welcome" }] },
          ], null, 2)}</pre>
        </div>
      </aside>

      <main className="editor">
        <div className="topbar">
          <button onClick={() => setPlaying((v) => !v)}>{playing ? "Pause" : "Play"}</button>
          <button onClick={() => useTimelineStore.getState().undo()}>Undo</button>
          <button onClick={() => useTimelineStore.getState().redo()}>Redo</button>
          <span>Playhead: {project.playhead.toFixed(2)}s</span>
        </div>

        <div className="viewport">
          <VideoCanvasPlayer
            project={project}
            playing={playing}
            onTimeChange={(time) => useTimelineStore.getState().setPlayhead(time)}
            className="canvas-preview"
          />
        </div>

        <div className="timeline">
          {project.tracks.map((track) => (
            <div className="track-row" key={track.id}>
              <div className="track-header">
                <strong>{track.name}</strong>
                <small>{track.kind}</small>
              </div>
              <div className="track-ruler">
                {timeline
                  .filter((clip) => clip.trackId === track.id)
                  .map((clip) => (
                    <div
                      key={clip.id}
                      className="clip"
                      style={{
                        left: `${(clip.start / Math.max(project.duration, 1)) * 100}%`,
                        width: `${(clip.duration / Math.max(project.duration, 1)) * 100}%`,
                      }}
                    >
                      {clip.name}
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
