import React, { useEffect, useState } from "react";
import { useTimelineStore, createEmptyProject } from "../store/timelineStore";
import type { ProjectState } from "../types/timeline";

export const AUTOSAVE_KEY = "essira:autosave";
export const AUTOSAVE_META_KEY = "essira:autosave:meta";

export interface SavedProjectMeta {
  id: string;
  name: string;
  savedAt: number;
  aspect: string;
  clipCount: number;
}

export function loadSavedMeta(): SavedProjectMeta | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_META_KEY);
    return raw ? (JSON.parse(raw) as SavedProjectMeta) : null;
  } catch {
    return null;
  }
}

function clearSavedProject(): void {
  localStorage.removeItem(AUTOSAVE_KEY);
  localStorage.removeItem(AUTOSAVE_META_KEY);
}

const ASPECTS = [
  { key: "16:9", label: "16:9", detail: "Landscape", width: 1920, height: 1080 },
  { key: "9:16", label: "9:16", detail: "Vertical / Shorts", width: 1080, height: 1920 },
  { key: "1:1", label: "1:1", detail: "Square", width: 1080, height: 1080 },
  { key: "4:5", label: "4:5", detail: "Portrait", width: 1080, height: 1350 },
] as const;

const CAPABILITIES = [
  { icon: "▣", title: "Timeline editing", text: "Multi-track timeline with snapping, splitting and trimming." },
  { icon: "T", title: "Titles & captions", text: "Canvas-rendered text with strokes, fills and backgrounds." },
  { icon: "✦", title: "AI timeline copilot", text: "Apply structured edit actions to your project instantly." },
  { icon: "♫", title: "Audio & filters", text: "Volume, panning and CSS filter effects per clip." },
] as const;

function describeAspectRatio(project: ProjectState): string {
  const ratio = project.width / project.height;
  const match = ASPECTS.reduce<{ key: string; delta: number } | null>((best, aspect) => {
    const delta = Math.abs(project.width / project.height - aspect.width / aspect.height);
    return !best || delta < best.delta ? { key: aspect.key, delta } : best;
  }, null);
  return match && match.delta < 0.02 ? match.key : `${project.width}×${project.height}`;
}

