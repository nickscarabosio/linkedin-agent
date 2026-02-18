"use client";

import { useState, useEffect, Fragment } from "react";
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
import type { Campaign, Candidate, CandidatePipelineProgress, PipelineStatus, ScoreBucket, ScoringResult, JobSpec } from "@/lib/types";
import { AddCandidateForm } from "@/components/campaigns/add-candidate-form";
import { CsvUpload } from "@/components/campaigns/csv-upload";
import { PipelineProgressBar } from "@/components/campaigns/pipeline-progress-bar";
import { JobSpecEditor } from "@/components/campaigns/job-spec-editor";
import { ChevronDown, ChevronRight } from "lucide-react";

type ActionPanel = "add" | "csv" | null;

const SCORE_BUCKET_STYLES: Record<ScoreBucket, { bg: string; text: string }> = {
  Hot: { bg: "bg-red-100", text: "text-red-800" },
  Warm: { bg: "bg-orange-100", text: "text-orange-800" },
  Cool: { bg: "bg-blue-100", text: "text-blue-800" },
  Cold: { bg: "bg-gray-100", text: "text-gray-600" },
};

const PIPELINE_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  identified: { label: "Identified", color: "bg-gray-100 text-gray-700" },
  connection_sent: { label: "Conn. Sent", color: "bg-blue-100 text-blue-700" },
  connection_expired: { label: "Conn. Expired", color: "bg-red-100 text-red-700" },
  connected_no_message: { label: "Connected", color: "bg-green-100 text-green-700" },
  message_1_sent: { label: "Msg 1 Sent", color: "bg-indigo-100 text-indigo-700" },
  message_2_sent: { label: "Msg 2 Sent", color: "bg-indigo-100 text-indigo-700" },
  inmail_sent: { label: "InMail Sent", color: "bg-purple-100 text-purple-700" },
  replied_positive: { label: "Replied +", color: "bg-green-100 text-green-800" },
  replied_negative: { label: "Replied -", color: "bg-red-100 text-red-700" },
  replied_maybe: { label: "Replied ?", color: "bg-yellow-100 text-yellow-800" },
  qualify_link_sent: { label: "Qualify Sent", color: "bg-teal-100 text-teal-700" },
  qualified: { label: "Qualified", color: "bg-emerald-100 text-emerald-800" },
  intro_booked: { label: "Intro Booked", color: "bg-emerald-100 text-emerald-800" },
  client_reviewing: { label: "Client Review", color: "bg-amber-100 text-amber-800" },
  offer_extended: { label: "Offer", color: "bg-emerald-100 text-emerald-800" },
  placed: { label: "Placed", color: "bg-green-200 text-green-900" },
  passed: { label: "Passed", color: "bg-gray-100 text-gray-600" },
  not_a_fit: { label: "Not a Fit", color: "bg-red-50 text-red-600" },
  archived: { label: "Archived", color: "bg-gray-100 text-gray-500" },
};

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
  const [pipelineFilter, setPipelineFilter] = useState<string>("all");
  const [expandedScoreId, setExpandedScoreId] = useState<string | null>(null);
  const [scoringAll, setScoringAll] = useState(false);
  const [jobSpec, setJobSpec] = useState<JobSpec>({});
  const [jobSpecOpen, setJobSpecOpen] = useState(false);

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

  const scoreAllMutation = useMutation({
    mutationFn: async () => {
      setScoringAll(true);
      return api.post(`/api/campaigns/${id}/score-candidates`).then((r) => r.data);
    },
    onSuccess: (data: { scored: number; buckets: Record<string, number> }) => {
      toast.success(`Scored ${data.scored} candidates`);
      queryClient.invalidateQueries({ queryKey: ["candidates", { campaign_id: id }] });
    },
    onError: (err: unknown) => {
      const apiErr = err as { response?: { data?: { error?: string } } };
      toast.error(apiErr.response?.data?.error || "Failed to score candidates");
    },
    onSettled: () => setScoringAll(false),
  });

  useEffect(() => {
    if (campaign?.job_spec) {
      setJobSpec(campaign.job_spec);
    }
  }, [campaign?.job_spec]);

  const jobSpecMutation = useMutation({
    mutationFn: (spec: JobSpec) =>
      api.patch(`/api/campaigns/${id}`, { job_spec: spec }),
    onSuccess: () => {
      toast.success("Job specification saved");
      queryClient.invalidateQueries({ queryKey: ["campaign", id] });
    },
    onError: (err: unknown) => {
      const apiErr = err as { response?: { data?: { error?: string } } };
      toast.error(apiErr.response?.data?.error || "Failed to save job specification");
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

  const pipelineStatusCounts = (candidates || []).reduce<Record<string, number>>((acc, c) => {
    const ps = c.pipeline_status || "identified";
    acc[ps] = (acc[ps] || 0) + 1;
    return acc;
  }, {});

  const filteredCandidates = (candidates || []).filter((c) => {
    if (pipelineFilter === "all") return true;
    return (c.pipeline_status || "identified") === pipelineFilter;
  });

  const scoredCount = (candidates || []).filter((c) => c.total_score != null).length;
  const unscoredCount = (candidates || []).length - scoredCount;

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
            {Object.entries(pipelineStatusCounts).map(([status, count]) => {
              const meta = PIPELINE_STATUS_LABELS[status] || { label: status, color: "" };
              return (
                <div key={status} className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">{meta.label}</span>
                  <span className="text-sm font-medium text-gray-900">{count}</span>
                </div>
              );
            })}
            {Object.keys(pipelineStatusCounts).length === 0 && (
              <p className="text-sm text-gray-500">No candidates yet</p>
            )}
          </div>
          {scoredCount > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-200">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Scores</h4>
              <div className="flex gap-2 flex-wrap">
                {(["Hot", "Warm", "Cool", "Cold"] as ScoreBucket[]).map((bucket) => {
                  const count = (candidates || []).filter((c) => c.score_bucket === bucket).length;
                  if (count === 0) return null;
                  const style = SCORE_BUCKET_STYLES[bucket];
                  return (
                    <span key={bucket} className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
                      {bucket}: {count}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Job Specification */}
      <div className="bg-white rounded-lg shadow">
        <button
          onClick={() => setJobSpecOpen(!jobSpecOpen)}
          className="w-full flex items-center justify-between p-6 text-left"
        >
          <h3 className="font-semibold text-gray-900">Job Specification</h3>
          {jobSpecOpen ? <ChevronDown className="h-5 w-5 text-gray-400" /> : <ChevronRight className="h-5 w-5 text-gray-400" />}
        </button>
        {jobSpecOpen && (
          <div className="px-6 pb-6 space-y-4">
            <JobSpecEditor value={jobSpec} onChange={setJobSpec} />
            <Button
              size="sm"
              onClick={() => jobSpecMutation.mutate(jobSpec)}
              disabled={jobSpecMutation.isPending}
            >
              {jobSpecMutation.isPending ? "Saving..." : "Save Job Spec"}
            </Button>
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="flex gap-3 flex-wrap">
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
        {unscoredCount > 0 && campaign.job_spec && Object.keys(campaign.job_spec).length > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => scoreAllMutation.mutate()}
            disabled={scoringAll}
          >
            {scoringAll ? (
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                Scoring...
              </span>
            ) : (
              `Score ${unscoredCount} Candidates`
            )}
          </Button>
        )}
      </div>

      {actionPanel === "add" && (
        <AddCandidateForm campaignId={id as string} onClose={() => setActionPanel(null)} />
      )}
      {actionPanel === "csv" && (
        <CsvUpload campaignId={id as string} onClose={() => setActionPanel(null)} />
      )}

      {/* Pipeline status filter */}
      {candidates && candidates.length > 0 && Object.keys(pipelineStatusCounts).length > 1 && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setPipelineFilter("all")}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
              pipelineFilter === "all"
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
            }`}
          >
            All ({candidates.length})
          </button>
          {Object.entries(pipelineStatusCounts).map(([status, count]) => {
            const meta = PIPELINE_STATUS_LABELS[status] || { label: status, color: "bg-gray-100 text-gray-600" };
            return (
              <button
                key={status}
                onClick={() => setPipelineFilter(status)}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                  pipelineFilter === status
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                }`}
              >
                {meta.label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {filteredCandidates.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">
              Candidates ({filteredCandidates.length}{pipelineFilter !== "all" ? ` of ${candidates?.length}` : ""})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Score</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pipeline</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  {hasPipeline && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Progress</th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredCandidates.map((c) => {
                  const bucketStyle = c.score_bucket ? SCORE_BUCKET_STYLES[c.score_bucket] : null;
                  const pipelineMeta = PIPELINE_STATUS_LABELS[c.pipeline_status || "identified"] || { label: c.pipeline_status || "identified", color: "bg-gray-100 text-gray-600" };
                  const isExpanded = expandedScoreId === c.id;

                  return (
                    <Fragment key={c.id}>
                      <tr className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                            {c.name}
                          </a>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">{c.title}</td>
                        <td className="px-6 py-4 text-sm text-gray-500">{c.company}</td>
                        <td className="px-6 py-4">
                          {c.total_score != null && bucketStyle ? (
                            <button
                              onClick={() => setExpandedScoreId(isExpanded ? null : c.id)}
                              className="flex items-center gap-1"
                            >
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${bucketStyle.bg} ${bucketStyle.text}`}>
                                {c.score_bucket} ({c.total_score})
                              </span>
                              {isExpanded ? <ChevronDown className="h-3 w-3 text-gray-400" /> : <ChevronRight className="h-3 w-3 text-gray-400" />}
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${pipelineMeta.color}`}>
                            {pipelineMeta.label}
                          </span>
                        </td>
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
                      {isExpanded && c.score_data && (
                        <tr className="bg-gray-50">
                          <td colSpan={hasPipeline ? 7 : 6} className="px-6 py-4">
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                              <div>
                                <span className="text-gray-500">Role Fit:</span>{" "}
                                <span className="font-medium">{c.score_data.scores.role_fit}</span>
                              </div>
                              <div>
                                <span className="text-gray-500">Company Context:</span>{" "}
                                <span className="font-medium">{c.score_data.scores.company_context}</span>
                              </div>
                              <div>
                                <span className="text-gray-500">Trajectory:</span>{" "}
                                <span className="font-medium">{c.score_data.scores.trajectory_stability}</span>
                              </div>
                              <div>
                                <span className="text-gray-500">Education:</span>{" "}
                                <span className="font-medium">{c.score_data.scores.education}</span>
                              </div>
                              <div>
                                <span className="text-gray-500">Profile Quality:</span>{" "}
                                <span className="font-medium">{c.score_data.scores.profile_quality}</span>
                              </div>
                              <div>
                                <span className="text-gray-500">Bonus:</span>{" "}
                                <span className="font-medium">+{c.score_data.scores.bonus}</span>
                              </div>
                            </div>
                            {c.score_data.score_rationale && (
                              <p className="mt-3 text-sm text-gray-600">{c.score_data.score_rationale}</p>
                            )}
                            {c.personalization_hook && (
                              <div className="mt-2">
                                <span className="text-xs text-gray-500">Hook:</span>{" "}
                                <span className="text-sm text-gray-700 italic">{c.personalization_hook}</span>
                              </div>
                            )}
                            {c.score_data.flags && c.score_data.flags.length > 0 && (
                              <div className="mt-2 flex gap-1.5 flex-wrap">
                                {c.score_data.flags.map((flag, i) => (
                                  <span key={i} className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-yellow-50 text-yellow-700 border border-yellow-200">
                                    {flag}
                                  </span>
                                ))}
                              </div>
                            )}
                            {c.score_data.recommended_action && (
                              <p className="mt-2 text-xs text-gray-500">
                                Recommended: <span className="font-medium">{c.score_data.recommended_action}</span>
                              </p>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
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
