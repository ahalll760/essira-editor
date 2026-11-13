import { buildSystemPrompt, callAI, executeAIResponse } from "../services/aiEngine";
import { detectSilence } from "../services/mediaService";
import { useTimelineStore } from "../store/timelineStore";
import type {
  AIAction,
  AITask,
  HomeworkItem,
  Id,
  ProjectState,
  Suggestion,
} from "../types/timeline";

export type Notify = (text: string, detail?: string) => void;

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The AI task catalog. "timeline" tasks are one-click edits that run entirely
 * in the browser; "homework" tasks are bigger multi-step jobs that can be
 * tracked on the homework page.
 */
export const AI_TASKS: AITask[] = [
  {
    id: "silence",
    kind: "timeline",
    title: "Silence cutter",
    description:
      "Decode the audio behind the selected clip, find dead air, and ripple-remove it so nothing drifts out of sync.",
  },
  {
    id: "captions",
    kind: "timeline",
    title: "Auto captions",
    description:
      "Lay a styled caption track over your video and image clips, one caption per clip, ready to restyle.",
  },
  {
    id: "highlights",
    kind: "timeline",
    title: "Highlight reel",
    description:
      "Pick the opening seconds of every visual clip and assemble them into a brand-new highlight track.",
  },
  {
    id: "duck",
    kind: "timeline",
    title: "Audio ducking",
    description:
      "Lower the music track whenever the speech track has clips, then bring it back automatically.",
  },
  {
    id: "polish",
    kind: "timeline",
    title: "Quick polish",
    description:
      "Add a gentle brightness pass to every visual clip and crossfades wherever clips touch.",
  },
  {
    id: "cleanedit",
    kind: "homework",
    title: "Clean edit pass",
    description:
      "Full post-production homework: trim silence, duck the music, polish the look, caption everything, and finish with a highlight reel.",
  },
  {
    id: "socialpack",
    kind: "homework",
    title: "Social pack homework",
    description:
      "Prepare the project for social platforms: captions, ducking, a polished look, and a short highlight cut.",
  },
];

export const TIMELINE_AI_TASKS: AITask[] = AI_TASKS.filter((task) => task.kind === "timeline");
export const HOMEWORK_TASKS: AITask[] = AI_TASKS.filter((task) => task.kind === "homework");

export function summarizeActions(actions: AIAction[]): string {
  const lines = actions.map((action) => {
    switch (action.type) {
      case "CUT_CLIP":
        return "Cut a section out of a clip";
      case "TRIM_SILENCE":
        return `Removed ${action.ranges.length} silent section(s)`;
      case "ADD_CAPTION_TRACK":
        return `Added a caption track with ${action.captions.length} captions`;
      case "APPLY_FILTER":
        return `Applied a ${action.filter.type} filter`;
      case "AUTO_DUCK_AUDIO":
        return "Ducked the music track around speech";
      case "ADD_TRANSITION":
        return `Added a ${action.transitionType} transition`;
      case "GENERATE_HIGHLIGHT_REEL":
        return `Built a highlight reel with ${action.segments.length} segments`;
    }
  });
  return lines.join("\n");
}

function clipsOf(project: ProjectState) {
  return project.tracks.flatMap((track) => track.clips);
}

function pickTargetClip(project: ProjectState, selectedClipId: Id | null) {
  const clips = clipsOf(project);
  return (
    clips.find((clip) => clip.id === selectedClipId && clip.mediaUrl) ??
    clips.find((clip) => clip.mediaUrl && (clip.kind === "video" || clip.kind === "audio")) ??
    null
  );
}

async function flowSilenceCut(project: ProjectState): Promise<string> {
  const clip = pickTargetClip(project, useTimelineStore.getState().selectedClipId);
  if (!clip?.mediaUrl) {
    throw new Error("Select a clip that has a video or audio file first.");
  }
  const response = await fetch(clip.mediaUrl);
  if (!response.ok) throw new Error("Could not read the clip's media file for analysis.");
  const audioContext = new AudioContext();
  try {
    const buffer = await audioContext.decodeAudioData(await response.arrayBuffer());
    const ranges = detectSilence(buffer, { thresholdDb: -42, minDuration: 0.4 });
    if (!ranges.length) throw new Error("No silence longer than 0.4s was found in this clip.");
    executeAIResponse(
      JSON.stringify([
        { type: "TRIM_SILENCE", clipId: clip.id, ranges, minDuration: 0.25 },
      ]),
    );
    return `Removed ${ranges.length} silent section(s) from "${clip.name}".`;
  } finally {
    await audioContext.close();
  }
}

