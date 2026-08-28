export type YoutubeMeta = {
  videoId: string;
  title: string;
  author: string;
  thumbnail: string;
};

const ID_PATTERN =
  /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|^[A-Za-z0-9_-]{11}$)([A-Za-z0-9_-]{11})?/;

export function extractYoutubeId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }
  try {
    const url = new URL(trimmed);
    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id && id.length === 11 ? id : null;
    }
    if (url.searchParams.get("v")) {
      const id = url.searchParams.get("v");
      return id && id.length === 11 ? id : null;
    }
    const parts = url.pathname.split("/").filter(Boolean);
    const marker = parts.findIndex((part) =>
      ["embed", "shorts", "live"].includes(part),
    );
    if (marker >= 0 && parts[marker + 1]?.length === 11) {
      return parts[marker + 1];
    }
  } catch {
    const match = trimmed.match(ID_PATTERN);
    if (match?.[1]?.length === 11) {
      return match[1];
    }
  }
  return null;
}

export async function fetchYoutubeMeta(rawUrl: string): Promise<YoutubeMeta> {
  const response = await fetch(
    `/api/youtube?url=${encodeURIComponent(rawUrl.trim())}`,
  );
  const payload = (await response.json()) as
    | YoutubeMeta
    | { error: string };
  if (!response.ok || "error" in payload) {
    throw new Error(
      "error" in payload ? payload.error : "Could not read that YouTube link",
    );
  }
  return payload;
}
