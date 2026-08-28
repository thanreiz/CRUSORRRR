"use client";

import { notePitches } from "./music";
import type { InstrumentId, Song } from "./types";

type ToneModule = typeof import("tone");

type ChannelKit = {
  gain: import("tone").Gain;
  trigger: (
    pitches: string[],
    durationSec: number,
    time: number,
    velocity?: number,
  ) => void;
  dispose: () => void;
};

export type ScorePlayer = {
  start: (song: Song, selectedIds: InstrumentId[]) => Promise<void>;
  stop: () => void;
  setMuted: (id: InstrumentId, muted: boolean) => void;
  setSolo: (id: InstrumentId | null) => void;
  isPlaying: () => boolean;
};

function drumKind(pitchName: string): "kick" | "snare" | "hat" | "open" | "tom" | "crash" | "ride" {
  if (pitchName.startsWith("C2")) return "kick";
  if (pitchName.startsWith("D2")) return "snare";
  if (pitchName.startsWith("G#2")) return "open";
  if (pitchName.startsWith("F#2")) return "hat";
  if (pitchName.startsWith("C#3")) return "crash";
  if (pitchName.startsWith("A3")) return "ride";
  return "tom";
}

function buildKit(Tone: ToneModule, id: InstrumentId): ChannelKit {
  const gain = new Tone.Gain(0.85).toDestination();

  if (id === "drums") {
    const kick = new Tone.MembraneSynth({
      pitchDecay: 0.05,
      octaves: 5,
      envelope: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.1 },
    }).connect(gain);
    const snareNoise = new Tone.NoiseSynth({
      envelope: { attack: 0.001, decay: 0.18, sustain: 0 },
    }).connect(gain);
    const snareBody = new Tone.MembraneSynth({
      pitchDecay: 0.01,
      octaves: 3,
      envelope: { attack: 0.001, decay: 0.12, sustain: 0 },
    }).connect(gain);
    const hat = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.07, release: 0.02 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000,
      octaves: 1.5,
    }).connect(gain);
    const crash = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.8, release: 0.3 },
      harmonicity: 5.1,
      resonance: 2500,
      octaves: 1.5,
    }).connect(gain);
    const tom = new Tone.MembraneSynth({
      pitchDecay: 0.08,
      octaves: 3,
    }).connect(gain);

    return {
      gain,
      trigger: (pitches, _duration, time, velocity = 0.8) => {
        const vel = Math.max(0.2, Math.min(1, velocity));
        for (const item of pitches) {
          switch (drumKind(item)) {
            case "kick":
              kick.triggerAttackRelease("C1", 0.25, time, vel);
              break;
            case "snare":
              snareNoise.triggerAttackRelease(0.18, time, vel * 0.7);
              snareBody.triggerAttackRelease("G2", 0.12, time, vel);
              break;
            case "hat":
              hat.triggerAttackRelease(0.06, time, vel * 0.35);
              break;
            case "open":
              hat.triggerAttackRelease(0.22, time, vel * 0.4);
              break;
            case "crash":
              crash.triggerAttackRelease(0.6, time, vel * 0.45);
              break;
            case "ride":
              crash.triggerAttackRelease(Math.max(0.28, _duration), time, vel * 0.28);
              break;
            default:
              tom.triggerAttackRelease(item, 0.18, time, vel);
          }
        }
      },
      dispose: () => {
        kick.dispose();
        snareNoise.dispose();
        snareBody.dispose();
        hat.dispose();
        crash.dispose();
        tom.dispose();
        gain.dispose();
      },
    };
  }

  if (id === "bass") {
    const synth = new Tone.MonoSynth({
      oscillator: { type: "fatsawtooth" },
      filter: { Q: 2, frequency: 800 },
      envelope: { attack: 0.02, decay: 0.2, sustain: 0.6, release: 0.18 },
      filterEnvelope: { attack: 0.01, decay: 0.15, sustain: 0.3, release: 0.2, baseFrequency: 120, octaves: 2.5 },
    }).connect(gain);
    return {
      gain,
      trigger: (pitches, duration, time, velocity = 0.85) => {
        if (pitches[0]) synth.triggerAttackRelease(pitches[0], duration, time, velocity);
      },
      dispose: () => {
        synth.dispose();
        gain.dispose();
      },
    };
  }

  if (id === "piano") {
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.005, decay: 0.3, sustain: 0.35, release: 0.6 },
    }).connect(gain);
    synth.maxPolyphony = 12;
    return {
      gain,
      trigger: (pitches, duration, time, velocity = 0.6) => {
        synth.triggerAttackRelease(pitches, duration, time, velocity);
      },
      dispose: () => {
        synth.dispose();
        gain.dispose();
      },
    };
  }

  if (id === "leadGuitar" || id === "rhythmGuitar") {
    const dist = new Tone.Distortion(id === "leadGuitar" ? 0.35 : 0.18).connect(gain);
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: id === "leadGuitar" ? "sawtooth" : "triangle" },
      envelope: {
        attack: 0.01,
        decay: id === "rhythmGuitar" ? 0.18 : 0.15,
        sustain: id === "rhythmGuitar" ? 0.15 : 0.4,
        release: 0.15,
      },
    }).connect(dist);
    return {
      gain,
      trigger: (pitches, duration, time, velocity = 0.55) => {
        synth.triggerAttackRelease(pitches, Math.max(0.08, duration * 0.9), time, velocity);
      },
      dispose: () => {
        synth.dispose();
        dist.dispose();
        gain.dispose();
      },
    };
  }

  if (id === "altoSax") {
    const synth = new Tone.FMSynth({
      harmonicity: 3,
      modulationIndex: 4,
      envelope: { attack: 0.06, decay: 0.1, sustain: 0.7, release: 0.2 },
      modulationEnvelope: { attack: 0.04, decay: 0.1, sustain: 0.4, release: 0.15 },
    }).connect(gain);
    return {
      gain,
      trigger: (pitches, duration, time, velocity = 0.5) => {
        if (pitches[0]) synth.triggerAttackRelease(pitches[0], duration, time, velocity);
      },
      dispose: () => {
        synth.dispose();
        gain.dispose();
      },
    };
  }

  if (id === "trumpet") {
    const synth = new Tone.Synth({
      oscillator: { type: "square" },
      envelope: { attack: 0.03, decay: 0.08, sustain: 0.55, release: 0.12 },
    });
    const filter = new Tone.Filter(1800, "lowpass");
    synth.connect(filter);
    filter.connect(gain);
    return {
      gain,
      trigger: (pitches, duration, time, velocity = 0.45) => {
        if (pitches[0]) synth.triggerAttackRelease(pitches[0], duration, time, velocity);
      },
      dispose: () => {
        synth.dispose();
        filter.dispose();
        gain.dispose();
      },
    };
  }

  const synth = new Tone.Synth({
    oscillator: { type: "triangle" },
    envelope: { attack: 0.04, decay: 0.1, sustain: 0.65, release: 0.25 },
  }).connect(gain);
  return {
    gain,
    trigger: (pitches, duration, time, velocity = 0.55) => {
      if (pitches[0]) synth.triggerAttackRelease(pitches[0], duration, time, velocity);
    },
    dispose: () => {
      synth.dispose();
      gain.dispose();
    },
  };
}

