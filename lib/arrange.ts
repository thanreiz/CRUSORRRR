import { INSTRUMENT_IDS, isInstrumentId } from "./instruments";
import {
  BEATS,
  chordTones,
  cloneMeasure,
  hashString,
  isRest,
  keyPrefersFlats,
  midiToPitch,
  mulberry32,
  n,
  pentatonicFor,
  pitch,
  pitchToMidi,
  PROGRESSIONS,
  rest,
  scaleFor,
  transposePitch,
} from "./music";
import type {
  InstrumentId,
  Measure,
  Mode,
  Note,
  Part,
  Song,
  SongSource,
  TimeSignature,
} from "./types";

export type ArrangeOptions = {
  style?: string;
  tempo?: number;
  key?: string;
  mode?: Mode;
  timeSignature?: TimeSignature;
  bars?: number;
  source?: SongSource;
  artist?: string;
  youtubeId?: string;
  thumbnail?: string;
};

const STYLE_TABLE: {
  id: string;
  match: string[];
  time: TimeSignature;
  tempo: [number, number];
  mode: Mode;
  progression: "funk" | "jazz" | "pop" | "rock";
}[] = [
  {
    id: "funk-rock",
    match: ["funk", "groove"],
    time: "4/4",
    tempo: [100, 118],
    mode: "major",
    progression: "funk",
  },
  {
    id: "jazz waltz",
    match: ["jazz", "waltz", "swing"],
    time: "3/4",
    tempo: [132, 168],
    mode: "major",
    progression: "jazz",
  },
  {
    id: "indie pop",
    match: ["indie", "pop"],
    time: "4/4",
    tempo: [88, 108],
    mode: "major",
    progression: "pop",
  },
  {
    id: "rock",
    match: ["rock"],
    time: "4/4",
    tempo: [110, 140],
    mode: "major",
    progression: "rock",
  },
  {
    id: "blues",
    match: ["blues"],
    time: "4/4",
    tempo: [78, 108],
    mode: "minor",
    progression: "rock",
  },
];

const KEY_CHOICES = ["C", "G", "D", "A", "F", "Bb", "Eb"] as const;

function pick<T>(rng: () => number, items: readonly T[]): T {
  const item = items[Math.floor(rng() * items.length) % items.length];
  if (item === undefined) {
    throw new Error("pick() on empty list");
  }
  return item;
}

function pickStyle(rng: () => number, requested?: string) {
  if (requested) {
    const lower = requested.toLowerCase();
    const found = STYLE_TABLE.find((row) =>
      row.match.some((token) => lower.includes(token)),
    );
    if (found) {
      return found;
    }
  }
  return pick(rng, STYLE_TABLE);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundTempo(value: number): number {
  return Math.round(clamp(value, 60, 180));
}

function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "song";
}

function resolveIds(selectedIds: string[]): InstrumentId[] {
  const requested = selectedIds.filter(isInstrumentId);
  const ids = requested.length > 0 ? requested : [...INSTRUMENT_IDS];
  return INSTRUMENT_IDS.filter((id) => ids.includes(id));
}

function fillRhythm(beats: number, cells: number[][], rng: () => number): number[] {
  const picked = pick(rng, cells);
  const sum = picked.reduce((total, beat) => total + beat, 0);
  if (Math.abs(sum - beats) < 0.001) {
    return picked;
  }
  const scaled = picked.map((beat) => (beat / sum) * beats);
  const quantized = scaled.map((beat) => Math.max(0.25, Math.round(beat * 4) / 4));
  const qSum = quantized.reduce((total, beat) => total + beat, 0);
  const last = quantized[quantized.length - 1];
  if (last === undefined) {
    return beats === 3 ? [1, 1, 1] : [1, 1, 1, 1];
  }
  quantized[quantized.length - 1] = Math.max(0.25, last + (beats - qSum));
  return quantized;
}

