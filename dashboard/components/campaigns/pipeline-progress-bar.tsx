"use client";

import { cn } from "@/lib/cn";
import type { CandidatePipelineProgress } from "@/lib/types";

interface PipelineProgressBarProps {
  progress: CandidatePipelineProgress[];
}

const STATUS_COLORS: Record<string, string> = {
  completed: "bg-green-500",
  in_progress: "bg-blue-500",
  pending: "bg-gray-200",
  skipped: "bg-yellow-400",
  failed: "bg-red-500",
};

export function PipelineProgressBar({ progress }: PipelineProgressBarProps) {
  if (progress.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      {progress.map((p) => (
        <div
          key={p.id}
          className={cn(
            "h-2 flex-1 rounded-full transition-colors",
            STATUS_COLORS[p.status] || "bg-gray-200"
          )}
          title={`${p.stage_name || "Stage"}: ${p.status}`}
        />
      ))}
    </div>
  );
}
