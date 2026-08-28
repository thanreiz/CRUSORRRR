import type { InstrumentId, Measure, Note, Part, TimeSignature } from "./types";

export const BEATS: Record<TimeSignature, number> = {
  "4/4": 4,
  "3/4": 3,
};

/** Drum mapping used by the player (GM-ish percussion). */
export const DRUM = {
  kick: "C2",
  snare: "D2",
  hat: "F#2",
  ride: "A3",
  crash: "C#3",
  tom: "A2",
  openHat: "G#2",
} as const;

const PC: Record<string, number> = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
};

const SHARP_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

const FLAT_NAMES = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
] as const;

const PITCH_RE = /^([A-G])([#b]?)(-?\d+)$/;

export function isRest(pitch: string): boolean {
  return pitch === "rest" || pitch === "r" || pitch === "z" || pitch === "";
}

export function parseScientificPitch(pitch: string): {
  letter: string;
  accidental: "#" | "b" | "";
  octave: number;
} {
  const match = PITCH_RE.exec(pitch);
  if (!match || match[1] === undefined || match[3] === undefined) {
    throw new Error(`Invalid pitch: ${pitch}`);
  }
  const accidental = (match[2] === "#" || match[2] === "b" ? match[2] : "") as
    | "#"
    | "b"
    | "";
  return { letter: match[1], accidental, octave: Number(match[3]) };
}

export function pitchToMidi(pitch: string): number {
  const { letter, accidental, octave } = parseScientificPitch(pitch);
  const pc = PC[`${letter}${accidental}`];
  if (pc === undefined) {
    throw new Error(`Invalid pitch: ${pitch}`);
  }
  return (octave + 1) * 12 + pc;
}

export function midiToPitch(midi: number, preferFlats = false): string {
  const rounded = Math.round(midi);
  const pc = ((rounded % 12) + 12) % 12;
  const octave = Math.floor(rounded / 12) - 1;
  const names = preferFlats ? FLAT_NAMES : SHARP_NAMES;
  return `${names[pc]}${octave}`;
}

export function keyPrefersFlats(key: string): boolean {
  return ["F", "Bb", "Eb", "Ab", "Db", "Gb"].includes(key);
}

export function n(pitch: string, duration: number, velocity?: number): Note {
  if (velocity === undefined) {
    return { pitch, duration };
  }
  return { pitch, duration, velocity };
}

export function rest(duration: number): Note {
  return { pitch: "rest", duration };
}

export function notePitches(note: Note): string[] {
  if (isRest(note.pitch)) return [];
  return note.pitch.split("+").filter(Boolean);
}

export function parseMeasure(beats: number, spec: string): Measure {
  const tokens = spec.trim().split(/\s+/).filter(Boolean);
  const notes: Note[] = tokens.map((token) => {
    const [pitchToken, durationToken, velocityToken] = token.split(":");
    if (durationToken === undefined || pitchToken === undefined) {
      throw new Error(`Note "${token}" is missing a duration (use Pitch:beats)`);
    }
    const duration = Number(durationToken);
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error(`Bad duration in "${token}"`);
    }
    const velocity =
      velocityToken === undefined ? undefined : Number(velocityToken);
    if (velocity !== undefined && !Number.isFinite(velocity)) {
      throw new Error(`Bad velocity in "${token}"`);
    }
    if (isRest(pitchToken) || pitchToken === "-") {
      return velocity === undefined
        ? { pitch: "rest", duration }
        : { pitch: "rest", duration, velocity };
    }
    const chord = pitchToken.split("+").filter(Boolean);
    if (chord.length === 0) {
      throw new Error(`Bad pitch in "${token}"`);
    }
    chord.forEach((item) => parseScientificPitch(item));
    return velocity === undefined
      ? { pitch: pitchToken, duration }
      : { pitch: pitchToken, duration, velocity };
  });

  const sum = notes.reduce((total, note) => total + note.duration, 0);
  if (Math.abs(sum - beats) > 0.001) {
    throw new Error(`Measure sums to ${sum}, expected ${beats}: ${spec}`);
  }
  return { notes };
}

export function bars(beats: number, ...specs: string[]): Measure[] {
  return specs.map((spec) => parseMeasure(beats, spec));
}

export function cloneMeasure(measure: Measure): Measure {
  return { notes: measure.notes.map((note) => ({ ...note })) };
}

export function cloneMeasures(measures: Measure[]): Measure[] {
  return measures.map(cloneMeasure);
}

export function repeatMeasures(count: number, measure: Measure): Measure[] {
  return Array.from({ length: count }, () => cloneMeasure(measure));
}

export function measureBeats(measure: Measure): number {
  return measure.notes.reduce((total, note) => total + note.duration, 0);
}

export function transposePitch(
  pitch: string,
  semitones: number,
  preferFlats = false,
): string {
  if (isRest(pitch)) {
    return "rest";
  }
  return midiToPitch(pitchToMidi(pitch) + semitones, preferFlats);
}

export function transposeMeasures(
  measures: Measure[],
  semitones: number,
  preferFlats = false,
): Measure[] {
  return measures.map((measure) => ({
    notes: measure.notes.map((note) => ({
      ...note,
      pitch: transposePitch(note.pitch, semitones, preferFlats),
    })),
  }));
}

export function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export const KEYS = ["C", "G", "D", "A", "F", "Bb", "Eb", "E"] as const;

export const SCALES: Record<string, string[]> = {
  C: ["C", "D", "E", "F", "G", "A", "B"],
  G: ["G", "A", "B", "C", "D", "E", "F#"],
  D: ["D", "E", "F#", "G", "A", "B", "C#"],
  A: ["A", "B", "C#", "D", "E", "F#", "G#"],
  E: ["E", "F#", "G#", "A", "B", "C#", "D#"],
  F: ["F", "G", "A", "Bb", "C", "D", "E"],
  Bb: ["Bb", "C", "D", "Eb", "F", "G", "A"],
  Eb: ["Eb", "F", "G", "Ab", "Bb", "C", "D"],
  Am: ["A", "B", "C", "D", "E", "F", "G"],
  Em: ["E", "F#", "G", "A", "B", "C", "D"],
  Dm: ["D", "E", "F", "G", "A", "Bb", "C"],
  Gm: ["G", "A", "Bb", "C", "D", "Eb", "F"],
};

export const PROGRESSIONS: Record<string, number[][]> = {
  pop: [
    [0, 4, 5, 3],
    [0, 5, 3, 4],
    [0, 3, 4, 0],
  ],
  funk: [
    [0, 0, 3, 4],
    [0, 4, 0, 4],
    [0, 5, 3, 4],
  ],
  jazz: [
    [1, 4, 0, 0],
    [5, 1, 4, 0],
    [0, 5, 1, 4],
  ],
  rock: [
    [0, 3, 4, 0],
    [0, 4, 3, 4],
  ],
};

export function pitch(letter: string, octave: number): string {
  return `${letter}${octave}`;
}

export function scaleFor(key: string, mode: "major" | "minor"): string[] {
  if (mode === "minor") {
    const minorKey = `${key}m`;
    return SCALES[minorKey] ?? SCALES.Am ?? ["A", "B", "C", "D", "E", "F", "G"];
  }
  return SCALES[key] ?? SCALES.C ?? ["C", "D", "E", "F", "G", "A", "B"];
}

export function pentatonicFor(scale: string[], mode: "major" | "minor"): string[] {
  if (mode === "minor") {
    return [scale[0], scale[2], scale[3], scale[4], scale[6]].filter(
      (letter): letter is string => Boolean(letter),
    );
  }
  return [scale[0], scale[1], scale[2], scale[4], scale[5]].filter(
    (letter): letter is string => Boolean(letter),
  );
}

export function chordTones(scale: string[], degree: number): string[] {
  return [0, 2, 4].map((offset) => {
    const letter = scale[(degree + offset) % scale.length];
    return letter ?? scale[0] ?? "C";
  });
}

export function part(instrumentId: InstrumentId, measures: Measure[]): Part {
  return { instrumentId, measures };
}

export function songBarCount(parts: Part[]): number {
  return parts[0]?.measures.length ?? 0;
}

export function assertAlignedParts(parts: Part[], beats: number): void {
  const expected = songBarCount(parts);
  for (const p of parts) {
    if (p.measures.length !== expected) {
      throw new Error(
        `${p.instrumentId} has ${p.measures.length} bars, expected ${expected}`,
      );
    }
    p.measures.forEach((measure, index) => {
      const sum = measureBeats(measure);
      if (Math.abs(sum - beats) > 0.001) {
        throw new Error(
          `${p.instrumentId} measure ${index + 1} sums to ${sum}, expected ${beats}`,
        );
      }
    });
  }
}