function letterAtOctave(
  letter: string,
  octave: number,
  preferFlats: boolean,
  minMidi: number,
  maxMidi: number,
): string {
  let midi = pitchToMidi(pitch(letter, octave));
  while (midi < minMidi) midi += 12;
  while (midi > maxMidi) midi -= 12;
  midi = clamp(midi, minMidi, maxMidi);
  return midiToPitch(midi, preferFlats);
}

function measuresFromNotes(notes: Note[], beats: number): Measure[] {
  const measures: Measure[] = [];
  let bucket: Note[] = [];
  let acc = 0;
  for (const note of notes) {
    let remaining = note.duration;
    while (remaining > 0.001) {
      const room = beats - acc;
      const take = Math.min(room, remaining);
      bucket.push({
        pitch: note.pitch,
        duration: take,
        ...(note.velocity === undefined ? {} : { velocity: note.velocity }),
      });
      acc += take;
      remaining -= take;
      if (Math.abs(acc - beats) < 0.001) {
        measures.push({ notes: bucket });
        bucket = [];
        acc = 0;
      }
    }
  }
  if (bucket.length > 0) {
    bucket.push(rest(beats - acc));
    measures.push({ notes: bucket });
  }
  return measures;
}

function makeMelody(
  rng: () => number,
  scale: string[],
  mode: Mode,
  bars: number,
  beats: number,
  octave: number,
  preferFlats: boolean,
): Measure[] {
  const penta = pentatonicFor(scale, mode);
  const pool = penta.length >= 4 ? penta : scale;
  const cells4 = [
    [1, 1, 1, 1],
    [0.5, 0.5, 1, 2],
    [0.5, 0.5, 0.5, 0.5, 2],
    [2, 1, 1],
    [1.5, 0.5, 1, 1],
    [0.5, 1, 0.5, 2],
    [1, 0.5, 0.5, 1, 1],
  ];
  const cells3 = [
    [1, 1, 1],
    [2, 1],
    [1, 0.5, 0.5, 1],
    [0.5, 0.5, 2],
    [1.5, 1.5],
    [3],
  ];
  const cells = beats === 3 ? cells3 : cells4;
  const motifLen = Math.min(4, bars);
  const motif: Note[][] = [];
  let cursor = Math.floor(rng() * pool.length);

  for (let i = 0; i < motifLen; i += 1) {
    const rhythm = fillRhythm(beats, cells, rng);
    const notes: Note[] = rhythm.map((dur, idx) => {
      if (rng() < 0.08 && idx !== 0) {
        return rest(dur);
      }
      cursor = clamp(
        cursor + Math.floor(rng() * 5) - 2,
        0,
        pool.length - 1,
      );
      const letter = pool[cursor] ?? pool[0] ?? "C";
      return n(letterAtOctave(letter, octave, preferFlats, 55, 81), dur);
    });
    motif.push(notes);
  }

  const measures: Measure[] = [];
  for (let bar = 0; bar < bars; bar += 1) {
    const source = motif[bar % motif.length] ?? motif[0];
    if (!source) {
      measures.push({ notes: [rest(beats)] });
      continue;
    }
    const vary = Math.floor(bar / motifLen);
    const notes = source.map((note, idx) => {
      if (isRest(note.pitch)) {
        return { ...note };
      }
      if (vary > 0 && idx === source.length - 1 && rng() < 0.5) {
        const step = vary % 2 === 0 ? 2 : -2;
        return {
          ...note,
          pitch: transposePitch(note.pitch, step, preferFlats),
        };
      }
      return { ...note };
    });
    measures.push({ notes });
  }
  return measures;
}

function degreesFor(
  rng: () => number,
  styleId: string,
  bars: number,
): number[] {
  const group =
    styleId.includes("funk")
      ? "funk"
      : styleId.includes("jazz")
        ? "jazz"
        : styleId.includes("rock") && !styleId.includes("funk")
          ? "rock"
          : "pop";
  const options = PROGRESSIONS[group] ?? PROGRESSIONS.pop ?? [[0, 4, 5, 3]];
  const prog = pick(rng, options);
  return Array.from({ length: bars }, (_, i) => prog[i % prog.length] ?? 0);
}

