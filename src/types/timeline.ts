export type Id = string;
export type TrackKind = "video" | "audio" | "text" | "overlay";
export type ClipKind = "video" | "audio" | "image" | "text" | "shape";
export type BlendMode =
  | "source-over"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten";

export interface Keyframe<T = number> {
  id: Id;
  time: number;
  value: T;
  easing?: "linear" | "ease-in" | "ease-out" | "ease-in-out";
}

export interface Transform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
  blendMode: BlendMode;
}

export interface Filter {
  id: Id;
  type: "brightness" | "contrast" | "saturation" | "hue" | "blur" | "custom";
  value: number;
  css?: string;
  enabled: boolean;
}

export interface CaptionStyle {
  fontFamily: string;
  fontSize: number;
  color: string;
  strokeColor?: string;
  strokeWidth?: number;
  backgroundColor?: string;
  shadow?: string;
  align?: CanvasTextAlign;
  highlightColor?: string;
}

export interface Clip {
  id: Id;
  trackId: Id;
  kind: ClipKind;
  name: string;
  start: number;
  duration: number;
  sourceStart: number;
  sourceEnd?: number;
  mediaUrl?: string;
  text?: string;
  transform: Transform;
  filters: Filter[];
  speed: number;
  volume: number;
  pan: number;
  keyframes: {
    opacity?: Keyframe<number>[];
    x?: Keyframe<number>[];
    y?: Keyframe<number>[];
    scaleX?: Keyframe<number>[];
    scaleY?: Keyframe<number>[];
    volume?: Keyframe<number>[];
  };
  captionStyle?: CaptionStyle;
  metadata?: Record<string, unknown>;
}

export interface Transition {
  id: Id;
  fromClipId: Id;
  toClipId: Id;
  duration: number;
  type: "crossfade" | "dip-to-black" | "wipe";
}

export interface Track {
  id: Id;
  name: string;
  kind: TrackKind;
  order: number;
  muted: boolean;
  solo: boolean;
  hidden: boolean;
  locked: boolean;
  snapping: boolean;
  rippleEdit: boolean;
  clips: Clip[];
}

export interface ProjectState {
  id: Id;
  name: string;
  width: number;
  height: number;
  frameRate: number;
  duration: number;
  playhead: number;
  zoom: number;
  tracks: Track[];
  transitions: Transition[];
}

export interface SilenceRange {
  start: number;
  end: number;
}

export interface CaptionSegment {
  start: number;
  end: number;
  text: string;
}

export type AIAction =
  | { type: "CUT_CLIP"; clipId: Id; start: number; end: number }
  | { type: "TRIM_SILENCE"; clipId: Id; ranges: SilenceRange[]; minDuration?: number }
  | { type: "ADD_CAPTION_TRACK"; name?: string; captions: CaptionSegment[]; style?: Partial<CaptionStyle> }
  | { type: "APPLY_FILTER"; clipId: Id; filter: Omit<Filter, "id"> }
  | { type: "AUTO_DUCK_AUDIO"; targetTrackId: Id; speechTrackId: Id; duckVolume: number; attack?: number; release?: number }
  | { type: "ADD_TRANSITION"; fromClipId: Id; toClipId: Id; duration: number; transitionType: Transition["type"] }
  | { type: "GENERATE_HIGHLIGHT_REEL"; segments: Array<{ clipId: Id; start: number; end: number }>; name?: string };

export interface AISettings {
  apiKey: string;
  model: string;
  temperature: number;
  autoSuggest: boolean;
}

export interface AIMessage {
  id: Id;
  role: "user" | "ai";
  text: string;
  time: string;
  actionCount?: number;
}

export interface AISession {
  id: Id;
  title: string;
  createdAt: string;
  messages: AIMessage[];
}

export type AITaskKind = "timeline" | "homework";

export interface AITask {
  id: string;
  kind: AITaskKind;
  title: string;
  description: string;
}

export interface HomeworkStep {
  id: Id;
  text: string;
  done: boolean;
  runTaskId?: string;
}

export type HomeworkStatus = "todo" | "in-progress" | "done";

export interface HomeworkItem {
  id: Id;
  title: string;
  description: string;
  kind: AITaskKind;
  dueDate: string;
  status: HomeworkStatus;
  steps: HomeworkStep[];
  createdAt: string;
}

export interface Suggestion {
  id: Id;
  label: string;
  kind: AITaskKind;
  taskId: string;
}
