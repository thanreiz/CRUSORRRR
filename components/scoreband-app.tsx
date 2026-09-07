"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  FileAudio,
  Pause,
  Play,
  Printer,
  RotateCcw,
  Square,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { downloadAbc, songToAbc } from "@/lib/abc";
import { analyzeAudioToSong, arrangeFromSeed } from "@/lib/arrange";
import {
  BAND_STRESS_TESTS,
  DEMO_SONGS,
  OPM_DEMOS,
  type BandStressTest,
} from "@/lib/demos";
import { INSTRUMENTS } from "@/lib/instruments";
import { createScorePlayer, type ScorePlayer } from "@/lib/playback";
import type { InstrumentId, Song } from "@/lib/types";
import { fetchYoutubeMeta, safeHttpsUrl } from "@/lib/youtube";
import { ScoreSheet } from "@/components/score-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

const ALL_IDS = INSTRUMENTS.map((instrument) => instrument.id);

type Screen = "home" | "loading" | "studio";

const LOADING_STEPS = [
  "Pulling the track",
  "Finding the pocket",
  "Voicing the band",
  "Engraving the parts",
];

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function ScorebandApp() {
  const [screen, setScreen] = useState<Screen>("home");
  const [loadingStep, setLoadingStep] = useState(0);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [song, setSong] = useState<Song | null>(null);
  const [selected, setSelected] = useState<InstrumentId[]>(ALL_IDS);
  const [muted, setMuted] = useState<Set<InstrumentId>>(new Set());
  const [solo, setSolo] = useState<InstrumentId | null>(null);
  const [playing, setPlaying] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const playerRef = useRef<ScorePlayer | null>(null);

  useEffect(() => {
    playerRef.current = createScorePlayer();
    return () => playerRef.current?.stop();
  }, []);

  const abc = useMemo(() => {
    if (!song) return "";
    return songToAbc(song, selected);
  }, [song, selected]);

  function toggleInstrument(id: InstrumentId) {
    setSelected((current) => {
      if (current.includes(id)) {
        if (current.length === 1) return current;
        if (solo === id) {
          setSolo(null);
          playerRef.current?.setSolo(null);
        }
        return current.filter((item) => item !== id);
      }
      return [...current, id];
    });
  }

  async function runLoading<T>(work: () => Promise<T>): Promise<T> {
    setScreen("loading");
    setLoadingStep(0);
    setError(null);
    const tick = window.setInterval(() => {
      setLoadingStep((step) => Math.min(LOADING_STEPS.length - 1, step + 1));
    }, 450);
    try {
      await wait(500);
      const result = await work();
      await wait(350);
      return result;
    } finally {
      window.clearInterval(tick);
    }
  }

  async function openSong(next: Song) {
    playerRef.current?.stop();
    setPlaying(false);
    setMuted(new Set());
    setSolo(null);
    setSong(next);
    setScreen("studio");
  }

  async function loadDemo(demo: Song) {
    const next = await runLoading(async () => demo);
    await openSong(next);
  }

  async function loadYoutube(options?: {
    url?: string;
    style?: string;
    bars?: number;
    tempo?: number;
  }) {
    const url = options?.url ?? youtubeUrl;
    try {
      const meta = await runLoading(async () => fetchYoutubeMeta(url));
      const next = arrangeFromSeed(meta.videoId, meta.title, selected, {
        artist: meta.author,
        source: "youtube",
        youtubeId: meta.videoId,
        thumbnail: meta.thumbnail,
        style: options?.style,
        bars: options?.bars,
        tempo: options?.tempo,
      });
      setYoutubeUrl(url);
      await openSong(next);
    } catch (err) {
      setScreen("home");
      const message =
        err instanceof Error ? err.message : "Could not read that YouTube link.";
      setError(message);
      toast.error(message);
    }
  }

  async function loadBandStressTest(test: BandStressTest) {
    await loadYoutube({
      url: test.youtubeUrl,
      style: test.style,
      bars: test.bars,
      tempo: test.tempo,
    });
  }

  async function loadFile(file: File) {
    if (!file.type.includes("audio") && !file.name.match(/\.(mp3|wav|m4a|ogg)$/i)) {
      const message = "Drop an MP3, WAV, or M4A rehearsal take.";
      setError(message);
      toast.error(message);
      return;
    }
    try {
      const next = await runLoading(async () => {
        const buffer = await file.arrayBuffer();
        const context = new AudioContext();
        const decoded = await context.decodeAudioData(buffer.slice(0));
        await context.close();
        const channel = decoded.getChannelData(0);
        const title = file.name.replace(/\.[^.]+$/, "");
        return analyzeAudioToSong(channel, decoded.sampleRate, selected, title);
      });
      await openSong(next);
    } catch (err) {
      setScreen("home");
      const message =
        err instanceof Error ? err.message : "Could not decode that audio file.";
      setError(message);
      toast.error(message);
    }
  }

  async function togglePlayback() {
    if (!song || !playerRef.current) return;
    if (playing) {
      playerRef.current.stop();
      setPlaying(false);
      return;
    }
    try {
      await playerRef.current.start(song, selected);
      muted.forEach((id) => playerRef.current?.setMuted(id, true));
      playerRef.current.setSolo(solo);
      setPlaying(true);
    } catch {
      toast.error("The browser blocked audio. Click Play again after interacting with the page.");
    }
  }

  function stopPlayback() {
    playerRef.current?.stop();
    setPlaying(false);
  }

  function onMute(id: InstrumentId) {
    setMuted((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      playerRef.current?.setMuted(id, next.has(id));
      return next;
    });
  }

  function onSolo(id: InstrumentId) {
    const next = solo === id ? null : id;
    setSolo(next);
    playerRef.current?.setSolo(next);
  }

  const lineupReady = useRef(false);
  useEffect(() => {
    if (!lineupReady.current) {
      lineupReady.current = true;
      return;
    }
    if (!(playing && song)) return;
    void (async () => {
      playerRef.current?.stop();
      await playerRef.current?.start(song, selected);
      muted.forEach((id) => playerRef.current?.setMuted(id, true));
      playerRef.current?.setSolo(solo);
    })();
    // Restart only when the visible band changes while already playing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  if (screen === "loading") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <div className="flex gap-1.5">
          {Array.from({ length: 5 }).map((_, index) => (
            <span
              key={index}
              className="eq-bar w-2 rounded-full bg-primary"
              style={{ animationDelay: `${index * 0.12}s` }}
            />
          ))}
        </div>
        <p className="mt-8 font-heading text-3xl">{LOADING_STEPS[loadingStep]}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Writing charts for {selected.length} stand{selected.length === 1 ? "" : "s"}.
        </p>
      </main>
    );
  }

  if (screen === "studio" && song) {
    const thumbnail = safeHttpsUrl(song.thumbnail);
    return (
      <div className="flex flex-1 flex-col">
        <header className="border-b border-border/80 bg-background/80 backdrop-blur">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                {thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumbnail}
                    alt=""
                    className="hidden h-16 w-24 rounded-lg object-cover sm:block"
                  />
                ) : null}
                <div className="min-w-0">
                  <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase">
                    {song.source === "demo"
                      ? "Demo room"
                      : song.source === "youtube"
                        ? "From YouTube"
                        : "From MP3"}
                  </p>
                  <h1 className="font-heading text-2xl leading-tight sm:text-3xl">
                    {song.title}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {song.artist} · {song.style} · {song.key} {song.mode} ·{" "}
                    {song.timeSignature} · {song.tempo} BPM
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={() => { stopPlayback(); setScreen("home"); }}>
                  <RotateCcw />
                  New chart
                </Button>
                <Button
                  variant="outline"
                  onClick={() => downloadAbc(song, selected)}
                >
                  <Download />
                  ABC
                </Button>
                <Button variant="outline" onClick={() => window.print()}>
                  <Printer />
                  Print
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="lg" onClick={() => void togglePlayback()}>
                {playing ? <Pause /> : <Play />}
                {playing ? "Pause band" : "Play band"}
              </Button>
              <Button variant="secondary" onClick={stopPlayback}>
                <Square />
                Stop
              </Button>
              <p className="text-xs text-muted-foreground sm:ml-2">
                Playback loops the full chart. Mute or solo a stand to audition parts.
              </p>
            </div>
          </div>
        </header>

        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row">
          <aside className="w-full shrink-0 lg:w-72">
            <Card>
              <CardHeader>
                <CardTitle>Band lineup</CardTitle>
                <CardDescription>
                  Hide a staff or audition one player. Charts rewrite when the lineup changes.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2">
                {INSTRUMENTS.map((instrument) => {
                  const on = selected.includes(instrument.id);
                  const isMuted = muted.has(instrument.id);
                  const isSolo = solo === instrument.id;
                  return (
                    <div
                      key={instrument.id}
                      className="flex items-center gap-2 rounded-lg border border-border/70 px-2 py-2"
                    >
                      <button
                        type="button"
                        onClick={() => toggleInstrument(instrument.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span
                          className="mr-2 inline-block size-2 rounded-full"
                          style={{ background: on ? instrument.color : "#555" }}
                        />
                        <span className={on ? "text-sm" : "text-sm text-muted-foreground line-through"}>
                          {instrument.label}
                        </span>
                      </button>
                      <Button
                        size="xs"
                        variant={isSolo ? "default" : "ghost"}
                        disabled={!on}
                        onClick={() => onSolo(instrument.id)}
                      >
                        Solo
                      </Button>
                      <Button
                        size="xs"
                        variant={isMuted ? "secondary" : "ghost"}
                        disabled={!on}
                        onClick={() => onMute(instrument.id)}
                      >
                        {isMuted ? "Muted" : "Mute"}
                      </Button>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </aside>

          <section className="min-w-0 flex-1 print:w-full">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-heading text-xl">Chart</h2>
              <p className="text-xs text-muted-foreground">
                {selected.length} part{selected.length === 1 ? "" : "s"} engraved
              </p>
            </div>
            {selected.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                  Pick at least one instrument to engrave a staff.
                </CardContent>
              </Card>
            ) : (
              <ScoreSheet abc={abc} />
            )}
          </section>
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="max-w-2xl">
        <p className="text-xs tracking-[0.28em] text-primary uppercase">Buildathon · rehearsal room</p>
        <h1 className="mt-3 font-heading text-4xl leading-[1.05] sm:text-6xl">
          One track in. A band chart out.
        </h1>
        <p className="mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
          Paste a YouTube link or drop an MP3. Pick who is on the gig. Scoreband writes a
          playable chart for each stand — then you can hear the arrangement before anyone
          sits down. Built for OPM rehearsals and full-band stress tests.
        </p>
      </div>

      {error ? (
        <p className="mt-6 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="mt-10 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Video className="size-4" />
              YouTube
            </CardTitle>
            <CardDescription>
              We read the title from YouTube, then write a deterministic arrangement from the video. The demo does not download copyrighted audio.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row">
            <Input
              value={youtubeUrl}
              onChange={(event) => setYoutubeUrl(event.target.value)}
              placeholder="https://www.youtube.com/watch?v=…"
              onKeyDown={(event) => {
                if (event.key === "Enter") void loadYoutube();
              }}
            />
            <Button onClick={() => void loadYoutube()} disabled={!youtubeUrl.trim()}>
              Write charts
            </Button>
          </CardContent>
        </Card>

        <Card
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            const file = event.dataTransfer.files[0];
            if (file) void loadFile(file);
          }}
          className={dragOver ? "border-primary" : undefined}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileAudio className="size-4" />
              MP3 rehearsal take
            </CardTitle>
            <CardDescription>
              Tempo is guessed from onsets. The band voicing is generated so you still get sheets even on a rough room recording.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <input
              ref={fileRef}
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.ogg"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void loadFile(file);
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center justify-center rounded-xl border border-dashed border-border px-4 py-8 text-sm text-muted-foreground hover:border-primary hover:text-foreground"
            >
              Drop an MP3 here, or click to browse
            </button>
          </CardContent>
        </Card>
      </div>

      <Separator className="my-10" />

      <div className="mb-4">
        <h2 className="font-heading text-2xl">OPM / Tagalog demos</h2>
        <p className="text-sm text-muted-foreground">
          Original Filipino-flavored charts for the band — ballad, Manila disco, and pop-rock. Not covers of commercial OPM hits.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {OPM_DEMOS.map((demo) => (
          <Card key={demo.id} className="flex flex-col">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <Badge variant="secondary">{demo.style}</Badge>
                <span className="text-xs text-muted-foreground">{demo.tempo} BPM</span>
              </div>
              <CardTitle className="font-heading text-2xl">{demo.title}</CardTitle>
              <CardDescription>
                {demo.artist} · {demo.key} {demo.mode} ·{" "}
                {demo.parts[0]?.measures.length ?? demo.bars ?? 16} bars
              </CardDescription>
            </CardHeader>
            <CardContent className="mt-auto">
              <Button className="w-full" onClick={() => void loadDemo(demo)}>
                <Play />
                Open {demo.title}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-12 mb-4">
        <h2 className="font-heading text-2xl">Majestic band test</h2>
        <p className="text-sm text-muted-foreground">
          Pulls the YouTube title, then writes a theatrical Scoreband chart for the full lineup. This is a stress test — not Queen&apos;s licensed arrangement.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {BAND_STRESS_TESTS.map((test) => (
          <Card key={test.id} className="border-primary/40">
            <CardHeader>
              <Badge>Opera rock · 16 bars · 8 stands</Badge>
              <CardTitle className="font-heading text-2xl">{test.title}</CardTitle>
              <CardDescription>{test.subtitle}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" size="lg" onClick={() => void loadBandStressTest(test)}>
                <Play />
                Run majestic test
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Separator className="my-10" />

      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-2xl">Studio warm-ups</h2>
          <p className="text-sm text-muted-foreground">
            Original English demos if you want a quick funk, waltz, or indie pass first.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {DEMO_SONGS.map((demo) => (
          <Card key={demo.id} className="flex flex-col">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <Badge variant="secondary">{demo.style}</Badge>
                <span className="text-xs text-muted-foreground">{demo.tempo} BPM</span>
              </div>
              <CardTitle className="font-heading text-2xl">{demo.title}</CardTitle>
              <CardDescription>
                {demo.key} {demo.mode} · {demo.timeSignature} · {demo.parts[0]?.measures.length ?? demo.bars ?? 16} bars · 8 stands
              </CardDescription>
            </CardHeader>
            <CardContent className="mt-auto">
              <Button className="w-full" onClick={() => void loadDemo(demo)}>
                <Play />
                Open {demo.title}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <section className="mt-12">
        <h2 className="font-heading text-2xl">Who is on the gig?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Toggle the lineup before you generate, or after — the score only engraves the stands you keep.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {INSTRUMENTS.map((instrument) => {
            const on = selected.includes(instrument.id);
            return (
              <button
                key={instrument.id}
                type="button"
                onClick={() => toggleInstrument(instrument.id)}
                className={`rounded-xl border px-3 py-3 text-left transition ${
                  on
                    ? "border-primary/70 bg-primary/10"
                    : "border-border bg-card text-muted-foreground"
                }`}
              >
                <span
                  className="mb-2 block size-2 rounded-full"
                  style={{ background: instrument.color }}
                />
                <span className="block text-sm font-medium text-foreground">
                  {instrument.label}
                </span>
                <span className="mt-1 block text-xs">{instrument.description}</span>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}
