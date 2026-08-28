# Scoreband

Paste a YouTube link or drop an MP3, pick who is on the gig, and get a playable band chart.

Scoreband is a rehearsal-room web app for a buildathon demo. It engraves a staff for each stand you select, then plays the arrangement in the browser so you can audition bass without drums, solo the sax, or print the paper.

## What you can do

- Open one of three original demo songs and hear every part
- Toggle vocal, guitars, bass, drums, piano, alto sax, and trumpet
- Mute or solo a stand while the chart loops
- Paste a YouTube URL — the title is read from YouTube, then a deterministic arrangement is written from the video id
- Drop an MP3 — tempo is guessed from onsets, then the band is voiced so you still get sheets
- Download ABC notation or print the chart

This demo does not download copyrighted YouTube audio. YouTube is metadata plus a generated arrangement. Real rehearsal takes work best as an MP3 drop.

## Run locally

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43217](http://127.0.0.1:43217). Click **Open Midnight Fire**, then **Play band**. Mute drums and solo the bass to confirm each instrument has its own voice.

## Stack

Next.js (App Router), TypeScript, Tailwind, shadcn/ui, abcjs for engraving, Tone.js for playback.
