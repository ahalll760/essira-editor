import { create } from "zustand";
import type {
  AIAction,
  AIMessage,
  AISession,
  AISettings,
  CaptionStyle,
  Clip,
  Filter,
  HomeworkItem,
  Id,
  ProjectState,
  Suggestion,
  Track,
  TrackKind,
  Transition,
} from "../types/timeline";

const makeId = (): Id => crypto.randomUUID();
const nowIso = (): string => new Date().toISOString();

const defaultTransform: Clip["transform"] = {
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  opacity: 1,
  blendMode: "source-over",
};

export function createEmptyProject(
  name = "Untitled project",
  width = 1920,
  height = 1080,
  frameRate = 30,
): ProjectState {
  return {
    id: makeId(),
    name,
    width,
    height,
    frameRate,
    duration: 0,
    playhead: 0,
    zoom: 80,
    tracks: [],
    transitions: [],
  };
}

export function createDefaultAiSettings(): AISettings {
  return { apiKey: "", model: "gpt-4o-mini", temperature: 0.2, autoSuggest: true };
}

export function createDefaultAiSession(): AISession {
  return {
    id: makeId(),
    title: "Editing assistant",
    createdAt: nowIso(),
    messages: [
      {
        id: makeId(),
        role: "ai",
        time: nowIso(),
        text: "Hi! I'm your editing assistant. Ask me to cut a clip, remove silence, add captions, build a highlight reel, or plan homework for this project. Try: \"cut the first clip between 2 and 3 seconds\".",
      },
    ],
  };
}

function updateDuration(project: ProjectState): void {
  project.duration = Math.max(
    0,
    ...project.tracks.flatMap((track) =>
      track.clips.map((clip) => clip.start + clip.duration),
    ),
  );
  project.playhead = Math.min(project.playhead, project.duration);
}

function findClip(project: ProjectState, clipId: Id): Clip | undefined {
  return project.tracks.flatMap((track) => track.clips).find((clip) => clip.id === clipId);
}

function removeClip(project: ProjectState, clipId: Id): void {
  for (const track of project.tracks) {
    track.clips = track.clips.filter((clip) => clip.id !== clipId);
  }
  project.transitions = project.transitions.filter(
    (transition) => transition.fromClipId !== clipId && transition.toClipId !== clipId,
  );
}

function addClipToProject(project: ProjectState, trackId: Id, clip: Clip): void {
  const track = project.tracks.find((candidate) => candidate.id === trackId);
  if (!track) throw new Error(`Track not found: ${trackId}`);
  if (track.locked) throw new Error(`Track is locked: ${trackId}`);
  clip.trackId = trackId;
  track.clips.push(clip);
  track.clips.sort((a, b) => a.start - b.start);
}

function splitAt(project: ProjectState, clipId: Id, time: number): void {
  const clip = findClip(project, clipId);
  if (!clip) throw new Error(`Clip not found: ${clipId}`);
  if (time <= clip.start || time >= clip.start + clip.duration) {
    throw new Error("Split point must be inside the clip.");
  }
  const track = project.tracks.find((candidate) => candidate.id === clip.trackId);
  if (!track) throw new Error(`Track not found: ${clip.trackId}`);
  if (track.locked) throw new Error(`Track is locked: ${track.id}`);

  const leftDuration = time - clip.start;
  const right: Clip = {
    ...structuredClone(clip),
    id: makeId(),
    name: `${clip.name} (split)`,
    start: time,
    duration: clip.duration - leftDuration,
    sourceStart: clip.sourceStart + leftDuration * clip.speed,
  };
  clip.duration = leftDuration;
  clip.sourceEnd = clip.sourceStart + leftDuration * clip.speed;
  track.clips.push(right);
  track.clips.sort((a, b) => a.start - b.start);
}

function removeTimeRanges(
  project: ProjectState,
  clipId: Id,
  ranges: Array<{ start: number; end: number }>,
  minimumDuration = 0,
): void {
  const original = findClip(project, clipId);
  if (!original) throw new Error(`Clip not found: ${clipId}`);

  const clipStart = original.start;
  const clipEnd = original.start + original.duration;
  const valid = ranges
    .map((range) => ({ start: Math.max(clipStart, range.start), end: Math.min(clipEnd, range.end) }))
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start);
  const merged: typeof valid = [];
  for (const range of valid) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }

  const keep: Array<{ start: number; end: number }> = [];
  let cursor = clipStart;
  for (const range of merged) {
    if (range.start - cursor >= minimumDuration) keep.push({ start: cursor, end: range.start });
    cursor = Math.max(cursor, range.end);
  }
  if (clipEnd - cursor >= minimumDuration) keep.push({ start: cursor, end: clipEnd });

  const base = structuredClone(original);
  removeClip(project, clipId);
  for (const segment of keep) {
    const offset = segment.start - clipStart;
    addClipToProject(project, base.trackId, {
      ...structuredClone(base),
      id: makeId(),
      start: segment.start,
      duration: segment.end - segment.start,
      sourceStart: base.sourceStart + offset * base.speed,
    });
  }
}