function flowCaptions(project: ProjectState): string {
  const clips = clipsOf(project)
    .filter((clip) => clip.kind === "video" || clip.kind === "image")
    .sort((a, b) => a.start - b.start);
  if (!clips.length) throw new Error("Add at least one video or image clip before adding captions.");
  const captions = clips.map((clip) => ({
    start: clip.start,
    end: clip.start + Math.min(clip.duration, 4),
    text: clip.name,
  }));
  executeAIResponse(
    JSON.stringify([{ type: "ADD_CAPTION_TRACK", name: "Auto captions", captions }]),
  );
  return `Added a caption track with ${captions.length} captions (one per clip).`;
}

function flowHighlights(project: ProjectState): string {
  const clips = clipsOf(project)
    .filter((clip) => clip.kind === "video" || clip.kind === "image")
    .sort((a, b) => a.start - b.start);
  if (!clips.length) throw new Error("Add at least one video or image clip first.");
  const segments = clips.map((clip) => ({
    clipId: clip.id,
    start: clip.start,
    end: Math.min(clip.start + clip.duration, clip.start + 4),
  }));
  executeAIResponse(
    JSON.stringify([{ type: "GENERATE_HIGHLIGHT_REEL", segments, name: "Highlight reel" }]),
  );
  return `Built a highlight reel from ${segments.length} moment(s), one per clip.`;
}

function flowAutoDuck(project: ProjectState): string {
  const music = project.tracks.find(
    (track) => track.kind === "audio" && track.clips.length > 0,
  );
  const speech = project.tracks.find(
    (track) =>
      track.id !== music?.id &&
      (track.kind === "video" || track.kind === "audio") &&
      track.clips.length > 0,
  );
  if (!music || !speech) {
    throw new Error("Auto ducking needs a music track and a speech track, each with clips.");
  }
  executeAIResponse(
    JSON.stringify([
      {
        type: "AUTO_DUCK_AUDIO",
        targetTrackId: music.id,
        speechTrackId: speech.id,
        duckVolume: 0.25,
      },
    ]),
  );
  return `"${music.name}" now ducks to 25% while "${speech.name}" plays.`;
}

function flowPolish(project: ProjectState): string {
  const clips = clipsOf(project).filter(
    (clip) => clip.kind === "video" || clip.kind === "image",
  );
  if (!clips.length) throw new Error("Add at least one video or image clip first.");
  const actions: AIAction[] = clips.map((clip) => ({
    type: "APPLY_FILTER",
    clipId: clip.id,
    filter: { type: "brightness", value: 104, enabled: true },
  }));
  for (const track of project.tracks) {
    if (track.kind !== "video" && track.kind !== "overlay") continue;
    const ordered = [...track.clips].sort((a, b) => a.start - b.start);
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const next = ordered[index];
      if (Math.abs(previous.start + previous.duration - next.start) < 0.05) {
        actions.push({
          type: "ADD_TRANSITION",
          fromClipId: previous.id,
          toClipId: next.id,
          duration: 0.5,
          transitionType: "crossfade",
        });
      }
    }
  }
  executeAIResponse(JSON.stringify(actions));
  return `Applied a brightness pass to ${clips.length} clip(s) and crossfaded adjacent clips.`;
}

async function flowCleanEdit(project: ProjectState): Promise<string> {
  const steps: string[] = [];
  const attempt = (label: string, flow: () => string | Promise<string>): void => {
    Promise.resolve()
      .then(flow)
      .then((summary) => steps.push(`${label}: ${summary}`))
      .catch((error: unknown) => steps.push(`${label}: skipped (${errorMessage(error)})`));
  };
  attempt("Silence cut", () => flowSilenceCut(project));
  attempt("Auto ducking", () => flowAutoDuck(project));
  attempt("Quick polish", () => flowPolish(project));
  attempt("Captions", () => flowCaptions(project));
  attempt("Highlight reel", () => flowHighlights(project));
  await new Promise((resolve) => setTimeout(resolve, 150));
  return steps.join("\n");
}

async function flowSocialPack(project: ProjectState): Promise<string> {
  const steps: string[] = [];
  const attempt = (label: string, flow: () => string | Promise<string>): void => {
    Promise.resolve()
      .then(flow)
      .then((summary) => steps.push(`${label}: ${summary}`))
      .catch((error: unknown) => steps.push(`${label}: skipped (${errorMessage(error)})`));
  };
  attempt("Captions", () => flowCaptions(project));
  attempt("Auto ducking", () => flowAutoDuck(project));
  attempt("Quick polish", () => flowPolish(project));
  attempt("Highlight reel", () => flowHighlights(project));
  await new Promise((resolve) => setTimeout(resolve, 150));
  return steps.join("\n");
}

const FLOWS: Record<string, (project: ProjectState) => string | Promise<string>> = {
  silence: flowSilenceCut,
  captions: flowCaptions,
  highlights: flowHighlights,
  duck: flowAutoDuck,
  polish: flowPolish,
  cleanedit: flowCleanEdit,
  socialpack: flowSocialPack,
};

