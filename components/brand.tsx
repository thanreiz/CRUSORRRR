"use client";

import { Mic2 } from "lucide-react";

export function BrandMark() {
  return (
    <div className="flex items-center gap-2">
      <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Mic2 className="size-4" />
      </span>
      <span className="font-heading text-lg tracking-tight">Scoreband</span>
    </div>
  );
}
