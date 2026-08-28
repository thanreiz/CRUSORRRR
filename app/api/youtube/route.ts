import { NextResponse } from "next/server";
import { extractYoutubeId } from "@/lib/youtube";

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("url") ?? "";
  const videoId = extractYoutubeId(raw);
  if (!videoId) {
    return NextResponse.json(
      { error: "Paste a full YouTube URL or an 11-character video id." },
      { status: 400 },
    );
  }

  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  try {
    const oembed = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`,
      { cache: "no-store" },
    );
    if (oembed.ok) {
      const data = (await oembed.json()) as {
        title?: string;
        author_name?: string;
        thumbnail_url?: string;
      };
      return NextResponse.json({
        videoId,
        title: data.title ?? "Untitled video",
        author: data.author_name ?? "YouTube",
        thumbnail:
          data.thumbnail_url ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      });
    }
    return NextResponse.json({
      videoId,
      title: `Chart from ${videoId}`,
      author: "YouTube",
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    });
  } catch {
    return NextResponse.json(
      { error: "Could not reach YouTube right now." },
      { status: 502 },
    );
  }
}
