import { create } from "zustand";
import type {
  AIAction,
  CaptionStyle,
  Clip,
  Filter,
  Id,
  ProjectState,
  Track,
  TrackKind,
  Transition,
} from "../types/timeline";

const makeId = (): Id => crypto.randomUUID();

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
  return project.tracks.flatMap((track) => track.clips).find((c) => c.id === clipId);
}

function removeClip(project: ProjectState, clipId: Id): void {
  for (const track of project.tracks) {
    track.clips = track.clips.filter((clip) => clip.id !== clipId);
  }
  project.transitions = project.transitions.filter(
    (t) => t.fromClipId !== clipId && t.toClipId !== clipId,
  );
}

function addClip(project: ProjectState, trackId: Id, clip: Clip): void {
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
  const rightDuration = clip.duration - leftDuration;
  const right: Clip = {
    ...structuredClone(clip),
    id: makeId(),
    name: `${clip.name} (split)`,
    start: time,
    duration: rightDuration,
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
    .map((range) => ({
      start: Math.max(clipStart, range.start),
      end: Math.min(clipEnd, range.end),
    }))
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
    addClip(project, base.trackId, {
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
    case "CUT_CLIP": {
      const clip = findClip(project, action.clipId);
      if (!clip) throw new Error(`Clip not found: ${action.clipId}`);
      removeTimeRanges(project, action.clipId, [{ start: action.start, end: action.end }]);
      break;
    }
    case "TRIM_SILENCE":
      removeTimeRanges(project, action.clipId, action.ranges, action.minDuration ?? 0);
      break;

    case "ADD_CAPTION_TRACK": {
      const trackId = makeId();
      const style: CaptionStyle = {
        fontFamily: "Arial",
        fontSize: 48,
        color: "#ffffff",
        strokeColor: "#000000",
        strokeWidth: 3,
        backgroundColor: "rgba(0,0,0,0.35)",
        align: "center",
        ...action.style,
      };
      const track: Track = {
        id: trackId,
        name: action.name ?? "Captions",
        kind: "text",
        order: project.tracks.length,
        muted: false,
        solo: false,
        hidden: false,
        locked: false,
        snapping: true,
        rippleEdit: false,
        clips: action.captions.map((caption) => ({
          id: makeId(),
          trackId,
          kind: "text",
          name: caption.text.slice(0, 40) || "Caption",
          start: caption.start,
          duration: Math.max(0, caption.end - caption.start),
          sourceStart: 0,
          text: caption.text,
          transform: { ...defaultTransform, y: project.height * 0.38 },
          filters: [],
          speed: 1,
          volume: 1,
          pan: 0,
          keyframes: {},
          captionStyle: style,
        })),
      };
      project.tracks.push(track);
      break;
    }

    case "APPLY_FILTER": {
      const clip = findClip(project, action.clipId);
      if (!clip) throw new Error(`Clip not found: ${action.clipId}`);
      clip.filters.push({ ...action.filter, id: makeId() } as Filter);
      break;
    }

    case "AUTO_DUCK_AUDIO": {
      const speechTrack = project.tracks.find((t) => t.id === action.speechTrackId);
      const targetTrack = project.tracks.find((t) => t.id === action.targetTrackId);
      if (!speechTrack || !targetTrack) throw new Error("Audio track not found.");

      const duck = Math.min(1, Math.max(0, action.duckVolume));
      const attack = Math.max(0, action.attack ?? 0.12);
      const release = Math.max(0, action.release ?? 0.25);
      const speechIntervals = speechTrack.clips.map((clip) => ({
        start: clip.start,
        end: clip.start + clip.duration,
      }));

      for (const clip of targetTrack.clips) {
        const points: Array<{ time: number; value: number }> = [{ time: 0, value: 1 }];
        for (const interval of speechIntervals) {
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
        clip.keyframes.volume = points
          .sort((a, b) => a.time - b.time)
          .map((point) => ({ id: makeId(), ...point, easing: "linear" }));
      }
      break;
    }

    case "ADD_TRANSITION": {
      const from = findClip(project, action.fromClipId);
      const to = findClip(project, action.toClipId);
      if (!from || !to) throw new Error("Transition clip not found.");
      const transition: Transition = {
        id: makeId(),
        fromClipId: from.id,
        toClipId: to.id,
        duration: Math.max(0, action.duration),
        type: action.transitionType,
      };
      project.transitions.push(transition);
      break;
    }

    case "GENERATE_HIGHLIGHT_REEL": {
      const trackId = makeId();
      const track: Track = {
        id: trackId,
        name: action.name ?? "Highlight reel",
        kind: "video",
        order: project.tracks.length,
        muted: false,
        solo: false,
        hidden: false,
        locked: false,
        snapping: true,
        rippleEdit: false,
        clips: [],
      };

      let cursor = 0;
      for (const segment of action.segments) {
        const source = findClip(project, segment.clipId);
        if (!source) throw new Error(`Clip not found: ${segment.clipId}`);
        const sourceOffset = Math.max(0, segment.start - source.start);
        const duration = Math.max(0, segment.end - segment.start);
        track.clips.push({
          ...structuredClone(source),
          id: makeId(),
          trackId,
          name: `${source.name} highlight`,
          start: cursor,
          duration,
          sourceStart: source.sourceStart + sourceOffset * source.speed,
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
  setProject(project: ProjectState): void;
  setPlayhead(time: number): void;
  addTrack(kind: TrackKind, name?: string): Id;
  addClip(trackId: Id, clip: Omit<Clip, "trackId">): void;
  moveClip(clipId: Id, start: number): void;
  trimClip(clipId: Id, start: number, end: number): void;
  splitClip(clipId: Id, time?: number): void;
  duplicateClip(clipId: Id): Id;
  deleteClip(clipId: Id): void;
  executeAI(actions: AIAction[]): void;
  undo(): void;
  redo(): void;
}

export const useTimelineStore = create<TimelineStore>((set, get) => {
  const edit = (mutate: (project: ProjectState) => void): void => {
    set((state) => {
      const project = structuredClone(state.project);
      mutate(project);
      updateDuration(project);
      return {
        project,
        past: [...state.past.slice(-99), state.project],
        future: [],
      };
    });
  };

  return {
    project: createEmptyProject(),
    past: [],
    future: [],

    setProject(project) {
      set({ project: structuredClone(project), past: [], future: [] });
    },

    setPlayhead(time) {
      set((state) => ({
        project: {
          ...state.project,
          playhead: Math.max(0, Math.min(time, state.project.duration)),
        },
      }));
    },

    addTrack(kind, name) {
      const id = makeId();
      edit((project) => {
        project.tracks.push({
          id,
          name: name ?? `${kind} ${project.tracks.length + 1}`,
          kind,
          order: project.tracks.length,
          muted: false,
          solo: false,
          hidden: false,
          locked: false,
          snapping: true,
          rippleEdit: false,
          clips: [],
        });
      });
      return id;
    },

    addClip(trackId, clip) {
      edit((project) => {
        addClip(project, trackId, {
          ...structuredClone(clip),
          trackId,
        });
      });
    },

    moveClip(clipId, start) {
      edit((project) => {
        const clip = findClip(project, clipId);
        if (!clip) throw new Error(`Clip not found: ${clipId}`);
        const track = project.tracks.find((t) => t.id === clip.trackId);
        if (track?.locked) throw new Error(`Track is locked: ${track.id}`);
        clip.start = Math.max(0, start);
        track?.clips.sort((a, b) => a.start - b.start);
      });
    },

    trimClip(clipId, start, end) {
      edit((project) => {
        const clip = findClip(project, clipId);
        if (!clip) throw new Error(`Clip not found: ${clipId}`);
        const track = project.tracks.find((t) => t.id === clip.trackId);
        if (track?.locked) throw new Error(`Track is locked: ${track.id}`);
        const oldEnd = clip.start + clip.duration;
        const newStart = Math.max(clip.start, start);
        const newEnd = Math.min(oldEnd, end);
        if (newEnd <= newStart) throw new Error("Trim would make an empty clip.");
        const removed = newStart - clip.start;
        clip.sourceStart += removed * clip.speed;
        clip.start = newStart;
        clip.duration = newEnd - newStart;
        clip.sourceEnd = clip.sourceStart + clip.duration * clip.speed;
      });
    },

    splitClip(clipId, time = get().project.playhead) {
      edit((project) => splitAt(project, clipId, time));
    },

    duplicateClip(clipId) {
      const duplicateId = makeId();
      edit((project) => {
        const source = findClip(project, clipId);
        if (!source) throw new Error(`Clip not found: ${clipId}`);
        const copy = {
          ...structuredClone(source),
          id: duplicateId,
          name: `${source.name} copy`,
          start: source.start + source.duration,
        };
        addClip(project, source.trackId, copy);
      });
      return duplicateId;
    },

    deleteClip(clipId) {
      edit((project) => removeClip(project, clipId));
    },

    executeAI(actions) {
      edit((project) => {
        for (const action of actions) applyAction(project, action);
      });
    },

    undo() {
      set((state) => {
        const previous = state.past.at(-1);
        if (!previous) return state;
        return {
          project: previous,
          past: state.past.slice(0, -1),
          future: [state.project, ...state.future],
        };
      });
    },

    redo() {
      set((state) => {
        const next = state.future[0];
        if (!next) return state;
        return {
          project: next,
          past: [...state.past, state.project],
          future: state.future.slice(1),
        };
      });
    },
  };
});