function applyAction(project: ProjectState, action: AIAction): void {
  switch (action.type) {
    case "CUT_CLIP":
      if (!findClip(project, action.clipId)) throw new Error(`Clip not found: ${action.clipId}`);
      removeTimeRanges(project, action.clipId, [{ start: action.start, end: action.end }]);
      break;
    case "TRIM_SILENCE":
      removeTimeRanges(project, action.clipId, action.ranges, action.minDuration ?? 0);
      break;
    case "ADD_CAPTION_TRACK": {
      const trackId = makeId();
      const style: CaptionStyle = {
        fontFamily: "Arial", fontSize: 48, color: "#ffffff", strokeColor: "#000000",
        strokeWidth: 3, backgroundColor: "rgba(0,0,0,0.35)", align: "center", ...action.style,
      };
      project.tracks.push({
        id: trackId, name: action.name ?? "Captions", kind: "text", order: project.tracks.length,
        muted: false, solo: false, hidden: false, locked: false, snapping: true, rippleEdit: false,
        clips: action.captions.map((caption) => ({
          id: makeId(), trackId, kind: "text", name: caption.text.slice(0, 40) || "Caption",
          start: caption.start, duration: caption.end - caption.start, sourceStart: 0, text: caption.text,
          transform: { ...defaultTransform, y: project.height * 0.38 }, filters: [], speed: 1,
          volume: 1, pan: 0, keyframes: {}, captionStyle: style,
        })),
      });
      break;
    }
    case "APPLY_FILTER": {
      const clip = findClip(project, action.clipId);
      if (!clip) throw new Error(`Clip not found: ${action.clipId}`);
      clip.filters.push({ ...action.filter, id: makeId() } as Filter);
      break;
    }
    case "AUTO_DUCK_AUDIO": {
      const speechTrack = project.tracks.find((track) => track.id === action.speechTrackId);
      const targetTrack = project.tracks.find((track) => track.id === action.targetTrackId);
      if (!speechTrack || !targetTrack) throw new Error("Audio track not found.");
      const duck = Math.min(1, Math.max(0, action.duckVolume));
      const attack = Math.max(0, action.attack ?? 0.12);
      const release = Math.max(0, action.release ?? 0.25);
      const intervals = speechTrack.clips.map((clip) => ({ start: clip.start, end: clip.start + clip.duration }));
      for (const clip of targetTrack.clips) {
        const points: Array<{ time: number; value: number }> = [{ time: 0, value: 1 }];
        for (const interval of intervals) {
          const start = Math.max(clip.start, interval.start);
          const end = Math.min(clip.start + clip.duration, interval.end);
          if (end <= start) continue;
          points.push(
            { time: Math.max(0, start - clip.start - attack), value: 1 },
            { time: Math.max(0, start - clip.start), value: duck },
            { time: Math.max(0, end - clip.start), value: duck },
            { time: Math.min(clip.duration, end - clip.start + release), value: 1 },
          );
        }
        clip.keyframes.volume = points.sort((a, b) => a.time - b.time)
          .map((point) => ({ id: makeId(), ...point, easing: "linear" }));
      }
      break;
    }
    case "ADD_TRANSITION": {
      if (!findClip(project, action.fromClipId) || !findClip(project, action.toClipId)) {
        throw new Error("Transition clip not found.");
      }
      const transition: Transition = {
        id: makeId(), fromClipId: action.fromClipId, toClipId: action.toClipId,
        duration: Math.max(0, action.duration), type: action.transitionType,
      };
      project.transitions.push(transition);
      break;
    }
    case "GENERATE_HIGHLIGHT_REEL": {
      const trackId = makeId();
      const track: Track = {
        id: trackId, name: action.name ?? "Highlight reel", kind: "video", order: project.tracks.length,
        muted: false, solo: false, hidden: false, locked: false, snapping: true, rippleEdit: false, clips: [],
      };
      let cursor = 0;
      for (const segment of action.segments) {
        const source = findClip(project, segment.clipId);
        if (!source) throw new Error(`Clip not found: ${segment.clipId}`);
        const offset = Math.max(0, segment.start - source.start);
        const duration = Math.max(0, segment.end - segment.start);
        track.clips.push({
          ...structuredClone(source), id: makeId(), trackId, name: `${source.name} highlight`,
          start: cursor, duration, sourceStart: source.sourceStart + offset * source.speed, sourceEnd: undefined,
        });
        cursor += duration;
      }
      project.tracks.push(track);
      break;
    }
  }
}

