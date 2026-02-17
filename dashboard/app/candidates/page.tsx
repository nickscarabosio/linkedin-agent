"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api";

export default function CandidatesPage() {
  const api = getApiClient();
  const [statusFilter, setStatusFilter] = useState("");

  const { data: candidates, isLoading } = useQuery({
    queryKey: ["candidates", { status: statusFilter }],
    queryFn: () => api.get("/api/candidates", { params: statusFilter ? { status: statusFilter } : {} }).then((r) => r.data),
  });

  const statuses = ["", "new", "contacted", "responded", "rejected"];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Candidates</h1>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="">All statuses</option>
          {statuses.filter(Boolean).map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-center text-gray-500">Loading...</div>
        ) : !candidates || candidates.length === 0 ? (
          <div className="p-6 text-center text-gray-500">No candidates found.</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Campaign</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {candidates.map((c: any) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium">
                      {c.name}
                    </a>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{c.title}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{c.company}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{c.campaign_title || `#${c.campaign_id}`}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 capitalize">
                      {c.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
