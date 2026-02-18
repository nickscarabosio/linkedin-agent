"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableSkeleton } from "@/components/ui/skeleton";
import { QueryError } from "@/components/ui/query-error";
import { ConfirmDialog } from "@/components/ui/dialog";
import Link from "next/link";
import { PlayCircle, PauseCircle, Archive, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Campaign } from "@/lib/types";

const statusVariant: Record<string, "success" | "warning" | "default"> = {
  active: "success",
  paused: "warning",
  completed: "default",
};

export default function CampaignsPage() {
  const api = getApiClient();
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null);

  const { data: campaigns, isLoading, isError, refetch } = useQuery<Campaign[]>({
    queryKey: ["campaigns"],
    queryFn: () => api.get("/api/campaigns").then((r) => r.data),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/api/campaigns/${id}`, { status }),
    onSuccess: () => {
      toast.success("Campaign updated");
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["campaigns-active"] });
    },
    onError: (err: unknown) => {
      const apiErr = err as { response?: { data?: { error?: string } } };
      toast.error(apiErr.response?.data?.error || "Something went wrong");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/campaigns/${id}`),
    onSuccess: () => {
      toast.success("Campaign deleted");
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["campaigns-active"] });
    },
    onError: (err: unknown) => {
      const apiErr = err as { response?: { data?: { error?: string } } };
      toast.error(apiErr.response?.data?.error || "Something went wrong");
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Campaigns</h1>
        <Link href="/campaigns/new">
          <Button>+ New Campaign</Button>
        </Link>
      </div>

      {isLoading ? (
        <TableSkeleton rows={5} columns={5} />
      ) : isError ? (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <QueryError onRetry={refetch} />
        </div>
      ) : !campaigns || campaigns.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
          <p>No campaigns yet.</p>
          <p className="text-sm mt-2">Create a new campaign to get started.</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="bg-white rounded-lg shadow overflow-hidden hidden sm:block">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {campaigns.map((c) => {
                  const isToggling = statusMutation.isPending && statusMutation.variables?.id === c.id;
                  const isDeleting = deleteMutation.isPending && deleteMutation.variables === c.id;

                  return (
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
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1">
                          {c.status !== "completed" && (
                            <button
                              onClick={() =>
                                statusMutation.mutate({
                                  id: c.id,
                                  status: c.status === "active" ? "paused" : "active",
                                })
                              }
                              disabled={isToggling}
                              className={cn(
                                "p-1.5 rounded transition-colors",
                                c.status === "active"
                                  ? "text-yellow-600 hover:bg-yellow-50"
                                  : "text-green-600 hover:bg-green-50",
                                isToggling && "opacity-50"
                              )}
                              title={c.status === "active" ? "Pause" : "Resume"}
                            >
                              {c.status === "active" ? (
                                <PauseCircle className="h-4 w-4" />
                              ) : (
                                <PlayCircle className="h-4 w-4" />
                              )}
                            </button>
                          )}

                          {c.status !== "completed" && (
                            <button
                              onClick={() => statusMutation.mutate({ id: c.id, status: "completed" })}
                              disabled={isToggling}
                              className={cn(
                                "p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors",
                                isToggling && "opacity-50"
                              )}
                              title="Archive"
                            >
                              <Archive className="h-4 w-4" />
                            </button>
                          )}

                          {isAdmin && (
                            <button
                              onClick={() => setDeleteTarget(c)}
                              disabled={isDeleting}
                              className={cn(
                                "p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors",
                                isDeleting && "opacity-50"
                              )}
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="sm:hidden space-y-3">
            {campaigns.map((c) => {
              const isToggling = statusMutation.isPending && statusMutation.variables?.id === c.id;

              return (
                <div key={c.id} className="bg-white rounded-lg shadow p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/campaigns/${c.id}`} className="text-blue-600 hover:underline font-medium">
                      {c.title}
                    </Link>
                    <Badge variant={statusVariant[c.status] ?? "default"}>{c.status}</Badge>
                  </div>
                  <p className="text-sm text-gray-500">{c.role_title}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Priority: {c.priority}</span>
                    <div className="flex items-center gap-1">
                      {c.status !== "completed" && (
                        <button
                          onClick={() =>
                            statusMutation.mutate({
                              id: c.id,
                              status: c.status === "active" ? "paused" : "active",
                            })
                          }
                          disabled={isToggling}
                          className={cn(
                            "p-1.5 rounded transition-colors",
                            c.status === "active"
                              ? "text-yellow-600 hover:bg-yellow-50"
                              : "text-green-600 hover:bg-green-50",
                            isToggling && "opacity-50"
                          )}
                        >
                          {c.status === "active" ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          onClick={() => setDeleteTarget(c)}
                          className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Delete Campaign"
        description={`Are you sure you want to delete "${deleteTarget?.title}"? This cannot be undone.`}
        confirmLabel="Delete Campaign"
        variant="destructive"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
