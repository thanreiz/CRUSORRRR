"use client";

import { useEffect, useRef } from "react";

export function ScoreSheet({ abc }: { abc: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;

    (async () => {
      const mod = await import("abcjs");
      const abcjs = "renderAbc" in mod ? mod : (mod as { default: typeof mod }).default;
      if (cancelled || !host) return;
      host.innerHTML = "";
      abcjs.renderAbc(host, abc, {
        responsive: "resize",
        staffwidth: 820,
        wrap: {
          minSpacing: 1.3,
          maxSpacing: 2.7,
          preferredMeasuresPerLine: 4,
        },
        paddingleft: 8,
        paddingright: 12,
        paddingtop: 8,
        paddingbottom: 8,
        foregroundColor: "#1b1710",
      });
    })();

    return () => {
      cancelled = true;
      host.innerHTML = "";
    };
  }, [abc]);

  return (
    <div className="score-paper overflow-x-auto rounded-xl px-3 py-4 sm:px-6">
      <div ref={hostRef} className="min-h-[240px]" />
    </div>
  );
}
