import React from "react";
import { formatSeconds } from "../../lib/format";
import { useTimelineStore } from "../../store/timelineStore";
import type { BlendMode, Clip, Filter } from "../../types/timeline";

interface Props {
  notify: (text: string, detail?: string) => void;
}

const FILTER_PRESETS: Array<{ label: string; filter: Omit<Filter, "id"> }> = [
  { label: "Brighten +4%", filter: { type: "brightness", value: 104, enabled: true } },
  { label: "Punchy contrast", filter: { type: "contrast", value: 118, enabled: true } },
  { label: "Vivid color", filter: { type: "saturation", value: 125, enabled: true } },
  { label: "Soft blur", filter: { type: "blur", value: 2, enabled: true } },
  { label: "Cool hue", filter: { type: "hue", value: -12, enabled: true } },
];

const BLEND_MODES: BlendMode[] = ["source-over", "multiply", "screen", "overlay", "darken", "lighten"];

export function InspectorPanel({ notify }: Props): React.ReactElement {
  const project = useTimelineStore((state) => state.project);
  const selectedClipId = useTimelineStore((state) => state.selectedClipId);
  const updateClip = useTimelineStore((state) => state.updateClip);
  const deleteClip = useTimelineStore((state) => state.deleteClip);
  const duplicateClip = useTimelineStore((state) => state.duplicateClip);
  const updateProject = useTimelineStore((state) => state.updateProject);

  const selectedClip = selectedClipId
    ? project.tracks.flatMap((track) => track.clips).find((clip) => clip.id === selectedClipId) ?? null
    : null;

  const patchTransform = (patch: Partial<Clip["transform"]>): void => {
    if (!selectedClip) return;
    updateClip(selectedClip.id, { transform: { ...selectedClip.transform, ...patch } });
  };

  const addFilter = (filter: Omit<Filter, "id">): void => {
    if (!selectedClip) return;
    updateClip(selectedClip.id, { filters: [...selectedClip.filters, { ...filter, id: crypto.randomUUID() }] });
    notify("Filter added", `"${filter.type}" applied to ${selectedClip.name}.`);
  };

  const toggleFilter = (filterId: string): void => {
    if (!selectedClip) return;
    updateClip(selectedClip.id, {
      filters: selectedClip.filters.map((filter) =>
        filter.id === filterId ? { ...filter, enabled: !filter.enabled } : filter,
      ),
    });
  };

  const removeFilter = (filterId: string): void => {
    if (!selectedClip) return;
    updateClip(selectedClip.id, {
      filters: selectedClip.filters.filter((filter) => filter.id !== filterId),
    });
  };

  const numberField = (
    label: string,
    value: number,
    onChange: (value: number) => void,
    options: { min?: number; max?: number; step?: number; unit?: string } = {},
  ): React.ReactElement => (
    <label className="field-label">
      {label}
      <input
        type="number"
        value={Number(value.toFixed(2))}
        min={options.min}
        max={options.max}
        step={options.step ?? 0.1}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );

  return (
    <aside className="inspector-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Inspector</span>
          <h2>{selectedClip ? selectedClip.name : "Project"}</h2>
        </div>
      </div>

      {!selectedClip ? (
        <div className="inspector-empty">
          <span>◇</span>
          <strong>No clip selected</strong>
          <p>Click a clip in the timeline to edit its transform, filters, speed, and audio here.</p>
        </div>
      ) : (
        <div className="inspector-form">
          <div className="selected-kind">
            <span className={`track-kind-icon ${selectedClip.kind}`}>{selectedClip.kind === "audio" ? "♪" : selectedClip.kind === "text" ? "T" : "▶"}</span>
            <div>
              <strong>{selectedClip.name}</strong>
              <small>
                {selectedClip.kind} · {formatSeconds(selectedClip.start)} → {formatSeconds(selectedClip.start + selectedClip.duration)}
              </small>
            </div>
          </div>

          <label className="field-label">
            Clip name
            <input
              value={selectedClip.name}
              maxLength={60}
              onChange={(event) => updateClip(selectedClip.id, { name: event.target.value })}
            />
          </label>

          {selectedClip.kind === "text" ? (
            <label className="field-label">
              Text content
              <textarea
                value={selectedClip.text ?? ""}
                maxLength={500}
                onChange={(event) => updateClip(selectedClip.id, { text: event.target.value })}
              />
            </label>
          ) : null}

          <div className="inspector-section-title">Transform</div>
          <div className="field-grid">
            {numberField("Position X", selectedClip.transform.x, (x) => patchTransform({ x }), { step: 1 })}
            {numberField("Position Y", selectedClip.transform.y, (y) => patchTransform({ y }), { step: 1 })}
            {numberField("Scale X", selectedClip.transform.scaleX, (scaleX) => patchTransform({ scaleX }), { min: 0 })}
            {numberField("Scale Y", selectedClip.transform.scaleY, (scaleY) => patchTransform({ scaleY }), { min: 0 })}
          </div>
          <div className="slider-field">
            <span>{selectedClip.transform.rotation.toFixed(0)}°</span>
            <input
              type="range"
              min={-180}
              max={180}
              value={selectedClip.transform.rotation}
              onChange={(event) => patchTransform({ rotation: Number(event.target.value) })}
            />
          </div>
          <div className="slider-field">
            <span>Opacity {Math.round(selectedClip.transform.opacity * 100)}%</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={selectedClip.transform.opacity}
              onChange={(event) => patchTransform({ opacity: Number(event.target.value) })}
            />
          </div>
          <label className="field-label">
            Blend mode
            <select
              value={selectedClip.transform.blendMode}
              onChange={(event) => patchTransform({ blendMode: event.target.value as BlendMode })}
            >
              {BLEND_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </label>

          <div className="inspector-section-title">Speed & audio</div>
          <div className="field-grid">
            {numberField("Speed", selectedClip.speed, (speed) => updateClip(selectedClip.id, { speed: Math.max(0.1, speed) }), { min: 0.1, max: 8 })}
            {numberField("Volume", selectedClip.volume, (volume) => updateClip(selectedClip.id, { volume: Math.max(0, Math.min(1, volume)) }), { min: 0, max: 1 })}
            {numberField("Pan", selectedClip.pan, (pan) => updateClip(selectedClip.id, { pan: Math.max(-1, Math.min(1, pan)) }), { min: -1, max: 1 })}
          </div>

          <div className="inspector-section-title">Filters</div>
          <div className="filter-presets">
            {FILTER_PRESETS.map((preset) => (
              <button key={preset.label} type="button" className="button button-outline" onClick={() => addFilter(preset.filter)}>
                {preset.label}
              </button>
            ))}
          </div>
          {selectedClip.filters.length > 0 ? (
            <div className="filter-list">
              {selectedClip.filters.map((filter) => (
                <div key={filter.id} className="filter-item">
                  <label>
                    <input type="checkbox" checked={filter.enabled} onChange={() => toggleFilter(filter.id)} />
                    <span>
                      {filter.type} · {filter.value}
                    </span>
                  </label>
                  <button type="button" className="text-button" onClick={() => removeFilter(filter.id)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-hint">No filters on this clip yet. Try a preset above or ask the AI Studio to polish your footage.</p>
          )}

          <div className="inspector-section-title">Clip actions</div>
          <button type="button" className="button button-quiet" onClick={() => duplicateClip(selectedClip.id)}>
            Duplicate clip
          </button>
          <button
            type="button"
            className="button button-quiet"
            onClick={() => {
              deleteClip(selectedClip.id);
              notify("Clip deleted", `"${selectedClip.name}" removed from the timeline.`);
            }}
          >
            Delete clip
          </button>
        </div>
      )}

      <div className="inspector-section-title">Project</div>
      <label className="field-label">
        Project name
        <input value={project.name} maxLength={80} onChange={(event) => updateProject({ name: event.target.value })} />
      </label>
      <p className="empty-hint">
        {project.width} × {project.height} · {project.frameRate} fps · {project.tracks.length} tracks · duration {formatSeconds(project.duration)}
      </p>
    </aside>
  );
}
