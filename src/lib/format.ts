export function formatSeconds(seconds: number): string {
  const total = Math.max(0, seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toFixed(2).padStart(5, "0")}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
