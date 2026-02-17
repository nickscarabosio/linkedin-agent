"use client";

import { useQuery } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { Campaign } from "@/lib/types";

const statusVariant: Record<string, "success" | "warning" | "default"> = {
  active: "success",
  paused: "warning",
  completed: "default",
};

export default function CampaignsPage() {
  const api = getApiClient();

  const { data: campaigns, isLoading } = useQuery<Campaign[]>({
    queryKey: ["campaigns"],
    queryFn: () => api.get("/api/campaigns").then((r) => r.data),
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Campaigns</h1>
        <Link href="/campaigns/new">
          <Button>+ New Campaign</Button>
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-center text-gray-500">Loading...</div>
        ) : !campaigns || campaigns.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            <p>No campaigns yet.</p>
            <p className="text-sm mt-2">Create a new campaign to get started.</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {campaigns.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <Link href={`/campaigns/${c.id}`} className="text-blue-600 hover:underline font-medium">
                      {c.title}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{c.role_title}</td>
                  <td className="px-6 py-4">
                    <Badge variant={statusVariant[c.status] ?? "default"}>{c.status}</Badge>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{c.priority}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
