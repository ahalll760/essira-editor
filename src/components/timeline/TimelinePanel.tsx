import React, { useRef } from "react";
import { formatSeconds } from "../../lib/format";
import { useTimelineStore } from "../../store/timelineStore";
import type { Clip, Id, Track } from "../../types/timeline";

interface Props {
  notify: (text: string, detail?: string) => void;
}

type DragState =
  | { mode: "move"; clipId: Id; trackId: Id; grabOffset: number }
  | { mode: "trim"; clipId: Id; edge: "left" | "right"; trackId: Id }
  | { mode: "playhead" }
  | null;

const KIND_LABELS: Record<Track["kind"], string> = {
  video: "▶",
  audio: "♪",
  text: "T",
  overlay: "▣",
};

export function TimelinePanel({ notify }: Props): React.ReactElement {
  const project = useTimelineStore((state) => state.project);
  const past = useTimelineStore((state) => state.past.length);
  const future = useTimelineStore((state) => state.future.length);
  const selectedClipId = useTimelineStore((state) => state.selectedClipId);
  const addTrack = useTimelineStore((state) => state.addTrack);
  const deleteTrack = useTimelineStore((state) => state.deleteTrack);
  const updateTrack = useTimelineStore((state) => state.updateTrack);
  const moveClip = useTimelineStore((state) => state.moveClip);
  const trimClip = useTimelineStore((state) => state.trimClip);
  const splitClip = useTimelineStore((state) => state.splitClip);
  const duplicateClip = useTimelineStore((state) => state.duplicateClip);
  const deleteClip = useTimelineStore((state) => state.deleteClip);
  const setSelectedClip = useTimelineStore((state) => state.setSelectedClip);
  const setPlayhead = useTimelineStore((state) => state.setPlayhead);
  const setZoom = useTimelineStore((state) => state.setZoom);
  const undo = useTimelineStore((state) => state.undo);
  const redo = useTimelineStore((state) => state.redo);

  const laneRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState>(null);

  const pixelsPerSecond = project.zoom;
  const totalSeconds = Math.max(project.duration, 10) + 2;
  const laneWidth = totalSeconds * pixelsPerSecond;

  const timeAt = (clientX: number): number => {
    const lane = laneRef.current;
    if (!lane) return 0;
    const bounds = lane.getBoundingClientRect();
    return Math.max(0, (clientX - bounds.left + lane.scrollLeft) / pixelsPerSecond);
  };

  const snap = (time: number, excludeClipId?: Id): number => {
    const SNAP_TOLERANCE = 8 / pixelsPerSecond;
    let best = time;
    let bestDelta = SNAP_TOLERANCE;
    const candidates: number[] = [0, project.playhead];
    for (const track of project.tracks) {
      for (const clip of track.clips) {
        if (clip.id === excludeClipId) continue;
        candidates.push(clip.start, clip.start + clip.duration);
      }
    }
    for (const candidate of candidates) {
      const delta = Math.abs(candidate - time);
      if (delta < bestDelta) {
        best = candidate;
        bestDelta = delta;
      }
    }
    return best;
  };

  const beginMove = (event: React.PointerEvent, clip: Clip): void => {
    event.stopPropagation();
    setSelectedClip(clip.id);
    const startSeconds = timeAt(event.clientX);
    dragRef.current = {
      mode: "move",
      clipId: clip.id,
      trackId: clip.trackId,
      grabOffset: startSeconds - clip.start,
    };
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  };

  const beginTrim = (event: React.PointerEvent, clip: Clip, edge: "left" | "right"): void => {
    event.stopPropagation();
    setSelectedClip(clip.id);
    dragRef.current = { mode: "trim", clipId: clip.id, edge, trackId: clip.trackId };
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  };

  const beginPlayhead = (event: React.PointerEvent): void => {
    dragRef.current = { mode: "playhead" };
    setPlayhead(timeAt(event.clientX));
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent): void => {
    const drag = dragRef.current;
    if (!drag) return;
    const time = timeAt(event.clientX);
    if (drag.mode === "playhead") {
      setPlayhead(time);
      return;
    }
    const clip = project.tracks
      .flatMap((track) => track.clips)
      .find((candidate) => candidate.id === drag.clipId);
    if (!clip) return;
    if (drag.mode === "move") {
      const target = Math.max(0, snap(time - drag.grabOffset, clip.id));
      moveClip(clip.id, target);
    } else if (drag.mode === "trim") {
      if (drag.edge === "left") {
        trimClip(clip.id, snap(time, clip.id), clip.start + clip.duration);
      } else {
        trimClip(clip.id, clip.start, snap(time, clip.id));
      }
    }
  };

  const endDrag = (): void => {
    dragRef.current = null;
  };

  const ticks = buildTicks(totalSeconds, pixelsPerSecond);

  return (
    <div className="timeline-panel">
      <div className="timeline-toolbar">
        <div className="timeline-actions">
          <span className="eyebrow">Timeline</span>
          <button type="button" className="icon-button" title="Undo" disabled={!past} onClick={undo}>
            ↶
          </button>
          <button type="button" className="icon-button" title="Redo" disabled={!future} onClick={redo}>
            ↷
          </button>
          <button
            type="button"
            className="icon-button"
            title="Split selected clip at playhead"
            disabled={!selectedClipId}
            onClick={() => {
              if (!selectedClipId) return;
              try {
                splitClip(selectedClipId);
                notify("Clip split", "Split the selected clip at the playhead.");
              } catch (error) {
                notify("Split failed", error instanceof Error ? error.message : String(error));
              }
            }}
          >
            ✂
          </button>
          <button
            type="button"
            className="icon-button"
            title="Duplicate selected clip"
            disabled={!selectedClipId}
            onClick={() => {
              if (!selectedClipId) return;
              duplicateClip(selectedClipId);
              notify("Clip duplicated", "The copy sits right after the original.");
            }}
          >
            ⧉
          </button>
          <button
            type="button"
            className="icon-button"
            title="Delete selected clip"
            disabled={!selectedClipId}
            onClick={() => {
              if (!selectedClipId) return;
              deleteClip(selectedClipId);
              setSelectedClip(null);
            }}
          >
            ✕
          </button>
          <button
            type="button"
            className="icon-button"
            title="Add video track"
            onClick={() => {
              addTrack("video");
              notify("Track added", "New video track at the bottom of the timeline.");
            }}
          >
            + Track
          </button>
        </div>
        <div className="zoom-control">
          <span>{formatSeconds(project.playhead)}</span>
          <input
            type="range"
            min={8}
            max={400}
            value={project.zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            aria-label="Timeline zoom"
          />
          <small>{project.zoom} px/s</small>
        </div>
      </div>

      <div className="timeline-scroller" ref={laneRef}>
        <div className="timeline-content" style={{ width: `${Math.max(laneWidth, 100)}px` }}>
          <div className="ruler-row" onPointerDown={beginPlayhead} onPointerMove={onPointerMove} onPointerUp={endDrag}>
            <div className="track-label ruler-label">
              <span>Time</span>
            </div>
            <div className="ruler" style={{ width: `${laneWidth}px` }}>
              {ticks.map((tick) => (
                <span key={tick.time} className="ruler-tick" style={{ left: `${tick.time * pixelsPerSecond}px` }}>
                  {tick.label}
                </span>
              ))}
            </div>
          </div>

          {project.tracks.map((track) => (
            <div key={track.id} className="track-row">
              <div className="track-label">
                <div className="track-name">
                  <span className={`track-kind-icon ${track.kind}`}>{KIND_LABELS[track.kind]}</span>
                  <span>
                    <strong>{track.name}</strong>
                    <small>
                      {track.clips.length} clip{track.clips.length === 1 ? "" : "s"}
                    </small>
                  </span>
                </div>
                <div className="track-controls">
                  <button
                    type="button"
                    title={track.muted ? "Unmute" : "Mute"}
                    onClick={() => updateTrack(track.id, { muted: !track.muted })}
                  >
                    {track.muted ? "🔇" : "🔊"}
                  </button>
                  <button
                    type="button"
                    title={track.hidden ? "Show" : "Hide"}
                    onClick={() => updateTrack(track.id, { hidden: !track.hidden })}
                  >
                    {track.hidden ? "🙈" : "👁"}
                  </button>
                  <button
                    type="button"
                    title={track.locked ? "Unlock" : "Lock"}
                    onClick={() => updateTrack(track.id, { locked: !track.locked })}
                  >
                    {track.locked ? "🔒" : "🔓"}
                  </button>
                  <button type="button" title="Delete track" onClick={() => deleteTrack(track.id)}>
                    🗑
                  </button>
                </div>
              </div>
              <div
                className="track-lane"
                onPointerDown={(event) => {
                  setSelectedClip(null);
                  setPlayhead(timeAt(event.clientX));
                }}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
              >
                {track.clips.map((clip) => (
                  <div
                    key={clip.id}
                    className={[
                      "timeline-clip",
                      clip.kind,
                      clip.id === selectedClipId ? "selected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{
                      left: `${clip.start * pixelsPerSecond}px`,
                      width: `${Math.max(clip.duration * pixelsPerSecond, 12)}px`,
                    }}
                    onPointerDown={(event) => beginMove(event, clip)}
                  >
                    <span
                      className="clip-handle left"
                      onPointerDown={(event) => beginTrim(event, clip, "left")}
                    />
                    <span className="clip-title">{clip.name}</span>
                    <span className="clip-duration">{clip.duration.toFixed(1)}s</span>
                    <span
                      className="clip-handle right"
                      onPointerDown={(event) => beginTrim(event, clip, "right")}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {project.tracks.length === 0 ? (
            <div className="timeline-empty">
              <span>▦</span>
              <strong>Your timeline is empty</strong>
              <p>Import media or add a track to start building your edit.</p>
            </div>
          ) : null}

          <div className="playhead-line" style={{ left: `${project.playhead * pixelsPerSecond}px` }} />
        </div>
      </div>

      <div className="timeline-status">
        <span>
          <strong>{project.tracks.length}</strong> tracks · <strong>{project.tracks.reduce((count, track) => count + track.clips.length, 0)}</strong> clips
        </span>
        <span>Drag to move · drag edges to trim · drag the ruler to scrub</span>
      </div>
    </div>
  );
}

function buildTicks(totalSeconds: number, pixelsPerSecond: number): Array<{ time: number; label: string }> {
  const candidates = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  const step = candidates.find((candidate) => candidate * pixelsPerSecond >= 60) ?? 300;
  const ticks: Array<{ time: number; label: string }> = [];
  for (let time = 0; time <= totalSeconds; time += step) {
    ticks.push({ time, label: formatSeconds(time) });
  }
  return ticks;
}
