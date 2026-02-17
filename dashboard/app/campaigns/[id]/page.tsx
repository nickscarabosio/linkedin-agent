"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  const [actionPanel, setActionPanel] = useState<ActionPanel>(null);
  const [generatingUrl, setGeneratingUrl] = useState(false);

  const { data: campaign, isLoading } = useQuery<Campaign>({
    queryKey: ["campaign", id],
    queryFn: () => api.get(`/api/campaigns/${id}`).then((r) => r.data),
  });

  const { data: candidates } = useQuery<Candidate[]>({
    queryKey: ["candidates", { campaign_id: id }],
    queryFn: () => api.get("/api/candidates", { params: { campaign_id: id } }).then((r) => r.data),
    enabled: !!id,
  });

  // Fetch pipeline progress for all candidates in this campaign
  const [progressMap, setProgressMap] = useState<Record<string, CandidatePipelineProgress[]>>({});

  useEffect(() => {
    if (!candidates || !campaign?.pipeline_id) return;

    const fetchProgress = async () => {
      const map: Record<string, CandidatePipelineProgress[]> = {};
      // Fetch in batches to avoid overwhelming the server
      for (const candidate of candidates) {
        try {
          const { data } = await api.get(`/api/candidates/${candidate.id}/pipeline-progress`);
          if (data.length > 0) map[candidate.id] = data;
        } catch {
          // ignore individual failures
        }
      }
      setProgressMap(map);
    };
    fetchProgress();
  }, [candidates, campaign?.pipeline_id]);

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
      }
    } catch {
      // silently fail — user can retry
    } finally {
      setGeneratingUrl(false);
    }
  };

  if (isLoading) return <div className="text-gray-500">Loading...</div>;
  if (!campaign) return <div className="text-red-500">Campaign not found</div>;

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
    </div>
  );
}