export interface TimelineStore {
  project: ProjectState;
  past: ProjectState[];
  future: ProjectState[];
  selectedClipId: Id | null;
  lastSavedAt: string;
  aiSettings: AISettings;
  aiSession: AISession;
  homework: HomeworkItem[];
  suggestions: Suggestion[];
  aiBusy: boolean;
  aiStatus: string | null;
  setProject(project: ProjectState): void;
  updateProject(patch: Partial<Pick<ProjectState, "name" | "width" | "height" | "frameRate">>): void;
  createNewProject(): void;
  markSaved(): void;
  setPlayhead(time: number): void;
  setZoom(zoom: number): void;
  addTrack(kind: TrackKind, name?: string): Id;
  deleteTrack(trackId: Id): void;
  updateTrack(trackId: Id, patch: Partial<Track>): void;
  addClip(trackId: Id, clip: Omit<Clip, "trackId">): void;
  updateClip(clipId: Id, patch: Partial<Clip>): void;
  moveClip(clipId: Id, start: number): void;
  trimClip(clipId: Id, start: number, end: number): void;
  splitClip(clipId: Id, time?: number): void;
  duplicateClip(clipId: Id): Id;
  deleteClip(clipId: Id): void;
  executeAI(actions: AIAction[]): void;
  undo(): void;
  redo(): void;
  setSelectedClip(clipId: Id | null): void;
  setAiSettings(patch: Partial<AISettings>): void;
  pushAiMessage(message: { role: AIMessage["role"]; text: string; actionCount?: number }): void;
  clearAiSession(): void;
  addHomework(item: HomeworkItem): void;
  updateHomework(homeworkId: Id, patch: Partial<Pick<HomeworkItem, "title" | "description" | "dueDate" | "status">>): void;
  removeHomework(homeworkId: Id): void;
  toggleHomeworkStep(homeworkId: Id, stepId: Id): void;
  setSuggestions(suggestions: Suggestion[]): void;
  setAiBusy(busy: boolean, status?: string): void;
}

