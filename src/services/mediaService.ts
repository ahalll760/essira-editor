import type { Clip, ProjectState, SilenceRange } from "../types/timeline";

export interface WaveformOptions {
  samples?: number;
  channel?: number;
}

export async function decodeAudio(
  input: Blob | ArrayBuffer,
  context = new AudioContext(),
): Promise<AudioBuffer> {
  const data = input instanceof Blob ? await input.arrayBuffer() : input.slice(0);
  return context.decodeAudioData(data);
}

export function extractWaveform(
  buffer: AudioBuffer,
  options: WaveformOptions = {},
): number[] {
  const samples = Math.max(1, options.samples ?? 1000);
  const channelIndex = Math.min(
    buffer.numberOfChannels - 1,
    Math.max(0, options.channel ?? 0),
  );
  const data = buffer.getChannelData(channelIndex);
  const blockSize = Math.max(1, Math.floor(data.length / samples));
  const result: number[] = [];

  for (let i = 0; i < samples; i++) {
    const start = i * blockSize;
    const end = Math.min(data.length, start + blockSize);
    if (start >= data.length) {
      result.push(0);
      continue;
    }
    let peak = 0;
    for (let j = start; j < end; j++) peak = Math.max(peak, Math.abs(data[j]));
    result.push(peak);
  }
  return result;
}

export function detectSilence(
  buffer: AudioBuffer,
  options: {
    thresholdDb?: number;
    minDuration?: number;
    windowMs?: number;
    channel?: number;
  } = {},
): SilenceRange[] {
  const thresholdDb = options.thresholdDb ?? -45;
  const minDuration = options.minDuration ?? 0.5;
  const windowSize = Math.max(
    1,
    Math.floor((buffer.sampleRate * (options.windowMs ?? 20)) / 1000),
  );
  const threshold = 10 ** (thresholdDb / 20);
  const channels = options.channel === undefined
    ? Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i))
    : [buffer.getChannelData(Math.min(options.channel, buffer.numberOfChannels - 1))];

  const ranges: SilenceRange[] = [];
  let silentStart: number | undefined;

  for (let start = 0; start < buffer.length; start += windowSize) {
    const end = Math.min(buffer.length, start + windowSize);
    let sumSquares = 0;
    let count = 0;

    for (const channel of channels) {
      for (let i = start; i < end; i++) {
        const sample = channel[i];
        sumSquares += sample * sample;
        count++;
      }
    }

    const rms = Math.sqrt(sumSquares / Math.max(1, count));
    const time = start / buffer.sampleRate;

    if (rms < threshold) {
      if (silentStart === undefined) silentStart = time;
    } else if (silentStart !== undefined) {
      const silenceEnd = time;
      if (silenceEnd - silentStart >= minDuration) {
        ranges.push({ start: silentStart, end: silenceEnd });
      }
      silentStart = undefined;
    }
  }

  if (silentStart !== undefined) {
    const end = buffer.duration;
    if (end - silentStart >= minDuration) ranges.push({ start: silentStart, end });
  }
  return ranges;
}

export function splitClipAt(clip: Clip, projectTime: number): [Clip, Clip] {
  if (projectTime <= clip.start || projectTime >= clip.start + clip.duration) {
    throw new Error("Split point must be inside the clip.");
  }
  const leftDuration = projectTime - clip.start;
  return [
    {
      ...structuredClone(clip),
      duration: leftDuration,
      sourceEnd: clip.sourceStart + leftDuration * clip.speed,
    },
    {
      ...structuredClone(clip),
      id: crypto.randomUUID(),
      start: projectTime,
      duration: clip.duration - leftDuration,
      sourceStart: clip.sourceStart + leftDuration * clip.speed,
      sourceEnd: undefined,
    },
  ];
}

export interface ExportOptions {
  project: ProjectState;
  canvas: HTMLCanvasElement;
  renderFrame: (time: number) => void;
  signal?: AbortSignal;
  fps?: number;
  mimeType?: string;
  audioUrls?: string[];
  onProgress?: (fraction: number) => void;
}

export async function exportTimeline(options: ExportOptions): Promise<Blob> {
  const { project, canvas, renderFrame, signal, fps = project.frameRate, onProgress } = options;

  if (!canvas.captureStream) {
    throw new Error("Canvas captureStream is not supported in this browser.");
  }
  if (typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder is not supported in this browser.");
  }

  const mimeType =
    options.mimeType ??
    (MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : "video/webm");

  const canvasStream = canvas.captureStream(fps);
  const audioContext = new AudioContext();
  const destination = audioContext.createMediaStreamDestination();
  const sources: AudioBufferSourceNode[] = [];

  try {
    for (const url of options.audioUrls ?? []) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Unable to fetch audio: ${response.status}`);
      const buffer = await audioContext.decodeAudioData(await response.arrayBuffer());
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(destination);
      sources.push(source);
    }

    const stream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...destination.stream.getAudioTracks(),
    ]);
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: BlobPart[] = [];

    const recording = new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => reject(new Error("MediaRecorder export failed."));
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    });

    const startedAt = performance.now();
    const duration = Math.max(0, project.duration);
    const audioStartAt = audioContext.currentTime + 0.05;

    sources.forEach((source) => source.start(audioStartAt));
    recorder.start(250);

    await new Promise<void>((resolve, reject) => {
      let raf = 0;
      const tick = (now: number): void => {
        if (signal?.aborted) {
          cancelAnimationFrame(raf);
          recorder.stop();
          reject(new DOMException("Export cancelled.", "AbortError"));
          return;
        }

        const time = Math.min(duration, (now - startedAt) / 1000);
        renderFrame(time);
        onProgress?.(duration === 0 ? 1 : time / duration);

        if (time >= duration) {
          recorder.stop();
          resolve();
          return;
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });

    return await recording;
  } finally {
    for (const source of sources) {
      try {
        source.stop();
      } catch {
        // ignore
      }
    }
    canvasStream.getTracks().forEach((track) => track.stop());
    await audioContext.close();
  }
}
