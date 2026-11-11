import React from "react";
import { useTimelineStore } from "../../store/timelineStore";

export function InspectorPanel() {
  const project = useTimelineStore((state) => state.project);
  const selectedClip = project.tracks
    .flatMap((track) => track.clips)
    .find((clip) => clip.start <= project.playhead && project.playhead <= clip.start + clip.duration);

  return (
    <aside className="inspector-panel">
      <h3>Inspector</h3>
      <div className="inspector-section">
        <label>Project</label>
        <div>{project.name}</div>
      </div>
      <div className="inspector-section">
        <label>Playhead</label>
        <div>{project.playhead.toFixed(2)}s</div>
      </div>
      <div className="inspector-section">
        <label>Selected clip</label>
        <div>{selectedClip ? selectedClip.name : "None"}</div>
      </div>
      <div className="inspector-section">
        <label>Resolution</label>
        <div>
          {project.width}x{project.height}
        </div>
      </div>
    </aside>
  );
}