function formatDate(savedAt: number): string {
  const date = new Date(savedAt);
  const now = new Date();
  const minutes = Math.floor((now.getTime() - savedAt) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (date.toDateString() === now.toDateString()) {
    return `Today, ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

interface Props {
  onCreateProject: (options: { name: string; width: number; height: number }) => void;
  onContinueProject: (project: ProjectState) => void;
  onLoadDemo: () => void;
}

export default function HomePage({ onCreateProject, onContinueProject, onLoadDemo }: Props): React.ReactElement {
  const project = useTimelineStore((state) => state.project);
  const setProject = useTimelineStore((state) => state.setProject);
  const [aspectKey, setAspectKey] = useState<(typeof ASPECTS)[number]["key"]>("16:9");
  const [projectName, setProjectName] = useState("Untitled project");
  const [savedMeta, setSavedMeta] = useState<SavedProjectMeta | null>(null);

  useEffect(() => {
    setSavedMeta(loadSavedMeta());
  }, []);

  const aspect = ASPECTS.find((candidate) => candidate.key === aspectKey) ?? ASPECTS[0];

  const createProject = (): void => {
    clearSavedProject();
    onCreateProject({ name: projectName.trim() || "Untitled project", width: aspect.width, height: aspect.height });
  };

  const continueSaved = (): void => {
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as ProjectState;
      if (!saved?.tracks) return;
      setProject(saved);
      onContinueProject(saved);
    } catch {
      clearSavedProject();
      setSavedMeta(null);
    }
  };

  const discardSaved = (): void => {
    clearSavedProject();
    setSavedMeta(null);
  };

  return (
    <div className="home-screen">
      <header className="home-topbar">
        <div className="home-brand">
          <span className="home-brand-mark">E</span>
          <div className="home-brand-copy">
            <strong>ESSIRA</strong>
            <small>Video studio</small>
          </div>
        </div>
        <span className="topbar-divider" />
        <span className="home-topbar-caption">Home</span>
        <div className="topbar-spacer" />
        <span className="home-topbar-hint">Your projects stay on this device — nothing is uploaded.</span>
      </header>

      <main className="home-body">
        <div className="home-hero">
          <span className="home-hero-eyebrow">✦ Create something</span>
          <h1>
            What do you want to make <span className="home-hero-accent">today?</span>
          </h1>
        </div>

        <div className="home-project-grid">
          {savedMeta ? (
            <button
              className="home-project-card home-card-continue"
              onClick={continueSaved}
              title={`Continue ${savedMeta.name}`}
            >
              <div className="home-card-preview">
                <span className="home-card-play">▶</span>
              </div>
              <div className="home-card-copy">
                <strong>{savedMeta.name}</strong>
                <small>
                  {savedMeta.aspect} · {savedMeta.clipCount} clip{savedMeta.clipCount === 1 ? "" : "s"} ·{" "}
                  {formatDate(savedMeta.savedAt)}
                </small>
                <small className="home-card-open">Click to continue editing →</small>
              </div>
              <span
                className="home-card-discard"
                role="button"
                tabIndex={0}
                aria-label={`Discard ${savedMeta.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  discardSaved();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.stopPropagation();
                    event.preventDefault();
                    discardSaved();
                  }
                }}
              >
                ✕
              </span>
            </button>
          ) : null}

          <button
            className="home-project-card home-card-create"
            onClick={createProject}
            title="Create a new project"
          >
            <div className="home-card-preview home-card-new">
              <span className="home-card-plus">＋</span>
            </div>
            <div className="home-card-copy">
              <strong>New project</strong>
              <small>Start from scratch in {aspect.label}</small>
            </div>
          </button>

          <button className="home-project-card home-card-demo" onClick={onLoadDemo} title="Open the sample project">
            <div className="home-card-preview home-card-demo-preview">
              <span className="home-card-demo-icon">❋</span>
            </div>
            <div className="home-card-copy">
              <strong>Sample project</strong>
              <small>Explore the timeline with demo footage</small>
            </div>
          </button>
        </div>

        <section className="home-create-panel">
          <h2 className="home-panel-title">New project settings</h2>
          <div className="home-create-grid">
            <label className="field-label">
              Project name
              <input
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                placeholder="Untitled project"
                maxLength={60}
              />
            </label>
            <div className="home-aspects">
              {ASPECTS.map((candidate) => (
                <button
                  key={candidate.key}
                  className={aspectKey === candidate.key ? "home-aspect selected" : "home-aspect"}
                  onClick={() => setAspectKey(candidate.key)}
                  title={`${candidate.label} — ${candidate.width}×${candidate.height}`}
                >
                  <span className="home-aspect-shape" data-aspect={candidate.key} />
                  <strong>{candidate.label}</strong>
                  <small>{candidate.detail}</small>
                </button>
              ))}
            </div>
          </div>
          <button className="button button-primary" onClick={createProject}>
            Create project →
          </button>
          <p className="home-resolution-hint">
            {aspect.width} × {aspect.height} · 30 fps
          </p>
        </section>

        <section className="home-capabilities">
          {CAPABILITIES.map((capability) => (
            <div className="home-capability" key={capability.title}>
              <span className="home-capability-icon">{capability.icon}</span>
              <div>
                <strong>{capability.title}</strong>
                <p>{capability.text}</p>
              </div>
            </div>
          ))}
        </section>

        <footer className="home-footer">
          <span>
            Current canvas: {project.width} × {project.height} · {describeAspectRatio(project)}
          </span>
          <span>Essira runs entirely in your browser.</span>
        </footer>
      </main>
    </div>
  );
}
