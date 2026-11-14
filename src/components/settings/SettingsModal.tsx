import React, { useRef } from "react";
import { AI_MODELS } from "../../services/aiEngine";
import { useTimelineStore } from "../../store/timelineStore";
import type { AISettings } from "../../types/timeline";

interface Props {
  onClose: () => void;
  notify: (text: string, detail?: string) => void;
}

export function SettingsModal({ onClose, notify }: Props): React.ReactElement {
  const aiSettings = useTimelineStore((state) => state.aiSettings);
  const setAiSettings = useTimelineStore((state) => state.setAiSettings);
  const apiKeyRef = useRef<HTMLInputElement | null>(null);

  const save = (patch: Partial<AISettings>): void => {
    setAiSettings(patch);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div>
            <span className="eyebrow">Preferences</span>
            <h2>Settings</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close settings">
            ✕
          </button>
        </header>

        <div className="modal-body">
          <section className="settings-section">
            <h3>AI assistant</h3>
            <label className="field-label">
              OpenAI API key (optional — one-click tools work without it)
              <input
                ref={apiKeyRef}
                type="password"
                placeholder="sk-..."
                value={aiSettings.apiKey}
                onChange={(event) => save({ apiKey: event.target.value.trim() })}
                autoComplete="off"
              />
            </label>
            <label className="field-label">
              Model
              <select value={aiSettings.model} onChange={(event) => save({ model: event.target.value })}>
                {AI_MODELS.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </label>
            <div className="slider-field">
              <span>Creativity (temperature) {aiSettings.temperature.toFixed(1)}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={aiSettings.temperature}
                onChange={(event) => save({ temperature: Number(event.target.value) })}
              />
            </div>
            <label className="check-label">
              <input
                type="checkbox"
                checked={aiSettings.autoSuggest}
                onChange={(event) => save({ autoSuggest: event.target.checked })}
              />
              <span>Show live AI task suggestions while typing in chat</span>
            </label>
            <p className="empty-hint">
              The key is kept in this browser tab only and sent straight to OpenAI when you ask the AI to
              edit the timeline. Nothing is stored on a server.
            </p>
          </section>

          <section className="settings-section">
            <h3>Project</h3>
            <p className="empty-hint">
              Project name, resolution, and frame rate are edited from the Inspector panel while no clip
              is selected. Projects autosave locally in this browser.
            </p>
          </section>
        </div>

        <footer className="modal-foot">
          <button type="button" className="button button-outline" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() => {
              if (aiSettings.apiKey) notify("AI ready", `Timeline edits via ${aiSettings.model} are enabled.`);
              else notify("Offline AI", "One-click tools are enabled. Add a key anytime for direct edits.");
              onClose();
            }}
          >
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
