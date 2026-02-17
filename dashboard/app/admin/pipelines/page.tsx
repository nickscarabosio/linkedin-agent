"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PipelineStageEditor, type StageInput } from "@/components/admin/pipeline-stage-editor";
import type { Pipeline } from "@/lib/types";

type Mode = "list" | "create" | "edit";

const DEFAULT_STAGES: StageInput[] = [
  { name: "Send Connection Request", action_type: "connection_request", delay_days: 0, requires_approval: true, template_id: null },
  { name: "Wait for Acceptance", action_type: "wait", delay_days: 3, requires_approval: false, template_id: null },
  { name: "Send Introduction Message", action_type: "message", delay_days: 1, requires_approval: true, template_id: null },
  { name: "Follow Up", action_type: "follow_up", delay_days: 5, requires_approval: true, template_id: null },
  { name: "Internal Reminder", action_type: "reminder", delay_days: 7, requires_approval: false, template_id: null },
];

export default function AdminPipelinesPage() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const api = getApiClient();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<Mode>("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [stages, setStages] = useState<StageInput[]>(DEFAULT_STAGES);
  const [error, setError] = useState("");

  if (!isAdmin) {
    router.push("/");
    return null;
  }

  const { data: pipelines, isLoading } = useQuery<Pipeline[]>({
    queryKey: ["pipelines"],
    queryFn: () => api.get("/api/pipelines").then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description: string; is_default: boolean; stages: StageInput[] }) =>
      api.post("/api/admin/pipelines", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipelines"] });
      resetForm();
    },
    onError: (err: any) => setError(err.response?.data?.error || "Failed to create pipeline"),
  });

  const updateStagesMutation = useMutation({
    mutationFn: ({ id, stages }: { id: string; stages: StageInput[] }) =>
      api.put(`/api/admin/pipelines/${id}/stages`, { stages }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipelines"] });
      resetForm();
    },
    onError: (err: any) => setError(err.response?.data?.error || "Failed to update stages"),
  });

  const updateMetaMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, any> }) =>
      api.patch(`/api/admin/pipelines/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pipelines"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/pipelines/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pipelines"] }),
    onError: (err: any) => setError(err.response?.data?.error || "Failed to delete pipeline"),
  });

  const resetForm = () => {
    setMode("list");
    setEditingId(null);
    setName("");
    setDescription("");
    setIsDefault(false);
    setStages(DEFAULT_STAGES);
    setError("");
  };

  const startEdit = (pipeline: Pipeline) => {
    setMode("edit");
    setEditingId(pipeline.id);
    setName(pipeline.name);
    setDescription(pipeline.description || "");
    setIsDefault(pipeline.is_default);
    setStages(
      (pipeline.stages || []).map((s) => ({
        name: s.name,
        action_type: s.action_type,
        delay_days: s.delay_days,
        requires_approval: s.requires_approval,
        template_id: s.template_id,
      }))
    );
    setError("");
  };

  const handleCreate = () => {
    if (!name.trim()) { setError("Name is required"); return; }
    if (stages.length === 0) { setError("At least one stage is required"); return; }
    if (stages.some((s) => !s.name.trim())) { setError("All stages must have a name"); return; }
    createMutation.mutate({ name, description, is_default: isDefault, stages });
  };

  const handleSaveEdit = () => {
    if (!editingId) return;
    if (stages.length === 0) { setError("At least one stage is required"); return; }
    if (stages.some((s) => !s.name.trim())) { setError("All stages must have a name"); return; }

    // Update metadata and stages
    updateMetaMutation.mutate({ id: editingId, data: { name, description, is_default: isDefault } });
    updateStagesMutation.mutate({ id: editingId, stages });
  };

  const isSaving = createMutation.isPending || updateStagesMutation.isPending;

  if (isLoading) return <div className="text-gray-500">Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Pipelines</h1>
        {mode === "list" && (
          <Button onClick={() => { setMode("create"); setError(""); }}>
            New Pipeline
          </Button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
          {error}
        </div>
      )}

      {mode === "list" && (
        <div className="space-y-4">
          {(pipelines || []).map((pipeline) => (
            <div key={pipeline.id} className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{pipeline.name}</h3>
                    {pipeline.is_default && <Badge variant="success">Default</Badge>}
                  </div>
                  {pipeline.description && (
                    <p className="text-sm text-gray-500 mt-1">{pipeline.description}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => startEdit(pipeline)}>
                    Edit
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      if (confirm(`Delete "${pipeline.name}"?`)) deleteMutation.mutate(pipeline.id);
                    }}
                    disabled={deleteMutation.isPending}
                  >
                    Delete
                  </Button>
                </div>
              </div>
              {pipeline.stages && pipeline.stages.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {pipeline.stages.map((stage, idx) => (
                    <div key={stage.id} className="flex items-center gap-1 text-xs">
                      <span className="bg-gray-100 px-2 py-1 rounded text-gray-700">
                        {idx + 1}. {stage.name}
                      </span>
                      {idx < pipeline.stages!.length - 1 && (
                        <span className="text-gray-300">&rarr;</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {(pipelines || []).length === 0 && (
            <p className="text-sm text-gray-500">No pipelines yet. Create one to get started.</p>
          )}
        </div>
      )}

      {(mode === "create" || mode === "edit") && (
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {mode === "create" ? "Create Pipeline" : "Edit Pipeline"}
          </h2>

          <div>
            <label className="block text-sm font-medium text-gray-700">Name</label>
            <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <Textarea
              className="mt-1"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="rounded border-gray-300"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
            />
            <span className="text-sm text-gray-700">Set as default pipeline</span>
          </label>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Stages</label>
            <PipelineStageEditor stages={stages} onChange={setStages} />
          </div>

          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <Button onClick={mode === "create" ? handleCreate : handleSaveEdit} disabled={isSaving}>
              {isSaving ? "Saving..." : mode === "create" ? "Create Pipeline" : "Save Changes"}
            </Button>
            <Button variant="outline" onClick={resetForm} disabled={isSaving}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
