import { getInstrument, isInstrumentId } from "./instruments";
import { BEATS, isRest, notePitches, parseScientificPitch } from "./music";
import type { InstrumentId, Measure, Note, Song, TimeSignature } from "./types";

/** Sharps/flats implied by a major or minor key signature (letter names). */
const KEY_SIGNATURES: Record<string, { sharps: string[]; flats: string[] }> = {
  C: { sharps: [], flats: [] },
  G: { sharps: ["F"], flats: [] },
  D: { sharps: ["F", "C"], flats: [] },
  A: { sharps: ["F", "C", "G"], flats: [] },
  E: { sharps: ["F", "C", "G", "D"], flats: [] },
  B: { sharps: ["F", "C", "G", "D", "A"], flats: [] },
  F: { sharps: [], flats: ["B"] },
  Bb: { sharps: [], flats: ["B", "E"] },
  Eb: { sharps: [], flats: ["B", "E", "A"] },
  Ab: { sharps: [], flats: ["B", "E", "A", "D"] },
  Am: { sharps: [], flats: [] },
  Em: { sharps: ["F"], flats: [] },
  Dm: { sharps: [], flats: ["B"] },
  Gm: { sharps: [], flats: ["B", "E"] },
  Bm: { sharps: ["F", "C"], flats: [] },
  Fsm: { sharps: ["F", "C", "G"], flats: [] },
  Cm: { sharps: [], flats: ["B", "E", "A"] },
};

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
}

function toFraction(value: number, maxDen = 16): { n: number; d: number } {
  const den = maxDen;
  const num = Math.round(value * den);
  const g = gcd(num, den);
  return { n: num / g, d: den / g };
}

/**
 * ABC duration suffix relative to the unit note (`L:`).
 * `beats` is in quarter-notes; `unitBeats` is how many quarter-notes `L` represents.
 */
export function abcDuration(beats: number, unitBeats: number): string {
  const { n, d } = toFraction(beats / unitBeats, 16);
  if (n === 1 && d === 1) {
    return "";
  }
  if (d === 1) {
    return String(n);
  }
  if (n === 1) {
    return `/${d}`;
  }
  return `${n}/${d}`;
}

function keySignatureName(key: string, mode: Song["mode"]): string {
  if (mode === "minor") {
    return `${key}m`;
  }
  return key;
}

function signatureFor(key: string, mode: Song["mode"]): {
  sharps: string[];
  flats: string[];
} {
  const name = keySignatureName(key, mode);
  return KEY_SIGNATURES[name] ?? { sharps: [], flats: [] };
}

function abcOctave(letter: string, octave: number): string {
  if (octave >= 5) {
    return letter.toLowerCase() + "'".repeat(octave - 5);
  }
  return letter.toUpperCase() + ",".repeat(4 - octave);
}

export function pitchToAbc(
  pitch: string,
  key: string,
  mode: Song["mode"],
): string {
  if (isRest(pitch)) {
    return "z";
  }
  const { letter, accidental, octave } = parseScientificPitch(pitch);
  const { sharps, flats } = signatureFor(key, mode);
  const inSharpKey = sharps.includes(letter);
  const inFlatKey = flats.includes(letter);

  let prefix = "";
  if (accidental === "#") {
    prefix = inSharpKey ? "" : "^";
  } else if (accidental === "b") {
    prefix = inFlatKey ? "" : "_";
  } else if (inSharpKey || inFlatKey) {
    prefix = "=";
  }

  return `${prefix}${abcOctave(letter, octave)}`;
}

function unitBeatsFor(timeSignature: TimeSignature): { l: string; unitBeats: number } {
  if (timeSignature === "3/4") {
    return { l: "1/4", unitBeats: 1 };
  }
  return { l: "1/8", unitBeats: 0.5 };
}

function abcVoiceId(id: InstrumentId): string {
  return id.replace(/[^A-Za-z0-9]/g, "");
}

