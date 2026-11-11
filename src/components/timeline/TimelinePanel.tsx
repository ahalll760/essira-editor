import React from "react";
import { useTimelineStore } from "../../store/timelineStore";

export function TimelinePanel() {
  const project = useTimelineStore((state) => state.project);

  return (
    <div className="timeline-panel">
      {project.tracks.map((track) => (
        <div key={track.id} className="track-row">
          <div className="track-header">
            <strong>{track.name}</strong>
            <span>{track.kind}</span>
          </div>
          <div className="track-ruler">
            {track.clips.map((clip) => (
              <div
                key={clip.id}
                className="clip-chip"
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
  );
}
