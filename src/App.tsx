import React, { useCallback, useEffect, useRef, useState } from "react";
import { VideoCanvasPlayer } from "./components/player/VideoCanvasPlayer";
import { TimelinePanel } from "./components/timeline/TimelinePanel";
import { InspectorPanel } from "./components/inspector/InspectorPanel";
import { AIHub } from "./components/ai/AIHub";
import { AssetPanel } from "./components/assets/AssetPanel";
import { SettingsModal } from "./components/settings/SettingsModal";
import HomeworkPage from "./components/homework/HomeworkPage";
import { useTimelineStore } from "./store/timelineStore";
import type { ViewName } from "./types/ui";

interface Notice {
  id: number;
  text: string;
  detail?: string;
}

const DEMO_VIDEO_URL = "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";

export default function App(): React.ReactElement {
  const [view, setView] = useState<ViewName>("studio");
  const [showSettings, setShowSettings] = useState(false);
  const [showAssets, setShowAssets] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [notices, setNotices] = useState<Notice[]>([]);
  const noticeId = useRef(0);

  const project = useTimelineStore((state) => state.project);
  const lastSavedAt = useTimelineStore((state) => state.lastSavedAt);
  const setPlayhead = useTimelineStore((state) => state.setPlayhead);
  const markSaved = useTimelineStore((state) => state.markSaved);
  const undo = useTimelineStore((state) => state.undo);
  const redo = useTimelineStore((state) => state.redo);
  const addTrack = useTimelineStore((state) => state.addTrack);
  const addClip = useTimelineStore((state) => state.addClip);
  const setSelectedClip = useTimelineStore((state) => state.setSelectedClip);
  const selectedClipId = useTimelineStore((state) => state.selectedClipId);

  const notify = useCallback((text: string, detail?: string): void => {
    const id = (noticeId.current += 1);
    setNotices((current) => [...current, { id, text, detail }]);
    window.setTimeout(() => {
      setNotices((current) => current.filter((notice) => notice.id !== id));
    }, 4200);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return;
      if (event.key === " ") {
        event.preventDefault();
        setPlaying((current) => !current);
      } else if (event.key === "z" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedClipId) {
          useTimelineStore.getState().deleteClip(selectedClipId);
          setSelectedClip(null);
          notify("Clip deleted", "Removed with the Delete key.");
        }
      } else if (event.key === "s" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        markSaved();
        notify("Saved locally", "Project state stored in this browser.");
      } else if (event.key === "h") {
        setView((current) => (current === "homework" ? "studio" : "homework"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [redo, undo, markSaved, notify, selectedClipId, setSelectedClip]);

  // Autosave (debounced)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem("essira:autosave", JSON.stringify(project));
        localStorage.setItem(
          "essira:autosave:meta",
          JSON.stringify({
            id: project.id,
            name: project.name,
            savedAt: Date.now(),
            clipCount: project.tracks.reduce((count, track) => count + track.clips.length, 0),
          }),
        );
      } catch {
        // Storage may be full or blocked — autosave is best-effort.
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [project]);

  const loadDemo = (): void => {
    const videoTrackId = addTrack("video", "Demo footage");
    addClip(videoTrackId, {
      id: crypto.randomUUID(),
      kind: "video",
      name: "Flower clip",
      start: 0,
      duration: 5,
      sourceStart: 0,
      mediaUrl: DEMO_VIDEO_URL,
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, blendMode: "source-over" },
      filters: [],
      speed: 1,
      volume: 1,
      pan: 0,
      keyframes: {},
    });
    const audioTrackId = addTrack("audio", "Voiceover");
    addClip(audioTrackId, {
      id: crypto.randomUUID(),
      kind: "audio",
      name: "Demo audio",
      start: 0.5,
      duration: 4,
      sourceStart: 0,
      mediaUrl: DEMO_VIDEO_URL,
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, blendMode: "source-over" },
      filters: [],
      speed: 1,
      volume: 0.8,
      pan: 0,
      keyframes: {},
    });
    notify("Demo loaded", "Two tracks with sample media are on the timeline.");
  };

  const savedAtLabel = new Date(lastSavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (view === "homework") {
    return <HomeworkPage onBackToStudio={() => setView("studio")} notify={notify} />;
  }

  return (
    <div className="studio-shell">
      <header className="studio-topbar">
        <span className="brand-mark">E</span>
        <div className="project-title">
          <strong>ESSIRA</strong>
          <small>AI video studio</small>
        </div>
        <span className="topbar-divider" />
        <input
          className="project-name"
          value={project.name}
          maxLength={60}
          onChange={(event) => useTimelineStore.getState().updateProject({ name: event.target.value })}
          aria-label="Project name"
        />
        <span className="saved-status">
          <i />
          Saved {savedAtLabel}
        </span>
        <span className="topbar-spacer" />
        <button type="button" className="button button-quiet" onClick={() => setView("homework")}>
          Homework {useTimelineStore.getState().homework.filter((item) => item.status !== "done").length > 0 ? "●" : ""}
        </button>
        <button type="button" className="button button-quiet" onClick={() => loadDemo()}>
          Load demo
        </button>
        <button type="button" className="button button-quiet" onClick={() => setShowSettings(true)}>
          Settings
        </button>
        <button
          type="button"
          className="button button-primary"
          onClick={() => notify("Export queued", "The export pipeline (MediaRecorder) runs from the player controls in a future step.")}
        >
          Export
        </button>
      </header>

      <main className="studio-main">
        <div className="tool-rail">
          <button type="button" className="tool active" title="Media">
            <span>▣</span>
            Media
          </button>
          <button type="button" className="tool" title="Toggle assets panel" onClick={() => setShowAssets((current) => !current)}>
            <span>▤</span>
            Panels
          </button>
          <button type="button" className="tool" title="AI Studio" onClick={() => notify("AI Studio", "The AI hub is the right-hand panel — tools, chat, and homework.")}>
            <span>✦</span>
            AI
          </button>
          <button type="button" className="tool" title="Homework page" onClick={() => setView("homework")}>
            <span>✎</span>
            Homework
          </button>
        </div>

        {showAssets ? <AssetPanel onClose={() => setShowAssets(false)} /> : null}

        <section className="work-area">
          <div className="preview-toolbar">
            <div className="tool-group">
              <button type="button" className="icon-button" title="Undo" onClick={undo}>
                ↶
              </button>
              <button type="button" className="icon-button" title="Redo" onClick={redo}>
                ↷
              </button>
              <span className="resolution-chip">
                {project.width}×{project.height} · {project.frameRate}fps
              </span>
            </div>
            <div className="preview-center">
              <button type="button" className="icon-button" title="Jump to start" onClick={() => setPlayhead(0)}>
                ⏮
              </button>
              <button type="button" className="play-button" onClick={() => setPlaying((current) => !current)}>
                {playing ? "❚❚" : "▶"}
              </button>
              <button
                type="button"
                className="icon-button"
                title="Jump to end"
                onClick={() => setPlayhead(project.duration)}
              >
                ⏭
              </button>
            </div>
            <div className="time-readout">
              {project.playhead.toFixed(2)}s <span>/ {project.duration.toFixed(2)}s</span>
            </div>
          </div>

          <div className="preview-stage">
            <div
              className="preview-frame"
              style={{ aspectRatio: `${project.width} / ${project.height}` }}
            >
              <VideoCanvasPlayer
                project={project}
                playing={playing}
                onTimeChange={setPlayhead}
                className="canvas-preview"
              />
            </div>
          </div>

          <TimelinePanel notify={notify} />
        </section>

        <AIHub notify={notify} onOpenHomework={() => setView("homework")} />
        <InspectorPanel notify={notify} />
      </main>

      {showSettings ? <SettingsModal onClose={() => setShowSettings(false)} notify={notify} /> : null}

      <div className="notice-stack">
        {notices.map((notice) => (
          <div key={notice.id} className="notice">
            <strong>{notice.text}</strong>
            {notice.detail ? <small>{notice.detail}</small> : null}
          </div>
        ))}
      </div>

      <footer className="studio-footer">
        <span>
          Space play/pause · Ctrl+Z undo · Ctrl+Shift+Z redo · Delete removes selected clip · H toggles homework
        </span>
        <span>
          Essira runs entirely in your browser · <b>nothing is uploaded</b>
        </span>
      </footer>
    </div>
  );
}
