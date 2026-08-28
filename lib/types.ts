export type InstrumentId =
  | "vocals"
  | "leadGuitar"
  | "rhythmGuitar"
  | "bass"
  | "drums"
  | "piano"
  | "altoSax"
  | "trumpet";

export type Clef = "treble" | "bass" | "perc";

export type Mode = "major" | "minor";

export type TimeSignature = "4/4" | "3/4";

export type SongSource = "demo" | "youtube" | "upload";

/**
 * A sequential note (or rest) in a part.
 * `pitch` is scientific notation (`C4`, `F#2`, `Bb3`) or `'rest'`.
 * `duration` is in quarter-note beats (a quarter note in 4/4 = 1).
 */
export type Note = {
  pitch: string;
  duration: number;
  velocity?: number;
};

/** @deprecated Use {@link Note}. Kept so early UI sketches keep compiling. */
export type NoteEvent = Note;

export type Measure = {
  notes: Note[];
};

export type Part = {
  instrumentId: InstrumentId;
  measures: Measure[];
};

export type Song = {
  id: string;
  title: string;
  artist: string;
  style: string;
  /** Tonic letter, e.g. `'G'`, `'Bb'`. */
  key: string;
  mode: Mode;
  tempo: number;
  timeSignature: TimeSignature;
  source: SongSource;
  youtubeId?: string;
  thumbnail?: string;
  bars?: number;
  parts: Part[];
};
