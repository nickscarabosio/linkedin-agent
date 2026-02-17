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
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

export function ApprovalCard({ approval, onSnooze, selected, onToggleSelect }: ApprovalCardProps) {
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
        isPending && "opacity-50 pointer-events-none",
        selected && "border-blue-400 bg-blue-50/50"
      )}
    >
      {/* Collapsed row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {onToggleSelect && (
          <input
            type="checkbox"
            checked={selected || false}
            onChange={() => onToggleSelect(approval.id)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0"
          />
        )}
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const api = getApiClient();
  const queryClient = useQueryClient();

  const visible = approvals.filter((a) => !snoozed.has(a.id));
  const snoozedCount = snoozed.size;

  const allVisibleSelected = visible.length > 0 && visible.every((a) => selected.has(a.id));

  const handleSnooze = (id: string) => {
    setSnoozed((prev) => new Set(prev).add(id));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const showSnoozed = () => {
    setSnoozed(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visible.map((a) => a.id)));
    }
  };

  const batchMutation = useMutation({
    mutationFn: (status: "approved" | "rejected") =>
      api.post("/api/approvals/batch", { ids: Array.from(selected), status }),
    onSuccess: () => {
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["approvals-pending"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
  });

  if (approvals.length === 0) return null;

  return (
    <div className="bg-white rounded-lg shadow relative">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={toggleSelectAll}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            title="Select all"
          />
          <h3 className="text-lg font-semibold text-gray-900">
            Pending Approvals ({visible.length})
          </h3>
        </div>
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
            <ApprovalCard
              key={a.id}
              approval={a}
              onSnooze={handleSnooze}
              selected={selected.has(a.id)}
              onToggleSelect={toggleSelect}
            />
          ))
        )}
      </div>

      {/* Batch action bar */}
      {selected.size > 0 && (
        <div className="sticky bottom-0 border-t border-gray-200 bg-white px-6 py-3 flex items-center justify-between rounded-b-lg">
          <span className="text-sm font-medium text-gray-700">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => batchMutation.mutate("approved")}
              disabled={batchMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              <Check className="h-4 w-4" />
              Approve
            </button>
            <button
              onClick={() => batchMutation.mutate("rejected")}
              disabled={batchMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              <X className="h-4 w-4" />
              Reject
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