function bassLine(
  rng: () => number,
  scale: string[],
  degrees: number[],
  beats: number,
  styleId: string,
  preferFlats: boolean,
): Measure[] {
  return degrees.map((degree) => {
    const tones = chordTones(scale, degree);
    const root = letterAtOctave(tones[0] ?? "C", 2, preferFlats, 28, 55);
    const third = letterAtOctave(tones[1] ?? tones[0] ?? "E", 2, preferFlats, 28, 55);
    const fifth = letterAtOctave(tones[2] ?? tones[0] ?? "G", 2, preferFlats, 28, 55);
    if (beats === 3) {
      return { notes: [n(root, 1), n(third, 1), n(fifth, 1)] };
    }
    if (styleId.includes("funk")) {
      return {
        notes: [
          n(root, 0.75),
          rest(0.25),
          n(fifth, 0.5),
          n(root, 0.5),
          n(fifth, 0.5),
          n(root, 0.5),
          n(fifth, 1),
        ],
      };
    }
    if (styleId.includes("indie") || styleId.includes("pop")) {
      return { notes: [n(root, 1), n(fifth, 1), n(root, 1), n(fifth, 1)] };
    }
    const walk = rng() < 0.4;
    if (walk) {
      return { notes: [n(root, 1), n(third, 1), n(fifth, 1), n(root, 1)] };
    }
    return { notes: [n(root, 2), n(fifth, 2)] };
  });
}

function drumBar(beats: number, styleId: string, index: number, bars: number): Measure {
  const kick = n("C2", 0.5, 1);
  const snare = n("D2", 0.5, 0.9);
  const hat = n("F#2", 0.5, 0.4);
  const ride = n("A2", 1, 0.55);
  const crash = n("C#3", 0.5, 0.95);
  const tom = n("A2", 0.5, 0.75);
  const isFill = (index + 1) % 8 === 0 || index === bars - 1;
  const isCrash = index % 8 === 0;

  if (beats === 3) {
    if (isFill) {
      return { notes: [n("C2", 1, 0.9), tom, n("D2", 0.5, 0.85), n("C#3", 1, 0.9)] };
    }
    if (styleId.includes("jazz") || styleId.includes("waltz")) {
      return {
        notes: [
          isCrash ? n("C2", 1, 0.9) : n("C2", 1, 0.8),
          n("A2", 0.5, 0.55),
          n("A2", 0.5, 0.45),
          ride,
        ],
      };
    }
    return { notes: [n("C2", 1, 0.9), n("A2", 1, 0.5), n("D2", 1, 0.85)] };
  }

  if (isFill) {
    return {
      notes: [
        n("C2", 0.5, 1),
        tom,
        tom,
        n("D2", 0.25, 0.85),
        n("D2", 0.25, 0.9),
        tom,
        crash,
        n("C2", 1, 1),
      ],
    };
  }

  const first = isCrash ? crash : kick;
  if (styleId.includes("indie") || styleId.includes("pop")) {
    return {
      notes: [
        first,
        hat,
        snare,
        hat,
        n("C2", 0.5, 0.9),
        hat,
        snare,
        hat,
      ],
    };
  }
  return {
    notes: [
      first,
      hat,
      snare,
      n("F#2", 0.5, 0.35),
      n("C2", 0.5, 0.85),
      hat,
      snare,
      n("F#2", 0.5, 0.35),
    ],
  };
}

