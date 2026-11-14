import React from "react";
import { AI_TASKS, errorMessage, homeworkFromTask, isHomeworkOverdue, runAITask } from "../../lib/ai";
import { useTimelineStore } from "../../store/timelineStore";
import type { HomeworkStatus } from "../../types/timeline";

interface Props {
  onBackToStudio: () => void;
  notify: (text: string, detail?: string) => void;
}

const STATUS_ORDER: HomeworkStatus[] = ["todo", "in-progress", "done"];

export default function HomeworkPage({ onBackToStudio, notify }: Props): React.ReactElement {
  const homework = useTimelineStore((state) => state.homework);
  const project = useTimelineStore((state) => state.project);
  const addHomework = useTimelineStore((state) => state.addHomework);
  const updateHomework = useTimelineStore((state) => state.updateHomework);
  const removeHomework = useTimelineStore((state) => state.removeHomework);
  const toggleHomeworkStep = useTimelineStore((state) => state.toggleHomeworkStep);
  const aiBusy = useTimelineStore((state) => state.aiBusy);

  const overdueCount = homework.filter(isHomeworkOverdue).length;
  const doneCount = homework.filter((item) => item.status === "done").length;

  const runStepTask = async (taskId: string): Promise<void> => {
    const task = AI_TASKS.find((candidate) => candidate.id === taskId);
    if (!task) return;
    try {
      await runAITask(task, notify);
    } catch (error) {
      notify("AI task failed", errorMessage(error));
    }
  };

  return (
    <div className="homework-screen">
      <header className="homework-topbar">
        <button type="button" className="button button-quiet" onClick={onBackToStudio}>
          ← Back to editor
        </button>
        <div className="homework-topbar-copy">
          <strong>AI Homework</strong>
          <small>
            Editing assignments for "{project.name}" — plan, run, and check off multi-step AI jobs.
          </small>
        </div>
        <div className="homework-topbar-stats">
          <span>{homework.length - doneCount} open</span>
          <span>{doneCount} done</span>
          {overdueCount > 0 ? <span className="overdue">{overdueCount} overdue</span> : null}
        </div>
      </header>

      <main className="homework-body">
        <section className="homework-list">
          {homework.length === 0 ? (
            <div className="homework-empty">
              <span>✎</span>
              <strong>No homework yet</strong>
              <p>
                Turn a big editing job into tracked homework: the AI plans the steps, you run them and
                check them off. Pick a starter below.
              </p>
            </div>
          ) : (
            homework.map((item) => {
              const doneSteps = item.steps.filter((step) => step.done).length;
              const allDone = doneSteps === item.steps.length && item.steps.length > 0;
              return (
                <article key={item.id} className="homework-card">
                  <header className="homework-card-head">
                    <strong>{item.title}</strong>
                    <div className="homework-card-meta">
                      {item.dueDate ? (
                        <span className={isHomeworkOverdue(item) ? "hw-due overdue" : "hw-due"}>Due {item.dueDate}</span>
                      ) : null}
                      <select
                        value={item.status}
                        onChange={(event) =>
                          updateHomework(item.id, { status: event.target.value as HomeworkStatus })
                        }
                        aria-label="Homework status"
                      >
                        {STATUS_ORDER.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </div>
                  </header>
                  <p className="homework-card-desc">{item.description}</p>
                  <ul className="homework-steps">
                    {item.steps.map((step) => (
                      <li key={step.id} className={step.done ? "hw-step done" : "hw-step"}>
                        <label>
                          <input
                            type="checkbox"
                            checked={step.done}
                            onChange={() => toggleHomeworkStep(item.id, step.id)}
                          />
                          <span>{step.text}</span>
                        </label>
                        {step.runTaskId ? (
                          <button
                            type="button"
                            className="hw-run"
                            disabled={aiBusy}
                            onClick={() => void runStepTask(step.runTaskId!)}
                          >
                            Run AI step
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  <footer className="homework-card-foot">
                    <small>
                      {doneSteps}/{item.steps.length} steps done{allDone ? " — nice work!" : ""}
                    </small>
                    <button type="button" className="text-button" onClick={() => removeHomework(item.id)}>
                      Remove
                    </button>
                  </footer>
                </article>
              );
            })
          )}
        </section>

        <aside className="homework-add">
          <h2>Plan new homework</h2>
          {AI_TASKS.filter((task) => task.kind === "homework").map((task) => (
            <button
              key={task.id}
              type="button"
              className="homework-add-card"
              onClick={() => {
                addHomework(homeworkFromTask(task, ""));
                notify("Homework added", `"${task.title}" is now on your list.`);
              }}
            >
              <strong>+ {task.title}</strong>
              <small>{task.description}</small>
            </button>
          ))}
          <p className="empty-hint">
            Tip: ask the AI chat in the studio to plan homework — it can break a big edit into
            ordered steps with runnable AI actions.
          </p>
        </aside>
      </main>
    </div>
  );
}
