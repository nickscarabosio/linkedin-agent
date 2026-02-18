"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PauseCircle, PlayCircle } from "lucide-react";
import { getApiClient } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import type { Campaign, Candidate, Approval } from "@/lib/types";

const statusBadgeVariant: Record<string, "success" | "warning" | "default"> = {
  active: "success",
  paused: "warning",
  completed: "default",
};

interface PipelineStats {
  found: number;
  pending: number;
  sent: number;
}

function computePipelineStats(
  campaignId: string,
  candidates: Candidate[],
  approvals: Approval[]
): PipelineStats {
  const campaignCandidates = candidates.filter((c) => c.campaign_id === campaignId);
  const campaignApprovals = approvals.filter((a) =>
    campaignCandidates.some((c) => c.id === a.candidate_id)
  );

  return {
    found: campaignCandidates.length,
    pending: campaignApprovals.filter((a) => a.status === "pending").length,
    sent: campaignApprovals.filter((a) => a.status === "sent").length,
  };
}

interface CampaignControlPanelProps {
  campaigns: Campaign[];
  candidates: Candidate[];
  approvals: Approval[];
}

export function CampaignControlPanel({ campaigns, candidates, approvals }: CampaignControlPanelProps) {
  const api = getApiClient();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const toggleMutation = useMutation({
    mutationFn: ({ id, newStatus }: { id: string; newStatus: "active" | "paused" }) =>
      api.patch(`/api/campaigns/${id}`, { status: newStatus }),
    onSuccess: (_data, variables) => {
      toast.success(variables.newStatus === "paused" ? "Campaign paused" : "Campaign resumed");
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["campaigns-active"] });
    },
    onError: (err: unknown) => {
      const apiErr = err as { response?: { data?: { error?: string } } };
      toast.error(apiErr.response?.data?.error || "Something went wrong");
    },
  });

  if (campaigns.length === 0) return null;

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">Campaigns</h3>
      </div>
      <div className="divide-y divide-gray-100">
        {campaigns.map((campaign) => {
          const stats = computePipelineStats(campaign.id, candidates, approvals);
          const isToggling = toggleMutation.isPending && toggleMutation.variables?.id === campaign.id;

          return (
            <div key={campaign.id} className="flex items-center gap-4 px-6 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-900 truncate">{campaign.title}</p>
                  <Badge variant={statusBadgeVariant[campaign.status]}>{campaign.status}</Badge>
                </div>
                <p className="text-sm text-gray-500 mt-0.5">
                  <span>{stats.found} found</span>
                  <span className="mx-1.5 text-gray-300">/</span>
                  <span>{stats.pending} pending</span>
                  <span className="mx-1.5 text-gray-300">/</span>
                  <span>{stats.sent} sent</span>
                </p>
              </div>

              {campaign.status !== "completed" && (
                <button
                  onClick={() =>
                    toggleMutation.mutate({
                      id: campaign.id,
                      newStatus: campaign.status === "active" ? "paused" : "active",
                    })
                  }
                  disabled={isToggling}
                  className={cn(
                    "p-2 rounded-lg transition-colors shrink-0",
                    campaign.status === "active"
                      ? "text-yellow-600 hover:bg-yellow-50"
                      : "text-green-600 hover:bg-green-50",
                    isToggling && "opacity-50"
                  )}
                  title={campaign.status === "active" ? "Pause campaign" : "Resume campaign"}
                >
                  {campaign.status === "active" ? (
                    <PauseCircle className="h-5 w-5" />
                  ) : (
                    <PlayCircle className="h-5 w-5" />
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