export function createScorePlayer(): ScorePlayer {
  let playing = false;
  let kits: Partial<Record<InstrumentId, ChannelKit>> = {};
  const muted = new Set<InstrumentId>();
  let solo: InstrumentId | null = null;
  let scheduled: number[] = [];
  let ToneRef: ToneModule | null = null;

  const applyMutes = () => {
    const soloKit = solo !== null && kits[solo] ? solo : null;
    (Object.entries(kits) as [InstrumentId, ChannelKit][]).forEach(([id, kit]) => {
      const silent = muted.has(id) || (soloKit !== null && soloKit !== id);
      kit.gain.gain.value = silent ? 0 : 0.85;
    });
  };

  const teardown = () => {
    if (ToneRef) {
      scheduled.forEach((id) => ToneRef!.Transport.clear(id));
      ToneRef.Transport.stop();
      ToneRef.Transport.cancel();
      ToneRef.Transport.position = 0;
    }
    scheduled = [];
    Object.values(kits).forEach((kit) => kit?.dispose());
    kits = {};
    muted.clear();
    solo = null;
    playing = false;
  };

  return {
    async start(song, selectedIds) {
      const Tone = await import("tone");
      ToneRef = Tone;
      teardown();
      await Tone.start();
      Tone.Destination.volume.value = -6;
      Tone.Transport.bpm.value = song.tempo;

      const beat = 60 / song.tempo;
      let loopEnd = 0;

      for (const part of song.parts) {
        if (!selectedIds.includes(part.instrumentId)) continue;
        const kit = buildKit(Tone, part.instrumentId);
        kits[part.instrumentId] = kit;
        let t = 0;
        for (const measure of part.measures) {
          for (const note of measure.notes) {
            const pitches = notePitches(note);
            if (pitches.length > 0) {
              const start = t;
              const dur = note.duration * beat;
              const id = Tone.Transport.schedule((time) => {
                kit.trigger(pitches, dur, time, note.velocity);
              }, start);
              scheduled.push(id);
            }
            t += note.duration * beat;
          }
        }
        loopEnd = Math.max(loopEnd, t);
      }

      applyMutes();
      Tone.Transport.loop = true;
      Tone.Transport.loopStart = 0;
      Tone.Transport.loopEnd = loopEnd || 8;
      Tone.Transport.start();
      playing = true;
    },
    stop() {
      teardown();
    },
    setMuted(id, value) {
      if (value) muted.add(id);
      else muted.delete(id);
      applyMutes();
    },
    setSolo(id) {
      solo = id;
      applyMutes();
    },
    isPlaying() {
      return playing;
    },
  };
}