function noteToAbc(
  note: Note,
  key: string,
  mode: Song["mode"],
  unitBeats: number,
): string {
  const pitches = notePitches(note);
  const suffix = abcDuration(note.duration, unitBeats);
  if (pitches.length === 0) {
    return `z${suffix}`;
  }
  if (pitches.length === 1) {
    return `${pitchToAbc(pitches[0], key, mode)}${suffix}`;
  }
  return `[${pitches.map((item) => pitchToAbc(item, key, mode)).join("")}]${suffix}`;
}

function measureToAbc(
  measure: Measure,
  key: string,
  mode: Song["mode"],
  unitBeats: number,
): string {
  return measure.notes
    .map((note) => noteToAbc(note, key, mode, unitBeats))
    .join(" ");
}

function padMeasures(measures: Measure[], count: number, beats: number): Measure[] {
  if (measures.length >= count) {
    return measures.slice(0, count);
  }
  const restBar: Measure = { notes: [{ pitch: "rest", duration: beats }] };
  const extra = Array.from({ length: count - measures.length }, () => restBar);
  return [...measures, ...extra];
}

function abcKeyHeader(key: string, mode: Song["mode"]): string {
  if (mode === "minor") {
    return `${key}min`;
  }
  return key;
}

/**
 * Convert a Song to ABC notation with one voice per selected instrument.
 * Empty `selectedInstrumentIds` includes every part on the song.
 */
export function songToAbc(song: Song, selectedInstrumentIds: string[]): string {
  const selected =
    selectedInstrumentIds.length === 0
      ? song.parts.map((p) => p.instrumentId)
      : selectedInstrumentIds.filter(isInstrumentId);

  const selectedSet = new Set(selected);
  const parts = song.parts.filter((p) => selectedSet.has(p.instrumentId));
  const beats = BEATS[song.timeSignature];
  const { l, unitBeats } = unitBeatsFor(song.timeSignature);
  const barCount = Math.max(0, ...parts.map((p) => p.measures.length));

  const lines: string[] = [
    "X:1",
    `T:${song.title}`,
    `C:${song.artist}`,
    `M:${song.timeSignature}`,
    `L:${l}`,
    `Q:1/4=${Math.round(song.tempo)}`,
    `K:${abcKeyHeader(song.key, song.mode)}`,
  ];

  if (parts.length === 0 || barCount === 0) {
    lines.push("z4 |");
    return `${lines.join("\n")}\n`;
  }

  const staveIds = parts.map((p) => abcVoiceId(p.instrumentId));
  lines.push(`%%score ${staveIds.join(" ")}`);

  let midiChannel = 1;
  parts.forEach((part) => {
    const instrument = getInstrument(part.instrumentId);
    const voiceId = abcVoiceId(part.instrumentId);
    const isPerc = instrument.clef === "perc" || part.instrumentId === "drums";
    const channel = isPerc ? 10 : midiChannel;
    if (!isPerc) {
      midiChannel = Math.min(16, midiChannel + 1);
      if (midiChannel === 10) {
        midiChannel = 11;
      }
    }

    lines.push(
      `V:${voiceId} name="${instrument.label}" snm="${instrument.shortLabel}" clef=${instrument.clef}`,
    );
    if (isPerc) {
      lines.push("%%MIDI channel 10");
      lines.push("%%MIDI program 0");
    } else {
      lines.push(`%%MIDI channel ${channel}`);
      lines.push(`%%MIDI program ${instrument.midiProgram}`);
    }

    const measures = padMeasures(part.measures, barCount, beats);
    const rendered = measures.map((measure) =>
      measureToAbc(measure, isPerc ? "C" : song.key, isPerc ? "major" : song.mode, unitBeats),
    );

    const grouped: string[] = [];
    for (let i = 0; i < rendered.length; i += 4) {
      const chunk = rendered.slice(i, i + 4).join(" | ");
      const closer = i + 4 >= rendered.length ? " |]" : " |";
      grouped.push(`${chunk}${closer}`);
    }
    lines.push(...grouped);
  });

  return `${lines.join("\n")}\n`;
}

export function downloadAbc(song: Song, selectedIds: InstrumentId[]) {
  const abc = songToAbc(song, selectedIds);
  const blob = new Blob([abc], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const slug = song.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  anchor.href = url;
  anchor.download = `${slug || "scoreband"}.abc`;
  anchor.click();
  URL.revokeObjectURL(url);
}
