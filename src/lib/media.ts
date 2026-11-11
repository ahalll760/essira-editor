export interface MediaAsset {
  id: string;
  name: string;
  url: string;
  kind: "video" | "audio" | "image";
}

export function inferMediaKind(url: string): MediaAsset["kind"] {
  const lower = url.toLowerCase();
  if (lower.includes(".mp4") || lower.includes(".webm") || lower.includes(".mov")) return "video";
  if (lower.includes(".mp3") || lower.includes(".wav") || lower.includes(".aac")) return "audio";
  return "image";
}
