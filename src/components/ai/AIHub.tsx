import React, { useMemo, useState } from "react";
import { formatSeconds } from "../../lib/format";
import {
  AI_TASKS,
  HOMEWORK_TASKS,
  TIMELINE_AI_TASKS,
  buildSuggestions,
  errorMessage,
  homeworkFromTask,
  isHomeworkOverdue,
  runAITask,
  sendChat,
} from "../../lib/ai";
import { useTimelineStore } from "../../store/timelineStore";
import type { AITask } from "../../types/timeline";

interface Props {
  notify: (text: string, detail?: string) => void;
  onOpenHomework: () => void;
}

export function AIHub({ notify, onOpenHomework }: Props): React.ReactElement {
  const project = useTimelineStore((state) => state.project);
  const aiSession = useTimelineStore((state) => state.aiSession);
  const aiSettings = useTimelineStore((state) => state.aiSettings);
  const aiBusy = useTimelineStore((state) => state.aiBusy);
  const aiStatus = useTimelineStore((state) => state.aiStatus);
  const homework = useTimelineStore((state) => state.homework);
  const addHomework = useTimelineStore((state) => state.addHomework);
  const clearAiSession = useTimelineStore((state) => state.clearAiSession);
  const setSuggestions = useTimelineStore((state) => state.setSuggestions);

  const [tab, setTab] = useState<"tasks" | "chat" | "homework">("tasks");
  const [prompt, setPrompt] = useState("");
  const [dueDate, setDueDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 3);
    return date.toISOString().slice(0, 10);
  });

  const clipCount = useMemo(
    () => project.tracks.reduce((count, track) => count + track.clips.length, 0),
    [project.tracks],
  );
  const openHomework = homework.filter((item) => item.status !== "done").length;
  const overdueHomework = homework.filter(isHomeworkOverdue).length;

  const runTask = async (task: AITask): Promise<void> => {
    try {
      await runAITask(task, notify);
    } catch (error) {
      notify("AI task failed", errorMessage(error));
    }
  };

  const addTaskAsHomework = (task: AITask): void => {
    addHomework(homeworkFromTask(task, dueDate));
    notify("Homework added", `${task.title} is on your homework page with a due date.`);
  };

  const submitChat = async (): Promise<void> => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setPrompt("");
    try {
      await sendChat(trimmed, notify);
    } catch (error) {
      notify("AI request failed", errorMessage(error));
    }
  };

  const suggestions = prompt.trim().length > 2 ? buildSuggestions(prompt) : [];

  return (
    <section className="ai-hub">
      <header className="ai-hub-header">
        <span className="ai-hub-glow">✦</span>
        <div className="ai-hub-title">
          <strong>AI Studio</strong>
          <small>
            {aiBusy ? (aiStatus ?? "Working...") : `${clipCount} clip${clipCount === 1 ? "" : "s"} in context`}
          </small>
        </div>
        <nav className="ai-hub-tabs">
          {(["tasks", "chat", "homework"] as const).map((candidate) => (
            <button
              key={candidate}
              type="button"
              className={tab === candidate ? "ai-tab selected" : "ai-tab"}
              onClick={() => setTab(candidate)}
            >
              {candidate === "tasks" ? "Tools" : candidate === "chat" ? "Chat" : "Homework"}
              {candidate === "homework" && openHomework > 0 ? <em>{openHomework}</em> : null}
            </button>
          ))}
        </nav>
      </header>

      {tab === "tasks" ? (
        <div className="ai-tab-body">
          <div className="ai-task-grid">
            {TIMELINE_AI_TASKS.map((task) => (
              <button
                key={task.id}
                type="button"
                className="ai-task-card"
                disabled={aiBusy}
                onClick={() => void runTask(task)}
                title={task.description}
              >
                <span className="ai-task-kind timeline">⚡</span>
                <strong>{task.title}</strong>
                <small>{task.description}</small>
                <span className="ai-task-run">Run →</span>
              </button>
            ))}
          </div>
          <div className="ai-homework-strip">
            <div className="ai-homework-copy">
              <strong>AI Homework</strong>
              <small>
                Bigger multi-step jobs with due dates and step lists. Track them on the homework page.
                {overdueHomework > 0 ? ` ${overdueHomework} overdue.` : ""}
              </small>
            </div>
            <div className="ai-homework-actions">
              {HOMEWORK_TASKS.map((task) => (
                <button key={task.id} type="button" className="button button-quiet" onClick={() => addTaskAsHomework(task)}>
                  + {task.title}
                </button>
              ))}
              <button type="button" className="button button-outline" onClick={onOpenHomework}>
                Open homework page →
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "chat" ? (
        <div className="ai-tab-body ai-chat-body">
          <div className="ai-messages">
            {aiSession.messages.map((message) => (
              <div key={message.id} className={message.role === "user" ? "ai-msg user" : "ai-msg ai"}>
                <p>{message.text}</p>
                {message.actionCount ? <em>{message.actionCount} action(s) applied to the timeline</em> : null}
              </div>
            ))}
            {aiBusy ? <div className="ai-msg ai ai-typing">{aiStatus ?? "Working..."}</div> : null}
          </div>
          {suggestions.length > 0 ? (
            <div className="ai-suggestions">
              {suggestions.map((suggestion) => {
                const task = AI_TASKS.find((candidate) => candidate.id === suggestion.taskId);
                return task ? (
                  <button
                    key={suggestion.id}
                    type="button"
                    className="ai-suggestion"
                    disabled={aiBusy}
                    onClick={() => void runTask(task)}
                  >
                    {suggestion.kind === "homework" ? "📌" : "⚡"} {suggestion.label}
                  </button>
                ) : null;
              })}
            </div>
          ) : null}
          <div className="ai-composer">
            <textarea
              value={prompt}
              placeholder={
                aiSettings.apiKey
                  ? "Ask the AI to edit this timeline... (e.g. cut the first clip between 2 and 3 seconds)"
                  : "Add an OpenAI key in Settings to unlock direct timeline edits. One-click tools work without it."
              }
              onChange={(event) => {
                setPrompt(event.target.value);
                if (aiSettings.autoSuggest) setSuggestions(buildSuggestions(event.target.value));
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void submitChat();
                }
              }}
              rows={3}
            />
            <div className="ai-composer-row">
              <small>{aiSettings.apiKey ? `Model: ${aiSettings.model}` : "Offline mode — one-click tools only"}</small>
              <button type="button" className="button button-primary" disabled={aiBusy || !prompt.trim()} onClick={() => void submitChat()}>
                Send
              </button>
            </div>
          </div>
          <button type="button" className="text-button" onClick={clearAiSession}>
            Clear conversation
          </button>
        </div>
      ) : null}

      {tab === "homework" ? (
        <div className="ai-tab-body">
          {homework.length === 0 ? (
            <div className="empty-hint">
              No homework yet. Add a multi-step AI job from the Tools tab, or plan one from the homework page.
            </div>
          ) : (
            <div className="ai-homework-list">
              {homework.map((item) => (
                <div key={item.id} className="ai-homework-item">
                  <div className="ai-homework-item-head">
                    <strong>{item.title}</strong>
                    <span className={isHomeworkOverdue(item) ? "ai-due overdue" : "ai-due"}>
                      {item.dueDate || "No due date"} · {item.status}
                    </span>
                  </div>
                  <p>{item.description}</p>
                  <ol className="ai-homework-steps">
                    {item.steps.map((step) => (
                      <li key={step.id} className={step.done ? "done" : undefined}>
                        {step.text}
                      </li>
                    ))}
                  </ol>
                  <div className="ai-homework-item-actions">
                    <button type="button" className="button button-outline" onClick={onOpenHomework}>
                      Open homework page →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

export function formatPlayhead(seconds: number): string {
  return formatSeconds(seconds);
}
