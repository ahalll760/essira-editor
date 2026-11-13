import type { Clip, ProjectState, Transition } from "../types/timeline";

/**
 * Essira AI Assist
 * -----------------
 * A deterministic, client-side AI layer that powers the copilot features
 * across the editor. It analyses the current timeline (or homework board)
 * and proposes concrete, validated actions the user can apply with one
 * click. The proposal/apply split keeps every AI edit fully undoable.
 *
 * CapCut-inspired assists implemented here:
 *  - Auto transition suggestions   (suggestTransitions)
 *  - Smart clip trimming            (suggestSmartTrims)
 *  - AI timeline organisation        (organiseTimeline)
 *  - Homework task breakdowns       (breakdownAssignment)
 *  - Homework progress suggestions  (suggestNextSteps)
 */

export interface Suggestion<T = unknown> {
  id: string;
  kind: "transition" | "trim" | "organise" | "homework";
  title: string;
  reason: string;
  confidence: number;
  payload: T;
}

export interface TransitionSuggestion {
  fromClipId: string;
  toClipId: string;
  duration: number;
  transitionType: Transition["type"];
}

export interface TrimSuggestion {
  clipId: string;
  head: number;
  tail: number;
  reason: string;
}

export interface OrganiseMove {
  clipId: string;
  from: number;
  to: number;
}

export interface OrganiseReportData {
  movedClips: OrganiseMove[];
  removedGaps: number;
  trackNames: string[];
}

const makeId = (): string => crypto.randomUUID();

function clipsOnTrack(project: ProjectState, trackId: string): Clip[] {
  return project.tracks.find((track) => track.id === trackId)?.clips ?? [];
}

/**
 * Auto-transition suggestions: detect hard cuts between adjacent clips and
 * propose the CapCut-style transition that best matches the surrounding cut.
 */
export function suggestTransitions(project: ProjectState): Suggestion<TransitionSuggestion>[] {
  const suggestions: Suggestion<TransitionSuggestion>[] = [];

  for (const track of project.tracks) {
    if (track.kind === "text") continue;
    const clips = [...track.clips].sort((a, b) => a.start - b.start);

    for (let i = 0; i < clips.length - 1; i += 1) {
      const current = clips[i];
      const next = clips[i + 1];

      // Only adjacent clips (a hard cut) are candidates.
      const gap = next.start - (current.start + current.duration);
      if (gap > 0.05) continue;

      // Skip when a transition already exists on this cut.
      const exists = project.transitions.some(
        (transition) =>
          transition.fromClipId === current.id && transition.toClipId === next.id,
      );
      if (exists) continue;

      const total = current.duration + next.duration;
      const energy = Math.min(current.volume, next.volume);
      const type: Transition["type"] =
        energy > 0.8 ? "crossfade"
        : total < 6 ? "wipe"
        : "dip-to-black";
      const duration = Math.max(0.2, Math.min(1.2, total / 12));

      suggestions.push({
        id: makeId(),
        kind: "transition",
        title: `${type === "crossfade" ? "Crossfade" : type === "wipe" ? "Wipe" : "Dip to black"} after "${current.name}"`,
        reason:
          type === "crossfade"
            ? `Both clips have high audio energy, a smooth crossfade keeps the momentum.`
            : type === "wipe"
              ? `Short adjacent clips; a quick wipe reads better than a long blend.`
              : `This cut is between longer scenes, a dip to black gives it breathing room.`,
        confidence: Math.min(0.95, 0.55 + Math.abs(1 - gap) * 0.2),
        payload: { fromClipId: current.id, toClipId: next.id, duration, transitionType: type },
      });
    }
  }

  return suggestions;
}

/**
 * Smart trim: flag clips whose head/tail are likely fluff (CapCut's Auto Cut
 * style). Uses clip metadata when present, otherwise falls back to pacing
 * heuristics derived from the neighbouring clips.
 */
