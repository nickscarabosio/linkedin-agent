"use client";

import { useState, useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useParams } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryError } from "@/components/ui/query-error";
import { Dialog } from "@/components/ui/dialog";
import Link from "next/link";
import type { Campaign, Candidate, CandidatePipelineProgress } from "@/lib/types";
import { AddCandidateForm } from "@/components/campaigns/add-candidate-form";
import { CsvUpload } from "@/components/campaigns/csv-upload";
import { PipelineProgressBar } from "@/components/campaigns/pipeline-progress-bar";

type ActionPanel = "add" | "csv" | null;

export default function CampaignDetailPage() {
  const { id } = useParams();
  const api = getApiClient();
  const queryClient = useQueryClient();
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const [actionPanel, setActionPanel] = useState<ActionPanel>(null);
  const [generatingUrl, setGeneratingUrl] = useState(false);
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  const { data: campaign, isLoading, isError, refetch } = useQuery<Campaign>({
    queryKey: ["campaign", id],
    queryFn: () => api.get(`/api/campaigns/${id}`).then((r) => r.data),
  });

  const { data: candidates } = useQuery<Candidate[]>({
    queryKey: ["candidates", { campaign_id: id }],
    queryFn: () => api.get("/api/candidates", { params: { campaign_id: id } }).then((r) => r.data),
    enabled: !!id,
  });

  const { data: progressMap = {} } = useQuery<Record<string, CandidatePipelineProgress[]>>({
    queryKey: ["campaign-pipeline-progress", id],
    queryFn: () => api.get(`/api/campaigns/${id}/pipeline-progress`).then((r) => r.data),
    enabled: !!id && !!campaign?.pipeline_id,
  });

  const { data: activeUsers } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["users-active"],
    queryFn: () => api.get("/api/users/active").then((r) => r.data),
    enabled: teamDialogOpen,
  });

  const assignmentsMutation = useMutation({
    mutationFn: (userIds: string[]) =>
      api.put(`/api/campaigns/${id}/assignments`, { user_ids: userIds }),
    onSuccess: () => {
      toast.success("Team updated");
      setTeamDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["campaign", id] });
    },
    onError: (err: unknown) => {
      const apiErr = err as { response?: { data?: { error?: string } } };
      toast.error(apiErr.response?.data?.error || "Failed to update team");
    },
  });

  const canManageTeam = isAdmin || campaign?.created_by_user_id === user?.id;

  const openTeamDialog = () => {
    if (campaign?.assigned_users) {
      setSelectedUserIds(new Set(campaign.assigned_users.map((u) => u.id)));
    }
    setTeamDialogOpen(true);
  };

  const generateSearchUrl = async () => {
    if (!campaign) return;
    setGeneratingUrl(true);
    try {
      const { data } = await api.post("/api/ai/generate-search-url", {
        role_title: campaign.role_title,
        role_description: campaign.role_description,
        ideal_candidate_profile: campaign.ideal_candidate_profile,
      }, { timeout: 30000 });
      if (data.linkedin_search_url) {
        await api.patch(`/api/campaigns/${id}`, { linkedin_search_url: data.linkedin_search_url });
        queryClient.invalidateQueries({ queryKey: ["campaign", id] });
        toast.success("Search URL generated");
      }
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { error?: string } } };
      toast.error(apiErr.response?.data?.error || "Failed to generate search URL");
    } finally {
      setGeneratingUrl(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-4 w-24 mb-4" />
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      </div>
    );
  }

  if (isError || !campaign) {
    return (
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <QueryError message={isError ? "Failed to load campaign" : "Campaign not found"} onRetry={refetch} />
      </div>
    );
  }

  const statusCounts = (candidates || []).reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1;
    return acc;
  }, {});

  const hasPipeline = !!campaign.pipeline_id;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <Link href="/campaigns" className="text-sm text-blue-600 hover:underline">&larr; Campaigns</Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-2">{campaign.title}</h1>
          <p className="text-gray-500 mt-1">{campaign.role_title}</p>
        </div>
        <Badge variant={campaign.status === "active" ? "success" : "warning"}>
          {campaign.status}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold text-gray-900 mb-3">Details</h3>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm text-gray-500">Role Description</dt>
              <dd className="text-sm text-gray-900 mt-1">{campaign.role_description}</dd>
            </div>
            {campaign.ideal_candidate_profile && (
              <div>
                <dt className="text-sm text-gray-500">Ideal Candidate</dt>
                <dd className="text-sm text-gray-900 mt-1">{campaign.ideal_candidate_profile}</dd>
              </div>
            )}
            <div>
              <dt className="text-sm text-gray-500">Search URL</dt>
              {campaign.linkedin_search_url ? (
                <dd className="text-sm mt-1 space-y-1">
                  <a href={campaign.linkedin_search_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 break-all hover:underline">
                    {campaign.linkedin_search_url.length > 80
                      ? campaign.linkedin_search_url.slice(0, 80) + "..."
                      : campaign.linkedin_search_url}
                  </a>
                  <div>
                    <button
                      onClick={generateSearchUrl}
                      disabled={generatingUrl}
                      className="text-xs text-gray-400 hover:text-blue-600 transition-colors"
                    >
                      {generatingUrl ? "Regenerating..." : "Regenerate with AI"}
                    </button>
                  </div>
                </dd>
              ) : (
                <dd className="mt-1">
                  <Button size="sm" variant="outline" onClick={generateSearchUrl} disabled={generatingUrl}>
                    {generatingUrl ? (
                      <span className="flex items-center gap-2">
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                        Generating...
                      </span>
                    ) : (
                      "Generate Search URL with AI"
                    )}
                  </Button>
                  <p className="text-xs text-gray-400 mt-1">AI will create a LinkedIn search based on this campaign&apos;s role details.</p>
                </dd>
              )}
            </div>
            {campaign.created_by_name && (
              <div>
                <dt className="text-sm text-gray-500">Created by</dt>
                <dd className="text-sm text-gray-900 mt-1">{campaign.created_by_name}</dd>
              </div>
            )}
            <div>
              <dt className="text-sm text-gray-500">Team</dt>
              <dd className="text-sm text-gray-900 mt-1 flex items-center gap-2">
                <span>{campaign.assigned_users?.map((u) => u.name).join(", ") || "—"}</span>
                {canManageTeam && (
                  <button
                    onClick={openTeamDialog}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Manage
                  </button>
                )}
              </dd>
            </div>
          </dl>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold text-gray-900 mb-3">Pipeline</h3>
          <div className="space-y-2">
            {Object.entries(statusCounts).map(([status, count]) => (
              <div key={status} className="flex justify-between">
                <span className="text-sm text-gray-600 capitalize">{status}</span>
                <span className="text-sm font-medium text-gray-900">{count}</span>
              </div>
            ))}
            {Object.keys(statusCounts).length === 0 && (
              <p className="text-sm text-gray-500">No candidates yet</p>
            )}
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex gap-3">
        <Button
          size="sm"
          variant={actionPanel === "add" ? "default" : "outline"}
          onClick={() => setActionPanel(actionPanel === "add" ? null : "add")}
        >
          Add Candidate
        </Button>
        <Button
          size="sm"
          variant={actionPanel === "csv" ? "default" : "outline"}
          onClick={() => setActionPanel(actionPanel === "csv" ? null : "csv")}
        >
          Upload CSV
        </Button>
      </div>

      {actionPanel === "add" && (
        <AddCandidateForm campaignId={id as string} onClose={() => setActionPanel(null)} />
      )}
      {actionPanel === "csv" && (
        <CsvUpload campaignId={id as string} onClose={() => setActionPanel(null)} />
      )}

      {candidates && candidates.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">Candidates ({candidates.length})</h3>
          </div>
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                {hasPipeline && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Progress</th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {candidates.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                      {c.name}
                    </a>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{c.title}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{c.company}</td>
                  <td className="px-6 py-4">
                    <Badge>{c.status}</Badge>
                  </td>
                  {hasPipeline && (
                    <td className="px-6 py-4 min-w-[120px]">
                      {progressMap[c.id] ? (
                        <PipelineProgressBar progress={progressMap[c.id]} />
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={teamDialogOpen} onClose={() => setTeamDialogOpen(false)}>
        <h2 className="text-lg font-semibold text-gray-900">Manage Team</h2>
        <p className="mt-1 text-sm text-gray-500">Select users who can view and manage this campaign.</p>
        <div className="mt-4 space-y-2 max-h-64 overflow-y-auto">
          {activeUsers?.map((u) => {
            const isCreator = u.id === campaign?.created_by_user_id;
            return (
              <label key={u.id} className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={selectedUserIds.has(u.id)}
                  disabled={isCreator}
                  onChange={(e) => {
                    setSelectedUserIds((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(u.id);
                      else next.delete(u.id);
                      return next;
                    });
                  }}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                {u.name}{isCreator ? " (creator)" : ""}
              </label>
            );
          })}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setTeamDialogOpen(false)} disabled={assignmentsMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => assignmentsMutation.mutate(Array.from(selectedUserIds))}
            disabled={assignmentsMutation.isPending}
          >
            {assignmentsMutation.isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
