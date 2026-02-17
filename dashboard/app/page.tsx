"use client";

import { useQuery } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { Campaign, Candidate, Approval, AdminStats } from "@/lib/types";
import { ClickableStatCard } from "@/components/dashboard/clickable-stat-card";
import { CampaignControlPanel } from "@/components/dashboard/campaign-control-panel";
import { ApprovalList } from "@/components/dashboard/approval-card";

export default function DashboardPage() {
  const { isAdmin } = useAuth();
  const api = getApiClient();

  const { data: campaigns = [] } = useQuery<Campaign[]>({
    queryKey: ["campaigns"],
    queryFn: () => api.get("/api/campaigns").then((r) => r.data),
  });

  const { data: activeCampaigns } = useQuery<Campaign[]>({
    queryKey: ["campaigns-active"],
    queryFn: () => api.get("/api/campaigns/active").then((r) => r.data),
  });

  const { data: approvals = [] } = useQuery<Approval[]>({
    queryKey: ["approvals-pending"],
    queryFn: () => api.get("/api/approvals", { params: { status: "pending" } }).then((r) => r.data),
  });

  const { data: candidates = [] } = useQuery<Candidate[]>({
    queryKey: ["candidates"],
    queryFn: () => api.get("/api/candidates").then((r) => r.data),
  });

  const { data: stats } = useQuery<AdminStats>({
    queryKey: ["admin-stats"],
    queryFn: () => api.get("/api/admin/stats").then((r) => r.data),
    enabled: isAdmin,
  });

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>

      {/* Stat Cards */}
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
          href="/approvals"
        />
        <ClickableStatCard
          label="Actions Today"
          value={stats?.today_actions ?? "--"}
          color="purple"
          href={isAdmin ? "/admin/audit-log" : "/approvals"}
        />
      </div>

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
