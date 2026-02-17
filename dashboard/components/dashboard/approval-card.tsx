"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, HelpCircle, X, ChevronRight } from "lucide-react";
import { getApiClient } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import type { Approval } from "@/lib/types";

interface ApprovalCardProps {
  approval: Approval;
  onSnooze: (id: string) => void;
}

export function ApprovalCard({ approval, onSnooze }: ApprovalCardProps) {
  const [expanded, setExpanded] = useState(false);
  const api = getApiClient();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (status: "approved" | "rejected") =>
      api.patch(`/api/approvals/${approval.id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approvals-pending"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
  });

  const isPending = mutation.isPending;

  return (
    <div
      className={cn(
        "border border-gray-200 rounded-lg transition-all",
        isPending && "opacity-50 pointer-events-none"
      )}
    >
      {/* Collapsed row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-1 flex items-center gap-3 text-left min-w-0"
        >
          <ChevronRight
            className={cn(
              "h-4 w-4 text-gray-400 shrink-0 transition-transform",
              expanded && "rotate-90"
            )}
          />
          <div className="min-w-0">
            <p className="font-medium text-gray-900 truncate">{approval.candidate_name}</p>
            <p className="text-sm text-gray-500 truncate">
              {[approval.candidate_title, approval.candidate_company].filter(Boolean).join(" @ ")}
            </p>
          </div>
        </button>

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => mutation.mutate("approved")}
            className="p-2 rounded-full hover:bg-green-100 text-green-600 transition-colors"
            title="Approve"
          >
            <Check className="h-5 w-5" />
          </button>
          <button
            onClick={() => onSnooze(approval.id)}
            className="p-2 rounded-full hover:bg-yellow-100 text-yellow-500 transition-colors"
            title="Maybe (snooze)"
          >
            <HelpCircle className="h-5 w-5" />
          </button>
          <button
            onClick={() => mutation.mutate("rejected")}
            className="p-2 rounded-full hover:bg-red-100 text-red-600 transition-colors"
            title="Reject"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-100">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="info">{approval.approval_type}</Badge>
          </div>
          <div className="bg-gray-50 rounded-md p-3 text-sm text-gray-700 whitespace-pre-wrap">
            {approval.proposed_text}
          </div>
          {approval.context && (
            <p className="mt-2 text-xs text-gray-500">{approval.context}</p>
          )}
        </div>
      )}
    </div>
  );
}

interface ApprovalListProps {
  approvals: Approval[];
}

export function ApprovalList({ approvals }: ApprovalListProps) {
  const [snoozed, setSnoozed] = useState<Set<string>>(new Set());

  const visible = approvals.filter((a) => !snoozed.has(a.id));
  const snoozedCount = snoozed.size;

  const handleSnooze = (id: string) => {
    setSnoozed((prev) => new Set(prev).add(id));
  };

  const showSnoozed = () => {
    setSnoozed(new Set());
  };

  if (approvals.length === 0) return null;

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">
          Pending Approvals ({visible.length})
        </h3>
        {snoozedCount > 0 && (
          <button
            onClick={showSnoozed}
            className="text-sm text-yellow-600 hover:text-yellow-700 font-medium"
          >
            Show {snoozedCount} snoozed
          </button>
        )}
      </div>
      <div className="p-4 space-y-2">
        {visible.length === 0 && snoozedCount > 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">
            All approvals snoozed.{" "}
            <button onClick={showSnoozed} className="text-yellow-600 hover:underline">
              Show them
            </button>
          </p>
        ) : (
          visible.map((a) => (
            <ApprovalCard key={a.id} approval={a} onSnooze={handleSnooze} />
          ))
        )}
      </div>
    </div>
  );
}
