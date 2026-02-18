"use client";

import { useState, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Check, X } from "lucide-react";
import { getApiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { TableSkeleton } from "@/components/ui/skeleton";
import { QueryError } from "@/components/ui/query-error";
import type { UnifiedCandidate, Campaign, User } from "@/lib/types";

const candidateStatuses = ["new", "contacted", "responded", "rejected", "skipped", "archived"] as const;

const statusVariant: Record<string, "default" | "success" | "warning" | "danger" | "info" | "purple"> = {
  new: "info",
  contacted: "warning",
  responded: "success",
  rejected: "danger",
  skipped: "default",
  archived: "default",
};

const approvalStatusVariant: Record<string, "warning" | "info" | "danger" | "success" | "default"> = {
  pending: "warning",
  approved: "info",
  rejected: "danger",
  sent: "success",
  failed: "danger",
};

export default function CandidatesPage() {
  const api = getApiClient();
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAdmin } = useAuth();
  const { toast } = useToast();

  // Filter state from URL params
  const filterParam = searchParams.get("filter") || "";
  const campaignParam = searchParams.get("campaign_id") || "";
  const statusParam = searchParams.get("status") || "";
  const ownerParam = searchParams.get("owner_id") || "";
  const dateFromParam = searchParams.get("date_from") || "";
  const dateToParam = searchParams.get("date_to") || "";

  const isPendingApprovalFilter = filterParam === "pending_approval";

  // Local UI state
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState("");
  const [editingText, setEditingText] = useState<Record<string, string>>({});

  // Build query params
  const queryParams: Record<string, string> = {};
  if (isPendingApprovalFilter) queryParams.has_pending_approval = "true";
  if (statusParam) queryParams.status = statusParam;
  if (campaignParam) queryParams.campaign_id = campaignParam;
  if (ownerParam) queryParams.owner_id = ownerParam;
  if (dateFromParam) queryParams.date_from = dateFromParam;
  if (dateToParam) queryParams.date_to = dateToParam;

  const { data: candidates = [], isLoading, isError, refetch } = useQuery<UnifiedCandidate[]>({
    queryKey: ["candidates-unified", queryParams],
    queryFn: () => api.get("/api/candidates/unified", { params: queryParams }).then((r) => r.data),
  });

  const { data: campaigns = [] } = useQuery<Campaign[]>({
    queryKey: ["campaigns"],
    queryFn: () => api.get("/api/campaigns").then((r) => r.data),
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["admin-users"],
    queryFn: () => api.get("/api/admin/users").then((r) => r.data),
    enabled: isAdmin,
  });

  // Mutations
  const approvalMutation = useMutation({
    mutationFn: ({ id, status, proposed_text }: { id: string; status: string; proposed_text?: string }) =>
      api.patch(`/api/approvals/${id}`, { status, proposed_text }),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ["candidates-unified", queryParams] });
      const snapshot = queryClient.getQueryData<UnifiedCandidate[]>(["candidates-unified", queryParams]);
      queryClient.setQueryData<UnifiedCandidate[]>(["candidates-unified", queryParams], (old) =>
        old?.map((c) => (c.approval_id === id ? { ...c, approval_status: status as UnifiedCandidate["approval_status"] } : c))
      );
      return { snapshot };
    },
    onSuccess: () => {
      toast.success("Approval updated");
      queryClient.invalidateQueries({ queryKey: ["candidates-unified"] });
      queryClient.invalidateQueries({ queryKey: ["approvals-pending"] });
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
    },
    onError: (err: unknown, _vars, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(["candidates-unified", queryParams], context.snapshot);
      }
      const apiErr = err as { response?: { data?: { error?: string } } };
      toast.error(apiErr.response?.data?.error || "Something went wrong");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["candidates-unified"] });
      queryClient.invalidateQueries({ queryKey: ["approvals-pending"] });
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
    },
  });

  const bulkMutation = useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: string }) =>
      api.patch("/api/candidates/bulk", { ids, status }),
    onSuccess: (_data, variables) => {
      toast.success(`Status updated for ${variables.ids.length} candidates`);
      queryClient.invalidateQueries({ queryKey: ["candidates-unified"] });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      setSelectedIds(new Set());
      setBulkStatus("");
    },
    onError: (err: unknown) => {
      const apiErr = err as { response?: { data?: { error?: string } } };
      toast.error(apiErr.response?.data?.error || "Something went wrong");
    },
  });

  // Unique owners from data for non-admin users
  const ownerOptions = useMemo(() => {
    if (isAdmin && users.length > 0) return users;
    const seen = new Map<string, string>();
    candidates.forEach((c) => {
      if (c.owner_id && c.owner_name && !seen.has(c.owner_id)) {
        seen.set(c.owner_id, c.owner_name);
      }
    });
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [candidates, users, isAdmin]);

  // URL helpers
  function updateFilter(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    }
    router.push(`/candidates?${params.toString()}`);
  }

  function clearFilters() {
    router.push("/candidates");
  }

  // Selection helpers
  const allSelected = candidates.length > 0 && candidates.every((c) => selectedIds.has(c.id));

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(candidates.map((c) => c.id)));
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleExpand(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const hasActiveFilters = isPendingApprovalFilter || statusParam || campaignParam || ownerParam || dateFromParam || dateToParam;

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold text-gray-900">Candidates</h1>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 bg-white rounded-lg shadow px-4 py-3">
        <Select
          value={campaignParam}
          onChange={(e) => updateFilter({ campaign_id: e.target.value })}
        >
          <option value="">All Campaigns</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </Select>

        <Select
          value={isPendingApprovalFilter ? "pending_approval" : statusParam}
          onChange={(e) => {
            const val = e.target.value;
            if (val === "pending_approval") {
              updateFilter({ filter: "pending_approval", status: "" });
            } else {
              updateFilter({ filter: "", status: val });
            }
          }}
        >
          <option value="">All Statuses</option>
          <option value="pending_approval">Has Pending Approval</option>
          {candidateStatuses.map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </Select>

        {ownerOptions.length > 0 && (
          <Select
            value={ownerParam}
            onChange={(e) => updateFilter({ owner_id: e.target.value })}
          >
            <option value="">All Owners</option>
            {ownerOptions.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </Select>
        )}

        <input
          type="date"
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          value={dateFromParam}
          onChange={(e) => updateFilter({ date_from: e.target.value })}
          placeholder="From"
        />
        <input
          type="date"
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          value={dateToParam}
          onChange={(e) => updateFilter({ date_to: e.target.value })}
          placeholder="To"
        />

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <TableSkeleton rows={8} columns={8} />
      ) : isError ? (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <QueryError onRetry={refetch} />
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="bg-white rounded-lg shadow overflow-hidden hidden sm:block">
            {candidates.length === 0 ? (
              <div className="p-6 text-center text-gray-500">No candidates found.</div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleSelectAll}
                        className="rounded border-gray-300"
                      />
                    </th>
                    <th className="px-4 py-3 w-8" />
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Campaign</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stage</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Owner</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {candidates.map((c) => {
                    const isExpanded = expandedRows.has(c.id);
                    const hasPendingApproval = c.approval_status === "pending";

                    return (
                      <CandidateRow
                        key={c.id}
                        candidate={c}
                        isExpanded={isExpanded}
                        isSelected={selectedIds.has(c.id)}
                        hasPendingApproval={hasPendingApproval}
                        editingText={editingText[c.id]}
                        onToggleExpand={() => toggleExpand(c.id)}
                        onToggleSelect={() => toggleSelect(c.id)}
                        onEditText={(text) => setEditingText((prev) => ({ ...prev, [c.id]: text }))}
                        onApprove={() => {
                          const textOverride = editingText[c.id];
                          approvalMutation.mutate({
                            id: c.approval_id!,
                            status: "approved",
                            ...(textOverride && textOverride !== c.proposed_text ? { proposed_text: textOverride } : {}),
                          });
                        }}
                        onReject={() => approvalMutation.mutate({ id: c.approval_id!, status: "rejected" })}
                        isApprovalPending={approvalMutation.isPending}
                      />
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Mobile card list */}
          <div className="sm:hidden space-y-3">
            {candidates.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">No candidates found.</div>
            ) : (
              candidates.map((c) => {
                const hasPendingApproval = c.approval_status === "pending";
                const isExpanded = expandedRows.has(c.id);
                const dateStr = new Date(c.created_at).toLocaleDateString("en-US", { month: "numeric", day: "numeric" });

                return (
                  <div key={c.id} className="bg-white rounded-lg shadow p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(c.id)}
                          onChange={() => toggleSelect(c.id)}
                          className="rounded border-gray-300 shrink-0"
                        />
                        <div className="min-w-0">
                          <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium text-sm truncate block">
                            {c.name}
                          </a>
                          <p className="text-xs text-gray-500 truncate">
                            {[c.title, c.company].filter(Boolean).join(" @ ")}
                          </p>
                        </div>
                      </div>
                      <Badge variant={statusVariant[c.status] ?? "default"}>{c.status}</Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>{c.campaign_title}</span>
                      <span>{c.owner_name || "—"}</span>
                      <span>{dateStr}</span>
                    </div>
                    {hasPendingApproval && (
                      <div className="flex gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="success"
                          onClick={() => approvalMutation.mutate({ id: c.approval_id!, status: "approved" })}
                          disabled={approvalMutation.isPending}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => approvalMutation.mutate({ id: c.approval_id!, status: "rejected" })}
                          disabled={approvalMutation.isPending}
                        >
                          Reject
                        </Button>
                      </div>
                    )}
                    {c.proposed_text && (
                      <>
                        <button
                          onClick={() => toggleExpand(c.id)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          {isExpanded ? "Hide message" : "Show message"}
                        </button>
                        {isExpanded && (
                          <p className="text-sm text-gray-600 bg-gray-50 rounded p-3 border border-gray-200">
                            {c.proposed_text}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg px-6 py-3 flex items-center gap-4 z-50">
          <span className="text-sm font-medium text-gray-700">
            {selectedIds.size} selected
          </span>
          <Select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value)}
            className="w-40"
          >
            <option value="">Change status...</option>
            {candidateStatuses.map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </Select>
          <Button
            size="sm"
            disabled={!bulkStatus || bulkMutation.isPending}
            onClick={() => {
              if (bulkStatus) {
                bulkMutation.mutate({ ids: Array.from(selectedIds), status: bulkStatus });
              }
            }}
          >
            {bulkMutation.isPending ? "Updating..." : "Apply"}
          </Button>
          <button
            onClick={() => {
              setSelectedIds(new Set());
              setBulkStatus("");
            }}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

function CandidateRow({
  candidate: c,
  isExpanded,
  isSelected,
  hasPendingApproval,
  editingText,
  onToggleExpand,
  onToggleSelect,
  onEditText,
  onApprove,
  onReject,
  isApprovalPending,
}: {
  candidate: UnifiedCandidate;
  isExpanded: boolean;
  isSelected: boolean;
  hasPendingApproval: boolean;
  editingText: string | undefined;
  onToggleExpand: () => void;
  onToggleSelect: () => void;
  onEditText: (text: string) => void;
  onApprove: () => void;
  onReject: () => void;
  isApprovalPending: boolean;
}) {
  const dateStr = new Date(c.created_at).toLocaleDateString("en-US", { month: "numeric", day: "numeric" });

  return (
    <>
      <tr className="hover:bg-gray-50">
        <td className="px-4 py-3">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            className="rounded border-gray-300"
          />
        </td>
        <td className="px-4 py-3">
          {(hasPendingApproval || c.proposed_text) && (
            <button onClick={onToggleExpand} className="text-gray-400 hover:text-gray-600">
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          )}
        </td>
        <td className="px-4 py-3">
          <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium text-sm">
            {c.name}
          </a>
          <p className="text-xs text-gray-500 truncate max-w-[200px]">
            {[c.title, c.company].filter(Boolean).join(" @ ")}
          </p>
        </td>
        <td className="px-4 py-3 text-sm text-gray-600">{c.campaign_title}</td>
        <td className="px-4 py-3 text-sm text-gray-500">{c.pipeline_stage || "—"}</td>
        <td className="px-4 py-3">
          <Badge variant={statusVariant[c.status] ?? "default"}>{c.status}</Badge>
        </td>
        <td className="px-4 py-3">
          {hasPendingApproval ? (
            <div className="flex gap-1">
              <button
                onClick={onApprove}
                disabled={isApprovalPending}
                className="p-1 rounded text-green-600 hover:bg-green-50 disabled:opacity-50"
                title="Approve"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                onClick={onReject}
                disabled={isApprovalPending}
                className="p-1 rounded text-red-600 hover:bg-red-50 disabled:opacity-50"
                title="Reject"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : c.approval_status ? (
            <Badge variant={approvalStatusVariant[c.approval_status] ?? "default"}>
              {c.approval_status}
            </Badge>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </td>
        <td className="px-4 py-3 text-sm text-gray-500">{c.owner_name || "—"}</td>
        <td className="px-4 py-3 text-sm text-gray-500">{dateStr}</td>
      </tr>

      {/* Expanded row */}
      {isExpanded && (
        <tr>
          <td colSpan={9} className="px-4 py-3 bg-gray-50">
            <div className="ml-14 space-y-3">
              {c.approval_type && (
                <p className="text-xs text-gray-500">
                  Type: <span className="font-medium">{c.approval_type}</span>
                </p>
              )}
              {c.proposed_text && (
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Proposed Message</label>
                  {hasPendingApproval ? (
                    <textarea
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      rows={3}
                      value={editingText ?? c.proposed_text}
                      onChange={(e) => onEditText(e.target.value)}
                    />
                  ) : (
                    <p className="text-sm text-gray-600 bg-white rounded p-3 border border-gray-200">
                      {c.proposed_text}
                    </p>
                  )}
                </div>
              )}
              {c.approval_context && c.approval_context !== "Generated by Claude" && (
                <p className="text-xs text-gray-400">{c.approval_context}</p>
              )}
              {c.pipeline_stage && (
                <p className="text-xs text-gray-500">
                  Current Stage: <span className="font-medium">{c.pipeline_stage}</span>
                </p>
              )}
              {hasPendingApproval && (
                <div className="flex gap-2">
                  <Button size="sm" variant="success" onClick={onApprove} disabled={isApprovalPending}>
                    Approve
                  </Button>
                  <Button size="sm" variant="destructive" onClick={onReject} disabled={isApprovalPending}>
                    Reject
                  </Button>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