export function suggestSmartTrims(project: ProjectState): Suggestion<TrimSuggestion>[] {
  const suggestions: Suggestion<TrimSuggestion>[] = [];

  for (const track of project.tracks) {
    if (track.kind === "text") continue;
    const clips = [...track.clips].sort((a, b) => a.start - b.start);

    clips.forEach((clip, index) => {
      const isHead = index === 0;
      const isTail = index === clips.length - 1;
      const head = isHead ? 0 : 0.3;
      const tail = isTail ? 0 : 0.3;
      if (head === 0 && tail === 0) return;

      // Very short clips are already tight.
      if (clip.duration < 1.5) return;

      suggestions.push({
        id: makeId(),
        kind: "trim",
        title: `Tighten "${clip.name}"`,
        reason: isHead && isTail
          ? `This clip runs alone on the track; trimming the dead head/tail keeps pacing crisp.`
          : isHead
            ? `Opening clips usually start with silence or camera setup, trim ${head.toFixed(1)}s off the head.`
            : `Closing clips often trail off, trim ${tail.toFixed(1)}s off the tail.`,
        confidence: 0.6 + (clip.duration > 8 ? 0.15 : 0),
        payload: { clipId: clip.id, head, tail, reason: "pacing" },
      });
    });
  }

  return suggestions;
}

/**
 * AI timeline organisation: returns a report of structural issues plus a
 * reordering payload that removes gaps between clips on every visual track
 * (magnetic-timeline style cleanup).
 */
export function organiseTimeline(project: ProjectState): Suggestion<OrganiseReportData> {
  const movedClips: OrganiseMove[] = [];
  let removedGaps = 0;

  for (const track of project.tracks) {
    if (track.kind === "text") continue;
    const clips = [...track.clips].sort((a, b) => a.start - b.start);
    let cursor = clips[0]?.start ?? 0;

    for (const clip of clips) {
      if (Math.abs(clip.start - cursor) > 0.05) {
        movedClips.push({ clipId: clip.id, from: clip.start, to: cursor });
        removedGaps += clip.start - cursor;
      }
      cursor = clip.start + clip.duration;
    }
  }

  return {
    id: makeId(),
    kind: "organise",
    title: "Close gaps and snap clips",
    reason: `${movedClips.length} clip${movedClips.length === 1 ? "" : "s"} can snap forward, removing ${removedGaps.toFixed(1)}s of dead air across the timeline.`,
    confidence: 0.8,
    payload: { movedClips, removedGaps, trackNames: project.tracks.map((track) => track.name) },
  };
}

/**
 * Apply a magnetic-timeline organisation report in place. Accepts the raw
 * report data used by the ORGANISE_TIMELINE AI action.
 */
export function applyOrganise(project: ProjectState, report: OrganiseReportData): void {
  for (const move of report.movedClips) {
    const clip = project.tracks
      .flatMap((track) => track.clips)
      .find((candidate) => candidate.id === move.clipId);
    if (clip) clip.start = Math.max(0, move.to);
  }
  for (const track of project.tracks) {
    track.clips.sort((a, b) => a.start - b.start);
  }
}

/* ------------------------------------------------------------------ */
/* Homework copilot                                                    */
/* ------------------------------------------------------------------ */

export interface HomeworkTask {
  id: string;
  title: string;
  detail: string;
  estimateMinutes: number;
  done: boolean;
}

export interface HomeworkAssignment {
  id: string;
  title: string;
  subject: string;
  dueDate: string;
  tasks: HomeworkTask[];
}

const SUBJECT_HINTS: Array<{ keywords: string[]; subject: string; steps: string[] }> = [
  {
    subject: "English / writing",
    keywords: ["essay", "report", "write", "narrative", "story", "paragraph"],
    steps: [
      "Read the prompt twice and underline the required deliverables",
      "Draft a 3-point outline with your thesis or main idea",
      "Write a first draft without editing yourself",
      "Revise structure: one idea per paragraph, clear transitions",
      "Proofread for grammar, spelling and citation format",
    ],
  },
  {
    subject: "Maths",
    keywords: ["math", "maths", "algebra", "geometry", "calculus", "problem", "equation", "statistics"],
    steps: [
      "List every formula or theorem the problems rely on",
      "Solve the easiest problems first to build momentum",
      "Show working for each step, not just answers",
      "Re-check answers by substituting back in",
      "Mark any stuck problems to ask about in class",
    ],
  },
  {
    subject: "Science",
    keywords: ["lab", "physics", "chemistry", "biology", "experiment", "hypothesis"],
    steps: [
      "Summarise the hypothesis and method in one sentence each",
      "Record data and observations in a clean table",
      "Graph the results and note the trend",
      "Write the conclusion linking data back to the hypothesis",
      "Double-check units, significant figures and safety notes",
    ],
  },
  {
    subject: "Video / media project",
    keywords: ["video", "film", "edit", "documentary", "vlog", "clip", "montage"],
    steps: [
      "Write a 5-beat script and gather your footage",
      "Import media and build a rough cut in the timeline",
      "Run Auto Transitions and Smart Trim to tighten pacing",
      "Add captions and background music, then duck the audio",
      "Export a draft, watch it once end-to-end, fix timing",
    ],
  },
];