function pianoBar(
  scale: string[],
  degree: number,
  beats: number,
  styleId: string,
  preferFlats: boolean,
): Measure {
  const tones = chordTones(scale, degree);
  const a = letterAtOctave(tones[0] ?? "C", 4, preferFlats, 48, 84);
  const b = letterAtOctave(tones[1] ?? "E", 4, preferFlats, 48, 84);
  const c = letterAtOctave(tones[2] ?? "G", 4, preferFlats, 48, 84);
  if (beats === 3) {
    return { notes: [n(a, 1), n(b, 1), n(c, 1)] };
  }
  if (styleId.includes("indie") || styleId.includes("pop")) {
    return { notes: [n(a, 0.5), n(b, 0.5), n(c, 0.5), n(b, 0.5), n(a, 0.5), n(b, 0.5), n(c, 0.5), n(a, 0.5)] };
  }
  if (styleId.includes("funk")) {
    return { notes: [rest(0.5), n(b, 0.5), rest(0.5), n(c, 0.5), n(a, 1), rest(0.5), n(c, 0.5)] };
  }
  return { notes: [n(a, 1), n(b, 1), n(c, 1), n(b, 1)] };
}

function rhythmGuitarBar(
  scale: string[],
  degree: number,
  beats: number,
  styleId: string,
  preferFlats: boolean,
): Measure {
  const tones = chordTones(scale, degree);
  const root = letterAtOctave(tones[0] ?? "C", 3, preferFlats, 40, 76);
  const third = letterAtOctave(tones[1] ?? "E", 3, preferFlats, 40, 76);
  const fifth = letterAtOctave(tones[2] ?? "G", 3, preferFlats, 40, 76);
  if (beats === 3) {
    return { notes: [n(root, 1), rest(2)] };
  }
  if (styleId.includes("funk")) {
    return {
      notes: [
        n(root, 0.25),
        rest(0.25),
        n(root, 0.25),
        rest(0.25),
        n(third, 0.5),
        rest(0.5),
        n(root, 0.25),
        rest(0.25),
        n(fifth, 0.25),
        rest(0.25),
        n(root, 0.5),
        rest(0.5),
      ],
    };
  }
  return {
    notes: [
      n(root, 0.5),
      n(third, 0.5),
      n(fifth, 0.5),
      n(third, 0.5),
      n(root, 0.5),
      n(third, 0.5),
      n(fifth, 0.5),
      n(root, 0.5),
    ],
  };
}

function harmonyFromMelody(
  melody: Measure[],
  semitones: number,
  preferFlats: boolean,
  skipChance: number,
  rng: () => number,
  holdHits: boolean,
): Measure[] {
  return melody.map((measure) => {
    const notes: Note[] = [];
    for (const note of measure.notes) {
      if (isRest(note.pitch) || rng() < skipChance) {
        notes.push(rest(note.duration));
        continue;
      }
      if (holdHits && note.duration < 0.75) {
        notes.push(rest(note.duration));
        continue;
      }
      notes.push({
        ...note,
        pitch: transposePitch(note.pitch, semitones, preferFlats),
      });
    }
    return { notes };
  });
}

function leadFromMelody(
  melody: Measure[],
  preferFlats: boolean,
  styleId: string,
): Measure[] {
  const shift = styleId.includes("funk") || styleId.includes("rock") ? -12 : 0;
  return melody.map((measure) => ({
    notes: measure.notes.map((note) => {
      if (isRest(note.pitch)) {
        return { ...note };
      }
      let midi = pitchToMidi(note.pitch) + shift;
      midi = clamp(midi, 52, 88);
      return { ...note, pitch: midiToPitch(midi, preferFlats) };
    }),
  }));
}

function saxFromMelody(
  melody: Measure[],
  preferFlats: boolean,
  rng: () => number,
): Measure[] {
  return melody.map((measure, index) => {
    if (index % 2 === 0 && rng() < 0.45) {
      return { notes: [rest(measure.notes.reduce((s, nte) => s + nte.duration, 0))] };
    }
    return {
      notes: measure.notes.map((note) => {
        if (isRest(note.pitch)) {
          return { ...note };
        }
        return { ...note, pitch: transposePitch(note.pitch, 3, preferFlats) };
      }),
    };
  });
}

