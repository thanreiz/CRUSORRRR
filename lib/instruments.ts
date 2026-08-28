import type { Clef, InstrumentId } from "./types";

export type InstrumentFamily =
  | "voice"
  | "strings"
  | "keys"
  | "wind"
  | "rhythm";

export type Instrument = {
  id: InstrumentId;
  label: string;
  shortLabel: string;
  family: InstrumentFamily;
  /** General MIDI program, 0-indexed (0–127). Drums ignore this and use channel 10. */
  midiProgram: number;
  clef: Clef;
  defaultOctave: number;
  /** CSS color (hex). */
  color: string;
  description: string;
};

export const INSTRUMENTS: Instrument[] = [
  {
    id: "vocals",
    label: "Lead vocal",
    shortLabel: "Vocal",
    family: "voice",
    midiProgram: 54,
    clef: "treble",
    defaultOctave: 4,
    color: "#f0c48a",
    description: "The hook. Melody on a treble staff.",
  },
  {
    id: "leadGuitar",
    label: "Lead guitar",
    shortLabel: "Lead Gtr",
    family: "strings",
    midiProgram: 30,
    clef: "treble",
    defaultOctave: 4,
    color: "#e08a6a",
    description: "Riffs and fills, slightly overdriven.",
  },
  {
    id: "rhythmGuitar",
    label: "Rhythm guitar",
    shortLabel: "Rhythm",
    family: "strings",
    midiProgram: 25,
    clef: "treble",
    defaultOctave: 3,
    color: "#d4a056",
    description: "Comp and skank patterns.",
  },
  {
    id: "bass",
    label: "Bass",
    shortLabel: "Bass",
    family: "strings",
    midiProgram: 33,
    clef: "bass",
    defaultOctave: 2,
    color: "#7eb8a0",
    description: "Low end and pocket. Typical range E1–G3.",
  },
  {
    id: "drums",
    label: "Drums",
    shortLabel: "Drums",
    family: "rhythm",
    midiProgram: 0,
    clef: "perc",
    defaultOctave: 2,
    color: "#c47c9a",
    description: "Kick C2, snare D2, hat F#2, ride/tom A2, crash C#3.",
  },
  {
    id: "piano",
    label: "Piano",
    shortLabel: "Piano",
    family: "keys",
    midiProgram: 0,
    clef: "treble",
    defaultOctave: 4,
    color: "#9bb4e0",
    description: "Voicings, comps, and ostinatos.",
  },
  {
    id: "altoSax",
    label: "Alto sax",
    shortLabel: "Sax",
    family: "wind",
    midiProgram: 65,
    clef: "treble",
    defaultOctave: 4,
    color: "#d4c06a",
    description: "Heads, pads, and answering phrases.",
  },
  {
    id: "trumpet",
    label: "Trumpet",
    shortLabel: "Tpt",
    family: "wind",
    midiProgram: 56,
    clef: "treble",
    defaultOctave: 4,
    color: "#e0a04a",
    description: "Hits and countermelody.",
  },
];

export const INSTRUMENT_IDS: InstrumentId[] = INSTRUMENTS.map(
  (instrument) => instrument.id,
);

const BY_ID = new Map<string, Instrument>(
  INSTRUMENTS.map((instrument) => [instrument.id, instrument]),
);

export function getInstrument(id: string): Instrument {
  const found = BY_ID.get(id);
  if (!found) {
    throw new Error(`Unknown instrument: ${id}`);
  }
  return found;
}

export function isInstrumentId(id: string): id is InstrumentId {
  return BY_ID.has(id);
}
