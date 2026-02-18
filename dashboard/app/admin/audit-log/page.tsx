"use client";

import { useQuery } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/ui/skeleton";
import { QueryError } from "@/components/ui/query-error";
import type { AuditLog } from "@/lib/types";

export default function AuditLogPage() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const api = getApiClient();

  if (!isAdmin) {
    router.push("/");
    return null;
  }

  const { data: logs, isLoading, isError, refetch } = useQuery<AuditLog[]>({
    queryKey: ["audit-log"],
    queryFn: () => api.get("/api/admin/audit-log").then((r) => r.data),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Audit Log</h1>

      {isLoading ? (
        <TableSkeleton rows={8} columns={5} />
      ) : isError ? (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <QueryError onRetry={refetch} />
        </div>
      ) : !logs || logs.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
          No audit log entries.
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Target</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {log.user_name || "System"}
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant="info">{log.action}</Badge>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{log.target || "\u2014"}</td>
                  <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                    {log.details ? JSON.stringify(log.details) : "\u2014"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