/**
 * Deterministic arrangement from a string seed. Always returns playable parts
 * for the selected instruments (all eight if `selectedIds` is empty).
 */
export function arrangeFromSeed(
  seed: string,
  title: string,
  selectedIds: string[],
  options?: ArrangeOptions,
): Song {
  const rng = mulberry32(hashString(seed));
  const style = pickStyle(rng, options?.style);
  const key = options?.key ?? pick(rng, KEY_CHOICES);
  const mode: Mode = options?.mode ?? style.mode;
  const timeSignature: TimeSignature = options?.timeSignature ?? style.time;
  const beats = BEATS[timeSignature];
  const tempo = roundTempo(
    options?.tempo ?? style.tempo[0] + rng() * (style.tempo[1] - style.tempo[0]),
  );
  const barChoices = [8, 12, 16] as const;
  const bars = clamp(options?.bars ?? pick(rng, barChoices), 8, 16);
  const preferFlats = keyPrefersFlats(key);
  const scale = scaleFor(key, mode);
  const ids = resolveIds(selectedIds);
  const degrees = degreesFor(rng, style.id, bars);
  const melody = makeMelody(rng, scale, mode, bars, beats, 4, preferFlats);

  const byId: Record<InstrumentId, Measure[]> = {
    vocals: cloneMeasuresSafe(melody),
    leadGuitar: leadFromMelody(melody, preferFlats, style.id),
    rhythmGuitar: degrees.map((degree) =>
      rhythmGuitarBar(scale, degree, beats, style.id, preferFlats),
    ),
    bass: bassLine(rng, scale, degrees, beats, style.id, preferFlats),
    drums: Array.from({ length: bars }, (_, i) => drumBar(beats, style.id, i, bars)),
    piano: degrees.map((degree) => pianoBar(scale, degree, beats, style.id, preferFlats)),
    altoSax: saxFromMelody(melody, preferFlats, rng),
    trumpet: harmonyFromMelody(melody, 7, preferFlats, 0.35, rng, true),
  };

  const parts: Part[] = ids.map((id) => ({
    instrumentId: id,
    measures: byId[id],
  }));

  return {
    id: `${slugify(title)}-${(hashString(seed) % 1_000_000).toString(16)}`,
    title,
    artist: options?.artist ?? "Scoreband",
    style: options?.style ?? style.id,
    key,
    mode,
    tempo,
    timeSignature,
    source: options?.source ?? "upload",
    youtubeId: options?.youtubeId,
    thumbnail: options?.thumbnail,
    bars,
    parts,
  };
}

function cloneMeasuresSafe(measures: Measure[]): Measure[] {
  return measures.map((measure) => cloneMeasure(measure));
}

type DetectedNote = { pitch: string; time: number; duration: number };

function rms(buffer: Float32Array, start: number, length: number): number {
  const end = Math.min(buffer.length, start + length);
  let sum = 0;
  let count = 0;
  for (let i = start; i < end; i += 1) {
    const sample = buffer[i] ?? 0;
    sum += sample * sample;
    count += 1;
  }
  return count === 0 ? 0 : Math.sqrt(sum / count);
}

