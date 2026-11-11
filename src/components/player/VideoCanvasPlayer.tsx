import React, { useEffect, useRef } from "react";
import type { Clip, Filter, ProjectState } from "../../types/timeline";

interface Props {
  project: ProjectState;
  playing: boolean;
  onTimeChange?: (time: number) => void;
  className?: string;
}

function cssFilter(filters: Filter[]): string {
  const values: string[] = [];
  for (const filter of filters) {
    if (!filter.enabled) continue;
    switch (filter.type) {
      case "brightness":
        values.push(`brightness(${filter.value}%)`);
        break;
      case "contrast":
        values.push(`contrast(${filter.value}%)`);
        break;
      case "saturation":
        values.push(`saturate(${filter.value}%)`);
        break;
      case "hue":
        values.push(`hue-rotate(${filter.value}deg)`);
        break;
      case "blur":
        values.push(`blur(${Math.max(0, filter.value)}px)`);
        break;
      case "custom":
        if (filter.css) values.push(filter.css);
        break;
    }
  }
  return values.length ? values.join(" ") : "none";
}

export function VideoCanvasPlayer({
  project,
  playing,
  onTimeChange,
  className,
}: Props): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRef = useRef(new Map<string, HTMLVideoElement | HTMLImageElement>());
  const timeRef = useRef(project.playhead);
  const playingRef = useRef(playing);
  const projectRef = useRef(project);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    timeRef.current = project.playhead;
  }, [project.playhead]);

  useEffect(() => {
    const entries = project.tracks.flatMap((track) =>
      track.clips
        .filter((clip) => clip.mediaUrl && (clip.kind === "video" || clip.kind === "image"))
        .map((clip) => clip),
    );
    const activeUrls = new Set(entries.map((clip) => `${clip.id}:${clip.mediaUrl}`));

    for (const [key, element] of mediaRef.current) {
      if (!activeUrls.has(key)) {
        if (element instanceof HTMLVideoElement) {
          element.pause();
          element.removeAttribute("src");
          element.load();
        }
        mediaRef.current.delete(key);
      }
    }

    for (const clip of entries) {
      if (!clip.mediaUrl) continue;
      const key = `${clip.id}:${clip.mediaUrl}`;
      if (mediaRef.current.has(key)) continue;

      if (clip.kind === "image") {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.src = clip.mediaUrl;
        mediaRef.current.set(key, image);
      } else {
        const video = document.createElement("video");
        video.crossOrigin = "anonymous";
        video.preload = "auto";
        video.muted = true;
        video.playsInline = true;
        video.src = clip.mediaUrl;
        mediaRef.current.set(key, video);
      }
    }
  }, [project.tracks]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { alpha: false });
    if (!canvas || !context) return;

    canvas.width = project.width;
    canvas.height = project.height;

    let raf = 0;
    let lastFrame = performance.now();

    const drawClip = (clip: Clip, time: number): void => {
      if (time < clip.start || time >= clip.start + clip.duration) return;

      const localTime = time - clip.start;
      const transform = clip.transform;
      const alpha = Math.max(0, Math.min(1, transform.opacity));
      const centerX = project.width / 2 + transform.x;
      const centerY = project.height / 2 + transform.y;

      context.save();
      context.globalAlpha = alpha;
      context.globalCompositeOperation = transform.blendMode;
      context.filter = cssFilter(clip.filters);
      context.translate(centerX, centerY);
      context.rotate((transform.rotation * Math.PI) / 180);
      context.scale(transform.scaleX, transform.scaleY);

      if (clip.kind === "text" || clip.kind === "shape") {
        const style = clip.captionStyle;
        const text = clip.text ?? "";
        const fontSize = style?.fontSize ?? 48;
        const fontFamily = style?.fontFamily ?? "Arial";

        context.font = `${fontSize}px ${fontFamily}`;
        context.textAlign = style?.align ?? "center";
        context.textBaseline = "middle";

        const metrics = context.measureText(text);
        const width = metrics.width + 28;
        const boxHeight = fontSize + 18;

        if (style?.backgroundColor) {
          context.fillStyle = style.backgroundColor;
          context.fillRect(-width / 2, -boxHeight / 2, width, boxHeight);
        }

        if (style?.shadow) context.shadow = style.shadow;
        if (style?.strokeColor && style.strokeWidth) {
          context.lineWidth = style.strokeWidth;
          context.strokeStyle = style.strokeColor;
          context.strokeText(text, 0, 0);
        }

        context.fillStyle = style?.color ?? "#ffffff";
        context.fillText(text, 0, 0);
      } else {
        if (!clip.mediaUrl) return;
        const key = `${clip.id}:${clip.mediaUrl}`;
        const element = mediaRef.current.get(key);

        if (element instanceof HTMLVideoElement && element.readyState >= 2) {
          const sourceTime = clip.sourceStart + localTime * clip.speed;
          if (Number.isFinite(sourceTime) && Math.abs(element.currentTime - sourceTime) > 0.08) {
            try {
              element.currentTime = sourceTime;
            } catch {
              // ignore
            }
          }
          context.drawImage(element, -project.width / 2, -project.height / 2, project.width, project.height);
        } else if (element instanceof HTMLImageElement && element.complete && element.naturalWidth) {
          context.drawImage(element, -project.width / 2, -project.height / 2, project.width, project.height);
        }
      }

      context.restore();
    };

    const render = (now: number): void => {
      const current = projectRef.current;
      const delta = (now - lastFrame) / 1000;
      lastFrame = now;

      if (playingRef.current) {
        timeRef.current = Math.min(current.duration, timeRef.current + delta);
        onTimeChange?.(timeRef.current);
      }

      context.fillStyle = "#000";
      context.fillRect(0, 0, canvas.width, canvas.height);

      const tracks = [...current.tracks]
        .filter((track) => !track.hidden)
        .sort((a, b) => a.order - b.order);

      const hasSolo = tracks.some((track) => track.solo);
      for (const track of tracks) {
        if (hasSolo && !track.solo) continue;
        for (const clip of track.clips) drawClip(clip, timeRef.current);
      }

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [project.width, project.height, project.duration, onTimeChange]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-label="Video preview"
      style={{ display: "block", width: "100%", height: "100%", objectFit: "contain" }}
    />
  );
}