export const useTimelineStore = create<TimelineStore>((set, get) => {
  const edit = (mutate: (project: ProjectState) => void): void => {
    set((state) => {
      const project = structuredClone(state.project);
      mutate(project);
      updateDuration(project);
      return { project, past: [...state.past.slice(-99), state.project], future: [] };
    });
  };

  return {
    project: createEmptyProject(),
    past: [],
    future: [],
    selectedClipId: null,
    lastSavedAt: nowIso(),
    aiSettings: createDefaultAiSettings(),
    aiSession: createDefaultAiSession(),
    homework: [],
    suggestions: [],
    aiBusy: false,
    aiStatus: null,

    setProject(project) { set({ project: structuredClone(project), past: [], future: [] }); },
    updateProject(patch) { set((state) => ({ project: { ...state.project, ...patch } })); },
    createNewProject() {
      set({ project: createEmptyProject(), past: [], future: [], selectedClipId: null });
      get().markSaved();
    },
    markSaved() { set({ lastSavedAt: nowIso() }); },

    setPlayhead(time) {
      set((state) => ({ project: { ...state.project, playhead: Math.max(0, Math.min(time, state.project.duration)) } }));
    },
    setZoom(zoom) {
      set((state) => ({ project: { ...state.project, zoom: Math.min(400, Math.max(8, zoom)) } }));
    },
    addTrack(kind, name) {
      const id = makeId();
      edit((project) => project.tracks.push({
        id, name: name ?? `${kind} ${project.tracks.length + 1}`, kind, order: project.tracks.length,
        muted: false, solo: false, hidden: false, locked: false, snapping: true, rippleEdit: false, clips: [],
      }));
      return id;
    },
    deleteTrack(trackId) {
      edit((project) => {
        const track = project.tracks.find((candidate) => candidate.id === trackId);
        if (!track) return;
        const clipIds = new Set(track.clips.map((clip) => clip.id));
        project.tracks = project.tracks.filter((candidate) => candidate.id !== trackId);
        project.transitions = project.transitions.filter(
          (transition) => !clipIds.has(transition.fromClipId) && !clipIds.has(transition.toClipId),
        );
      });
    },
    updateTrack(trackId, patch) {
      edit((project) => {
        const track = project.tracks.find((candidate) => candidate.id === trackId);
        if (!track) throw new Error(`Track not found: ${trackId}`);
        Object.assign(track, patch, { id: track.id, clips: track.clips });
      });
    },
    addClip(trackId, clip) {
      edit((project) => addClipToProject(project, trackId, { ...structuredClone(clip), trackId }));
    },
    updateClip(clipId, patch) {
      edit((project) => {
        const clip = findClip(project, clipId);
        if (!clip) throw new Error(`Clip not found: ${clipId}`);
        const track = project.tracks.find((candidate) => candidate.id === clip.trackId);
        if (track?.locked) throw new Error(`Track is locked: ${track.id}`);
        Object.assign(clip, patch, { id: clip.id, trackId: clip.trackId });
        track?.clips.sort((a, b) => a.start - b.start);
      });
    },
    moveClip(clipId, start) {
      edit((project) => {
        const clip = findClip(project, clipId);
        if (!clip) throw new Error(`Clip not found: ${clipId}`);
        const track = project.tracks.find((candidate) => candidate.id === clip.trackId);
        if (track?.locked) throw new Error(`Track is locked: ${track.id}`);
        clip.start = Math.max(0, start);
        track?.clips.sort((a, b) => a.start - b.start);
      });
    },
    trimClip(clipId, start, end) {
      edit((project) => {
        const clip = findClip(project, clipId);
        if (!clip) throw new Error(`Clip not found: ${clipId}`);
        const track = project.tracks.find((candidate) => candidate.id === clip.trackId);
        if (track?.locked) throw new Error(`Track is locked: ${track.id}`);
        const newStart = Math.max(clip.start, start);
        const newEnd = Math.min(clip.start + clip.duration, end);
        if (newEnd <= newStart) throw new Error("Trim would make an empty clip.");
        clip.sourceStart += (newStart - clip.start) * clip.speed;
        clip.start = newStart;
        clip.duration = newEnd - newStart;
        clip.sourceEnd = clip.sourceStart + clip.duration * clip.speed;
      });
    },
    splitClip(clipId, time = get().project.playhead) { edit((project) => splitAt(project, clipId, time)); },
    duplicateClip(clipId) {
      const duplicateId = makeId();
      edit((project) => {
        const source = findClip(project, clipId);
        if (!source) throw new Error(`Clip not found: ${clipId}`);
        addClipToProject(project, source.trackId, {
          ...structuredClone(source), id: duplicateId, name: `${source.name} copy`, start: source.start + source.duration,
        });
      });
      return duplicateId;
    },
    deleteClip(clipId) { edit((project) => removeClip(project, clipId)); },
    executeAI(actions) { edit((project) => actions.forEach((action) => applyAction(project, action))); },
    undo() {
      set((state) => {
        const previous = state.past.at(-1);
        if (!previous) return state;
        return { project: previous, past: state.past.slice(0, -1), future: [state.project, ...state.future] };
      });
    },
    redo() {
      set((state) => {
        const next = state.future[0];
        if (!next) return state;
        return { project: next, past: [...state.past, state.project], future: state.future.slice(1) };
      });
    },

    setSelectedClip(clipId) { set({ selectedClipId: clipId }); },
    setAiSettings(patch) { set((state) => ({ aiSettings: { ...state.aiSettings, ...patch } })); },
    pushAiMessage(message) {
      set((state) => ({
        aiSession: {
          ...state.aiSession,
          messages: [
            ...state.aiSession.messages,
            { id: makeId(), time: nowIso(), role: message.role, text: message.text, actionCount: message.actionCount },
          ],
        },
      }));
    },
    clearAiSession() { set({ aiSession: createDefaultAiSession() }); },
    addHomework(item) {
      set((state) => ({ homework: [structuredClone(item), ...state.homework] }));
    },
    updateHomework(homeworkId, patch) {
      set((state) => ({
        homework: state.homework.map((item) => (item.id === homeworkId ? { ...item, ...patch } : item)),
      }));
    },
    removeHomework(homeworkId) {
      set((state) => ({ homework: state.homework.filter((item) => item.id !== homeworkId) }));
    },
    toggleHomeworkStep(homeworkId, stepId) {
      set((state) => ({
        homework: state.homework.map((item) =>
          item.id === homeworkId
            ? {
                ...item,
                steps: item.steps.map((step) => (step.id === stepId ? { ...step, done: !step.done } : step)),
              }
            : item,
        ),
      }));
    },
    setSuggestions(suggestions) { set({ suggestions }); },
    setAiBusy(busy, status) { set({ aiBusy: busy, aiStatus: busy ? (status ?? "Working...") : null }); },
  };
});