function detectTempo(
  channelData: Float32Array,
  sampleRate: number,
): { bpm: number; onsets: number[] } {
  const hop = 512;
  const energies: number[] = [];
  for (let i = 0; i + hop <= channelData.length; i += hop) {
    energies.push(rms(channelData, i, hop));
  }
  if (energies.length < 8) {
    return { bpm: 108, onsets: [] };
  }
  const flux: number[] = [0];
  for (let i = 1; i < energies.length; i += 1) {
    flux.push(Math.max(0, (energies[i] ?? 0) - (energies[i - 1] ?? 0)));
  }
  const mean = flux.reduce((a, b) => a + b, 0) / flux.length;
  const threshold = mean * 1.6 + 1e-5;
  const minGap = Math.max(1, Math.round(0.12 * sampleRate / hop));
  const onsetFrames: number[] = [];
  for (let i = 1; i < flux.length - 1; i += 1) {
    const value = flux[i] ?? 0;
    if (
      value > threshold &&
      value >= (flux[i - 1] ?? 0) &&
      value >= (flux[i + 1] ?? 0)
    ) {
      const last = onsetFrames[onsetFrames.length - 1];
      if (last === undefined || i - last >= minGap) {
        onsetFrames.push(i);
      }
    }
  }
  const onsets = onsetFrames.map((frame) => (frame * hop) / sampleRate);
  const iois: number[] = [];
  for (let i = 1; i < onsets.length; i += 1) {
    const dt = (onsets[i] ?? 0) - (onsets[i - 1] ?? 0);
    if (dt > 0.15 && dt < 1.5) {
      iois.push(dt);
    }
  }
  if (iois.length === 0) {
    return { bpm: 108, onsets };
  }
  const candidates: number[] = [];
  for (const ioi of iois) {
    const bpm = 60 / ioi;
    candidates.push(bpm, bpm * 2, bpm / 2);
  }
  const bins = new Map<number, number>();
  for (const bpm of candidates) {
    if (bpm < 70 || bpm > 180) {
      continue;
    }
    const key = Math.round(bpm / 2) * 2;
    bins.set(key, (bins.get(key) ?? 0) + 1);
  }
  let best = 108;
  let bestCount = 0;
  for (const [bpm, count] of bins) {
    if (count > bestCount) {
      best = bpm;
      bestCount = count;
    }
  }
  return { bpm: roundTempo(best), onsets };
}

function autoCorrelate(buffer: Float32Array, sampleRate: number): number {
  const size = buffer.length;
  if (size < 32) {
    return -1;
  }
  let energy = 0;
  for (let i = 0; i < size; i += 1) {
    const sample = buffer[i] ?? 0;
    energy += sample * sample;
  }
  const rmsValue = Math.sqrt(energy / size);
  if (rmsValue < 0.01) {
    return -1;
  }

  const minFreq = 80;
  const maxFreq = 1000;
  const minOffset = Math.max(2, Math.floor(sampleRate / maxFreq));
  const maxOffset = Math.min(Math.floor(size / 2), Math.floor(sampleRate / minFreq));

  let bestOffset = -1;
  let bestCorr = 0;
  let lastCorr = 1;
  for (let offset = minOffset; offset <= maxOffset; offset += 1) {
    let corr = 0;
    const limit = size - offset;
    for (let i = 0; i < limit; i += 1) {
      corr += (buffer[i] ?? 0) * (buffer[i + offset] ?? 0);
    }
    corr /= limit;
    if (corr > bestCorr) {
      bestCorr = corr;
      bestOffset = offset;
    }
    if (corr > 0.9 && corr < lastCorr) {
      bestOffset = offset - 1;
      break;
    }
    lastCorr = corr;
  }
  if (bestOffset <= 0 || bestCorr < 0.01) {
    return -1;
  }
  return sampleRate / bestOffset;
}

function freqToPitch(freq: number, preferFlats: boolean): string | null {
  if (!Number.isFinite(freq) || freq < 80 || freq > 1200) {
    return null;
  }
  const midi = 69 + 12 * Math.log2(freq / 440);
  if (midi < 40 || midi > 84) {
    return null;
  }
  return midiToPitch(midi, preferFlats);
}

