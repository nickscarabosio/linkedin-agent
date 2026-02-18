"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import { Users, Megaphone, Plus, Eye } from "lucide-react";
import type { Campaign, Candidate, Approval, AdminStats } from "@/lib/types";
import { ClickableStatCard } from "@/components/dashboard/clickable-stat-card";
import { CampaignControlPanel } from "@/components/dashboard/campaign-control-panel";
import { ApprovalList } from "@/components/dashboard/approval-card";
import { StatCardSkeleton } from "@/components/ui/skeleton";
import { QueryError } from "@/components/ui/query-error";

export default function DashboardPage() {
  const { isAdmin } = useAuth();
  const api = getApiClient();

  const { data: campaigns = [], isError: campaignsError, refetch: refetchCampaigns } = useQuery<Campaign[]>({
    queryKey: ["campaigns"],
    queryFn: () => api.get("/api/campaigns").then((r) => r.data),
  });

  const { data: activeCampaigns, isLoading: activeCampaignsLoading } = useQuery<Campaign[]>({
    queryKey: ["campaigns-active"],
    queryFn: () => api.get("/api/campaigns/active").then((r) => r.data),
  });

  const { data: approvals = [], isError: approvalsError, refetch: refetchApprovals } = useQuery<Approval[]>({
    queryKey: ["approvals-pending"],
    queryFn: () => api.get("/api/approvals", { params: { status: "pending" } }).then((r) => r.data),
  });

  const { data: candidates = [], isLoading: candidatesLoading } = useQuery<Candidate[]>({
    queryKey: ["candidates"],
    queryFn: () => api.get("/api/candidates").then((r) => r.data),
  });

  const { data: stats, isLoading: statsLoading } = useQuery<AdminStats>({
    queryKey: ["admin-stats"],
    queryFn: () => api.get("/api/admin/stats").then((r) => r.data),
    enabled: isAdmin,
  });

  const statsAreLoading = activeCampaignsLoading || candidatesLoading || (isAdmin && statsLoading);

  const [campaignHover, setCampaignHover] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
        <div className="flex items-center gap-3">
          <Link
            href="/candidates"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Users className="h-4 w-4" />
            View Candidates
          </Link>
          <div
            className="relative"
            onMouseEnter={() => setCampaignHover(true)}
            onMouseLeave={() => setCampaignHover(false)}
          >
            <Link
              href="/campaigns"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              <Megaphone className="h-4 w-4" />
              Campaigns
            </Link>
            {campaignHover && (
              <div className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px] z-50">
                <Link
                  href="/campaigns"
                  className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <Eye className="h-4 w-4" />
                  View Campaigns
                </Link>
                <Link
                  href="/campaigns/new"
                  className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <Plus className="h-4 w-4" />
                  New Campaign
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      {statsAreLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <ClickableStatCard
            label="Active Campaigns"
            value={activeCampaigns?.length ?? stats?.active_campaigns ?? "--"}
            color="blue"
            href="/campaigns"
          />
          <ClickableStatCard
            label="Total Candidates"
            value={stats?.total_candidates ?? (candidates.length || "--")}
            color="green"
            href="/candidates"
          />
          <ClickableStatCard
            label="Pending Approvals"
            value={(approvals.length || stats?.pending_approvals) ?? "--"}
            color="yellow"
            href="/candidates?filter=pending_approval"
          />
          <ClickableStatCard
            label="Actions Today"
            value={stats?.today_actions ?? "--"}
            color="purple"
            href="/candidates?filter=pending_approval"
          />
        </div>
      )}

      {/* Error fallback */}
      {(campaignsError || approvalsError) && (
        <QueryError
          message="Failed to load dashboard data"
          onRetry={() => {
            if (campaignsError) refetchCampaigns();
            if (approvalsError) refetchApprovals();
          }}
        />
      )}

      {/* Campaign Control Panel */}
      <CampaignControlPanel
        campaigns={campaigns}
        candidates={candidates}
        approvals={approvals}
      />

      {/* Pending Approvals */}
      <ApprovalList approvals={approvals} />
    </div>
  );
}
