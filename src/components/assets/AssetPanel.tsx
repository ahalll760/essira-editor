import React, { useRef } from "react";
import { useTimelineStore } from "../../store/timelineStore";
import type { Clip } from "../../types/timeline";

interface Props {
  onClose: () => void;
}

export default function AssetPanel({ onClose }: Props): React.ReactElement {
  const project = useTimelineStore((state) => state.project);
  const addTrack = useTimelineStore((state) => state.addTrack);
  const addClip = useTimelineStore((state) => state.addClip);
  const notifyRef = useRef<((text: string, detail?: string) => void) | null>(null);

  const assets = project.tracks
    .flatMap((track) => track.clips)
    .filter((clip) => clip.mediaUrl)
    .filter(
      (clip, index, all) =>
        all.findIndex((candidate) => candidate.mediaUrl === clip.mediaUrl) === index,
    );

  const importFiles = (files: FileList | null): void => {
    if (!files || !files.length) return;
    let videoTrackId: string | null = null;
    let audioTrackId: string | null = null;
    const state = useTimelineStore.getState();
    for (const file of Array.from(files)) {
      const url = URL.createObjectURL(file);
      const kind = file.type.startsWith("video")
        ? "video"
        : file.type.startsWith("audio")
          ? "audio"
          : file.type.startsWith("image")
            ? "image"
            : null;
      if (!kind) {
        notifyRef.current?.("Unsupported file", `${file.name} is not a video, audio, or image file.`);
        continue;
      }
      if (kind === "video" && !videoTrackId) videoTrackId = state.addTrack("video", "Imported video");
      if (kind === "audio" && !audioTrackId) audioTrackId = state.addTrack("audio", "Imported audio");
      const trackId = kind === "audio" ? audioTrackId! : videoTrackId ?? state.addTrack("video", "Imported media");
      const track = useTimelineStore.getState().project.tracks.find((candidate) => candidate.id === trackId);
      const endOfTrack = track ? Math.max(0, ...track.clips.map((clip) => clip.start + clip.duration)) : 0;
      const clip: Omit<Clip, "trackId"> = {
        id: crypto.randomUUID(),
        kind,
        name: file.name,
        start: endOfTrack,
        duration: kind === "image" ? 4 : 5,
        sourceStart: 0,
        mediaUrl: url,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, blendMode: "source-over" },
        filters: [],
        speed: 1,
        volume: 1,
        pan: 0,
        keyframes: {},
      };
      addClip(trackId, clip);
    }
    notifyRef.current?.("Import complete", `${files.length} file(s) added to the timeline.`);
  };

  return (
    <aside className="asset-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Media</span>
          <h2>Assets</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close assets">
          ✕
        </button>
      </div>

      <label className="import-drop">
        <input
          type="file"
          accept="video/*,audio/*,image/*"
          multiple
          hidden
          onChange={(event) => importFiles(event.target.files)}
        />
        <b>⬆</b>
        <strong>Import media</strong>
        <span>Drop files here or click to browse — video, audio, and images</span>
      </label>

      <div className="asset-list">
        {assets.length === 0 ? (
          <p className="empty-hint">
            Nothing imported yet. Files you import appear here and on the timeline.
          </p>
        ) : (
          assets.map((clip) => (
            <div key={clip.id} className="asset-item">
              <span className={`asset-thumb ${clip.kind}`}>{clip.kind === "audio" ? "♪" : "▣"}</span>
              <div className="asset-copy">
                <strong>{clip.name}</strong>
                <small>{clip.kind}</small>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="inspector-section-title">Add to timeline</div>
      <button
        type="button"
        className="button button-quiet full-width"
        onClick={() => addTrack("video", `Video track ${project.tracks.length + 1}`)}
      >
        + Video track
      </button>
      <button
        type="button"
        className="button button-quiet full-width"
        onClick={() => addTrack("audio", `Audio track ${project.tracks.length + 1}`)}
      >
        + Audio track
      </button>
      <button
        type="button"
        className="button button-quiet full-width"
        onClick={() => addTrack("text", `Text track ${project.tracks.length + 1}`)}
      >
        + Text track
      </button>
    </aside>
  );
}