export async function runAITask(task: AITask, notify: Notify): Promise<void> {
  const flow = FLOWS[task.id];
  if (!flow) {
    notify("Coming soon", "This AI task is not wired up yet.");
    return;
  }
  useTimelineStore.getState().setAiBusy(true, `${task.title}...`);
  try {
    const summary = await flow(useTimelineStore.getState().project);
    useTimelineStore.getState().pushAiMessage({
      role: "ai",
      text: `${task.title}\n${summary}`,
    });
    notify(`${task.title} finished`, summary.split("\n")[0]);
  } catch (error) {
    notify(`${task.title} failed`, errorMessage(error));
  } finally {
    useTimelineStore.getState().setAiBusy(false);
  }
}

export async function sendChat(prompt: string, notify: Notify): Promise<void> {
  const trimmed = prompt.trim();
  if (!trimmed) return;
  const store = useTimelineStore.getState();
  store.pushAiMessage({ role: "user", text: trimmed });
  if (!store.aiSettings.apiKey) {
    store.pushAiMessage({
      role: "ai",
      text: "Add an OpenAI API key in Settings and I can edit the timeline for you directly. Meanwhile, the one-click tasks work fully offline.",
    });
    notify("AI key missing", "Open Settings to add your OpenAI API key.");
    return;
  }
  store.setAiBusy(true, "Thinking...");
  try {
    const project = useTimelineStore.getState().project;
    const reply = await callAI({
      apiKey: store.aiSettings.apiKey,
      model: store.aiSettings.model,
      temperature: store.aiSettings.temperature,
      system: buildSystemPrompt(project),
      user: `${trimmed}\n\nReturn only the JSON array of actions. If nothing should change, return [].`,
    });
    let text = reply;
    let actionCount = 0;
    try {
      const actions = executeAIResponse(reply);
      actionCount = actions.length;
      text = actions.length ? summarizeActions(actions) : "Nothing needed changing on the timeline.";
    } catch {
      // The model replied with prose instead of actions — show it as-is.
    }
    useTimelineStore.getState().pushAiMessage({ role: "ai", text, actionCount });
    notify(
      actionCount ? "AI applied changes" : "AI replied",
      actionCount ? `${actionCount} action(s) applied to the timeline.` : undefined,
    );
  } catch (error) {
    useTimelineStore
      .getState()
      .pushAiMessage({ role: "ai", text: `Request failed: ${errorMessage(error)}` });
    notify("AI request failed", errorMessage(error));
  } finally {
    useTimelineStore.getState().setAiBusy(false);
  }
}

export function homeworkFromTask(task: AITask, dueDate: string): HomeworkItem {
  return {
    id: crypto.randomUUID(),
    title: task.title,
    description: task.description,
    kind: task.kind,
    dueDate,
    status: "todo",
    steps: [
      { id: crypto.randomUUID(), text: "Read the task description", done: false },
      {
        id: crypto.randomUUID(),
        text: `Run "${task.title}" from the AI tools`,
        done: false,
        runTaskId: task.id,
      },
      { id: crypto.randomUUID(), text: "Review the changes and fine-tune manually", done: false },
    ],
    createdAt: new Date().toISOString(),
  };
}

export function buildSuggestions(prompt: string): Suggestion[] {
  const text = prompt.toLowerCase();
  const found = new Map<string, AITask>();
  const add = (taskId: string): void => {
    const task = AI_TASKS.find((candidate) => candidate.id === taskId);
    if (task && !found.has(task.id)) found.set(task.id, task);
  };
  const keywords: Array<[RegExp, string[]]> = [
    [/silence|dead air|quiet|pause/, ["silence"]],
    [/caption|subtitle|text overlay/, ["captions"]],
    [/highlight|best moment|reel|montage/, ["highlights"]],
    [/duck|music|speech|voice ?over/, ["duck"]],
    [/polish|filter|look|colou?r|grade/, ["polish"]],
    [/clean|full edit|post[- ]?production|tighten|rough cut/, ["cleanedit", "silence", "polish"]],
    [/social|tiktok|reels?|shorts?|vertical|youtube/, ["socialpack", "captions", "highlights"]],
    [/home ?work|assignment|study|school|project plan/, ["cleanedit", "socialpack"]],
  ];
  for (const [pattern, taskIds] of keywords) {
    if (pattern.test(text)) taskIds.forEach(add);
  }
  return [...found.values()].map((task) => ({
    id: crypto.randomUUID(),
    label: task.title,
    kind: task.kind,
    taskId: task.id,
  }));
}

export function isHomeworkOverdue(homework: HomeworkItem): boolean {
  if (homework.status === "done" || !homework.dueDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${homework.dueDate}T23:59:59`) < today;
}
