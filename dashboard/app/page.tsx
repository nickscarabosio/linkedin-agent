"use client";

import { useQuery } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function DashboardPage() {
  const { isAdmin } = useAuth();
  const api = getApiClient();

  const { data: campaigns } = useQuery({
    queryKey: ["campaigns-active"],
    queryFn: () => api.get("/api/campaigns/active").then((r) => r.data),
  });

  const { data: approvals } = useQuery({
    queryKey: ["approvals-pending"],
    queryFn: () => api.get("/api/approvals", { params: { status: "pending" } }).then((r) => r.data),
  });

  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => api.get("/api/admin/stats").then((r) => r.data),
    enabled: isAdmin,
  });

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          label="Active Campaigns"
          value={campaigns?.length ?? stats?.active_campaigns ?? "--"}
          color="blue"
        />
        <StatCard
          label="Total Candidates"
          value={stats?.total_candidates ?? "--"}
          color="green"
        />
        <StatCard
          label="Pending Approvals"
          value={approvals?.length ?? stats?.pending_approvals ?? "--"}
          color="yellow"
        />
        <StatCard
          label="Actions Today"
          value={stats?.today_actions ?? "--"}
          color="purple"
        />
      </div>

      {approvals && approvals.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">
              Pending Approvals ({approvals.length})
            </h3>
          </div>
          <div className="divide-y divide-gray-200">
            {approvals.slice(0, 5).map((a: any) => (
              <div key={a.id} className="px-6 py-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-gray-900">{a.candidate_name}</p>
                    <p className="text-sm text-gray-500">
                      {[a.candidate_title, a.candidate_company].filter(Boolean).join(" @ ")}
                    </p>
                  </div>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                    {a.approval_type}
                  </span>
                </div>
                <p className="mt-2 text-sm text-gray-600 line-clamp-2">
                  &ldquo;{a.proposed_text}&rdquo;
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: any; color: string }) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    yellow: "bg-yellow-50 text-yellow-600",
    purple: "bg-purple-50 text-purple-600",
  };

  return (
    <div className={`rounded-lg p-4 ${colorMap[color] || "bg-gray-50 text-gray-600"}`}>
      <p className="text-sm font-medium opacity-80">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  );
}