function detectMelody(
  channelData: Float32Array,
  sampleRate: number,
  onsets: number[],
): DetectedNote[] {
  const windowSize = 2048;
  const times =
    onsets.length >= 4
      ? onsets
      : Array.from(
          { length: Math.floor(channelData.length / Math.floor(sampleRate * 0.25)) },
          (_, i) => i * 0.25,
        );
  const points: { time: number; pitch: string }[] = [];
  for (const time of times.slice(0, 80)) {
    const start = Math.floor(time * sampleRate);
    if (start + 32 >= channelData.length) {
      continue;
    }
    const slice = channelData.subarray(start, Math.min(channelData.length, start + windowSize));
    const freq = autoCorrelate(slice, sampleRate);
    const detected = freqToPitch(freq, false);
    if (detected) {
      points.push({ time, pitch: detected });
    }
  }
  if (points.length === 0) {
    return [];
  }
  const notes: DetectedNote[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[i + 1];
    if (!current) {
      continue;
    }
    const duration = Math.max(0.12, (next?.time ?? current.time + 0.4) - current.time);
    const last = notes[notes.length - 1];
    if (last && last.pitch === current.pitch) {
      last.duration += duration;
    } else {
      notes.push({ pitch: current.pitch, time: current.time, duration });
    }
  }
  return notes;
}

function looksReasonable(notes: DetectedNote[]): boolean {
  if (notes.length < 4) {
    return false;
  }
  const midis = notes
    .filter((note) => !isRest(note.pitch))
    .map((note) => pitchToMidi(note.pitch));
  if (midis.length < 4) {
    return false;
  }
  const distinct = new Set(midis.map((midi) => midi % 12));
  if (distinct.size < 3) {
    return false;
  }
  const min = Math.min(...midis);
  const max = Math.max(...midis);
  return min >= 48 && max <= 84;
}

function blendMelody(
  song: Song,
  detected: DetectedNote[],
  instrumentId: InstrumentId,
  semitones: number,
): void {
  const part = song.parts.find((item) => item.instrumentId === instrumentId);
  if (!part || detected.length === 0) {
    return;
  }
  const beats = BEATS[song.timeSignature];
  const preferFlats = keyPrefersFlats(song.key);
  const notes: Note[] = detected.map((item) => {
    const durationBeats = Math.max(
      0.25,
      Math.round((item.duration * song.tempo) / 60 * 4) / 4,
    );
    const midi = clamp(pitchToMidi(item.pitch) + semitones, 48, 84);
    return n(midiToPitch(midi, preferFlats), durationBeats);
  });
  const measures = measuresFromNotes(notes, beats);
  if (measures.length === 0) {
    return;
  }
  const target = part.measures.length;
  const blended: Measure[] = [];
  for (let i = 0; i < target; i += 1) {
    blended.push(cloneMeasure(measures[i % measures.length] ?? { notes: [rest(beats)] }));
  }
  part.measures = blended;
}

function guessStyleFromTempo(bpm: number): string {
  if (bpm >= 130) {
    return "jazz waltz";
  }
  if (bpm <= 100) {
    return "indie pop";
  }
  if (bpm <= 118) {
    return "funk-rock";
  }
  return "rock";
}

/**
 * Rough onset/energy tempo + autocorrelation pitch, then a deterministic
 * arrangement so the sheets are always playable. Detected melody is blended
 * into vocals and lead guitar when it looks reasonable.
 */
export function analyzeAudioToSong(
  channelData: Float32Array,
  sampleRate: number,
  selectedIds: string[],
  title: string,
): Song {
  const rate = sampleRate > 0 ? sampleRate : 44100;
  const maxSamples = Math.floor(rate * 45);
  const data =
    channelData.length > maxSamples ? channelData.subarray(0, maxSamples) : channelData;

  const energy = rms(data, 0, data.length);
  const { bpm, onsets } = detectTempo(data, rate);
  const detected = detectMelody(data, rate, onsets);
  const pitchKey = detected
    .slice(0, 16)
    .map((note) => note.pitch)
    .join("");
  const seed = `${title}|${bpm}|${pitchKey}|${energy.toFixed(3)}|${data.length}`;
  const style = guessStyleFromTempo(bpm);

  const song = arrangeFromSeed(seed, title || "Untitled", selectedIds, {
    style,
    tempo: bpm,
    source: "upload",
  });

  if (looksReasonable(detected)) {
    blendMelody(song, detected, "vocals", 0);
    blendMelody(song, detected, "leadGuitar", 0);
  }

  return song;
}