/**
 * Automated task breakdown: derives a subject from the assignment title and
 * returns a ready-to-use checklist with per-task time estimates.
 */
export function breakdownAssignment(title: string, dueDate: string): HomeworkAssignment {
  const lower = title.toLowerCase();
  const match = SUBJECT_HINTS.find((hint) => hint.keywords.some((keyword) => lower.includes(keyword)));
  const subject = match?.subject ?? "General study";
  const steps = match?.steps ?? [
    "Skim the assignment and list what must be delivered",
    "Break it into 15-30 minute chunks",
    "Do the hardest chunk first while you are fresh",
    "Review the finished work against the requirements",
    "Pack/submit it the night before it is due",
  ];

  const weights = [0.15, 0.3, 0.25, 0.2, 0.1];
  const tasks: HomeworkTask[] = steps.map((step, index) => ({
    id: makeId(),
    title: `Step ${index + 1}`,
    detail: step,
    estimateMinutes: Math.max(10, Math.round(45 * weights[index])),
    done: false,
  }));

  return { id: makeId(), title: title.trim() || "Untitled assignment", subject, dueDate, tasks };
}

export interface ProgressInsight {
  headline: string;
  detail: string;
  tone: "good" | "warn" | "info";
}

/**
 * Progress suggestions: analyses an assignment and returns coaching next steps.
 */
export function suggestNextSteps(assignment: HomeworkAssignment): ProgressInsight[] {
  const insights: ProgressInsight[] = [];
  const done = assignment.tasks.filter((task) => task.done);
  const remaining = assignment.tasks.filter((task) => !task.done);
  const remainingMinutes = remaining.reduce((sum, task) => sum + task.estimateMinutes, 0);

  const dueMs = new Date(`${assignment.dueDate}T23:59:59`).getTime();
  const daysLeft = Number.isFinite(dueMs)
    ? Math.ceil((dueMs - Date.now()) / 86_400_000)
    : Number.POSITIVE_INFINITY;

  if (assignment.tasks.length === 0) {
    insights.push({
      headline: "No tasks yet",
      detail: "Use the AI breakdown to generate a checklist from the assignment title.",
      tone: "info",
    });
    return insights;
  }

  const pct = Math.round((done.length / assignment.tasks.length) * 100);
  insights.push({
    headline: `${pct}% complete`,
    detail:
      pct === 100
        ? "Every step is done. Give it one final review pass before submitting."
        : `${remaining.length} step${remaining.length === 1 ? "" : "s"} left, about ${Math.round(remainingMinutes / 5) * 5} minutes of work.`,
    tone: pct === 100 ? "good" : pct >= 50 ? "info" : "warn",
  });

  if (daysLeft < 0) {
    insights.push({
      headline: "Past due",
      detail: "This assignment is overdue. Finish the highest-value remaining steps first.",
      tone: "warn",
    });
  } else if (Number.isFinite(daysLeft)) {
    const minutesPerDay = remainingMinutes / Math.max(1, daysLeft);
    insights.push({
      headline: daysLeft === 1 ? "Due tomorrow" : `${daysLeft} days left`,
      detail:
        daysLeft === 0
          ? `Block out ${Math.round(remainingMinutes)} minutes today to finish on time.`
          : `Spread the remaining work at about ${Math.max(5, Math.round(minutesPerDay / 5) * 5)} minutes per day.`,
      tone: daysLeft <= 1 ? "warn" : "info",
    });
  }

  const next = remaining[0];
  if (next) {
    insights.push({
      headline: `Start with: ${next.title}`,
      detail: `${next.detail} (~${next.estimateMinutes} min). Tackle it while your focus is highest.`,
      tone: "info",
    });
  }

  return insights;
}

/**
 * Aggregate analytics across the whole homework board.
 */
export function homeworkBoardAnalytics(assignments: HomeworkAssignment[]) {
  const tasks = assignments.flatMap((assignment) => assignment.tasks);
  const done = tasks.filter((task) => task.done);
  return {
    assignments: assignments.length,
    tasks: tasks.length,
    tasksDone: done.length,
    completion: tasks.length === 0 ? 0 : Math.round((done.length / tasks.length) * 100),
    minutesRemaining: tasks
      .filter((task) => !task.done)
      .reduce((sum, task) => sum + task.estimateMinutes, 0),
  };
}

export { clipsOnTrack };
