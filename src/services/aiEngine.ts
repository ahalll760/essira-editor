import { z } from "zod";
import type { AIAction, ProjectState } from "../types/timeline";
import { useTimelineStore } from "../store/timelineStore";

const id = z.string().min(1);
const time = z.number().finite().nonnegative();

const captionSchema = z
  .object({
    start: time,
    end: time,
    text: z.string().max(10_000),
  })
  .strict()
  .refine((caption) => caption.end > caption.start, {
    message: "Caption end must be after start.",
  });

const filterSchema = z
  .object({
    type: z.enum(["brightness", "contrast", "saturation", "hue", "blur", "custom"]),
    value: z.number().finite(),
    css: z.string().max(256).optional(),
    enabled: z.boolean(),
  })
  .strict();

const actionSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("CUT_CLIP"),
      clipId: id,
      start: time,
      end: time,
    })
    .strict()
    .refine((action) => action.end > action.start, {
      message: "Cut end must be after start.",
    }),

  z.object({
    type: z.literal("TRIM_SILENCE"),
    clipId: id,
    ranges: z.array(z.object({ start: time, end: time }).strict()),
    minDuration: time.optional(),
  }).strict(),

  z.object({
    type: z.literal("ADD_CAPTION_TRACK"),
    name: z.string().max(120).optional(),
    captions: z.array(captionSchema),
    style: z.object({
      fontFamily: z.string().max(120).optional(),
      fontSize: z.number().positive().max(500).optional(),
      color: z.string().max(64).optional(),
      strokeColor: z.string().max(64).optional(),
      strokeWidth: z.number().nonnegative().max(30).optional(),
      backgroundColor: z.string().max(128).optional(),
      shadow: z.string().max(256).optional(),
      align: z.enum(["left", "right", "center", "start", "end"]).optional(),
      highlightColor: z.string().max(64).optional(),
    }).strict().optional(),
  }).strict(),

  z.object({
    type: z.literal("APPLY_FILTER"),
    clipId: id,
    filter: filterSchema,
  }).strict(),

  z.object({
    type: z.literal("AUTO_DUCK_AUDIO"),
    targetTrackId: id,
    speechTrackId: id,
    duckVolume: z.number().min(0).max(1),
    attack: time.optional(),
    release: time.optional(),
  }).strict(),

  z.object({
    type: z.literal("ADD_TRANSITION"),
    fromClipId: id,
    toClipId: id,
    duration: time,
    transitionType: z.enum(["crossfade", "dip-to-black", "wipe"]),
  }).strict(),

  z.object({
    type: z.literal("GENERATE_HIGHLIGHT_REEL"),
    segments: z.array(
      z
        .object({
          clipId: id,
          start: time,
          end: time,
        })
        .strict()
        .refine((segment) => segment.end > segment.start),
    ),
    name: z.string().max(120).optional(),
  }).strict(),
]);

const actionsSchema = z.array(actionSchema).max(500);

export function buildSystemPrompt(project: ProjectState): string {
  const clips = project.tracks.flatMap((track) =>
    track.clips.map((clip) => ({
      id: clip.id,
      trackId: clip.trackId,
      kind: clip.kind,
      name: clip.name,
      start: clip.start,
      end: clip.start + clip.duration,
    })),
  );

  return [
    "You are an editing assistant. Return only a JSON array of timeline actions.",
    "Use only the supported action types and exact IDs supplied in the project context.",
    "All times are project seconds. Do not invent IDs, media URLs, or unsupported fields.",
    "Action schema examples:",
    JSON.stringify([
      { type: "CUT_CLIP", clipId: "clip-id", start: 2, end: 3 },
      { type: "ADD_CAPTION_TRACK", captions: [{ start: 0, end: 1, text: "Example" }] },
    ]),
    "Project context:",
    JSON.stringify({
      duration: project.duration,
      frameRate: project.frameRate,
      tracks: project.tracks.map(({ id, name, kind }) => ({ id, name, kind })),
      clips,
    }),
  ].join("\n");
}

export function parseAIActions(raw: string): AIAction[] {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed: unknown;

  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("AI response was not valid JSON.");
  }

  const result = actionsSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid AI actions: ${result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ")}`);
  }
  return result.data as AIAction[];
}

export function validateActionsAgainstProject(actions: AIAction[], project: ProjectState): void {
  const clips = new Set(project.tracks.flatMap((track) => track.clips.map((clip) => clip.id)));
  const tracks = new Set(project.tracks.map((track) => track.id));

  for (const action of actions) {
    switch (action.type) {
      case "CUT_CLIP":
      case "TRIM_SILENCE":
      case "APPLY_FILTER":
        if (!clips.has(action.clipId)) throw new Error(`Unknown clip ID: ${action.clipId}`);
        break;
      case "AUTO_DUCK_AUDIO":
        if (!tracks.has(action.targetTrackId) || !tracks.has(action.speechTrackId)) {
          throw new Error("AI action references an unknown audio track.");
        }
        break;
      case "ADD_TRANSITION":
        if (!clips.has(action.fromClipId) || !clips.has(action.toClipId)) {
          throw new Error("AI transition references an unknown clip.");
        }
        break;
      case "GENERATE_HIGHLIGHT_REEL":
        for (const segment of action.segments) {
          if (!clips.has(segment.clipId)) throw new Error(`Unknown clip ID: ${segment.clipId}`);
        }
        break;
      case "ADD_CAPTION_TRACK":
        break;
    }
  }
}

export function executeAIResponse(raw: string): AIAction[] {
  const actions = parseAIActions(raw);
  const project = useTimelineStore.getState().project;
  validateActionsAgainstProject(actions, project);
  useTimelineStore.getState().executeAI(actions);
  return actions;
}
