"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import type { ParsedJD, Pipeline, JobSpec } from "@/lib/types";
import { JobSpecEditor } from "@/components/campaigns/job-spec-editor";

const campaignSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  role_title: z.string().min(1, "Role title is required").max(200),
  role_description: z.string().min(1, "Role description is required"),
  ideal_candidate_profile: z.string().optional(),
  linkedin_search_url: z.string().optional(),
  priority: z.string().optional(),
  pipeline_id: z.string().optional(),
});

type CampaignInput = z.infer<typeof campaignSchema>;

export default function NewCampaignPage() {
  const router = useRouter();
  const api = getApiClient();
  const { user } = useAuth();
  const [error, setError] = useState("");
  const [jdParsing, setJdParsing] = useState(false);
  const [jdSuccess, setJdSuccess] = useState(false);
  const [jdError, setJdError] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [assignedUserIds, setAssignedUserIds] = useState<Set<string>>(new Set());
  const [jobSpec, setJobSpec] = useState<JobSpec>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: pipelines } = useQuery<Pipeline[]>({
    queryKey: ["pipelines"],
    queryFn: () => api.get("/api/pipelines").then((r) => r.data),
  });

  const { data: activeUsers } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["users-active"],
    queryFn: () => api.get("/api/users/active").then((r) => r.data),
  });

  useEffect(() => {
    if (user?.id) {
      setAssignedUserIds((prev) => new Set(prev).add(user.id));
    }
  }, [user?.id]);

  const defaultPipeline = pipelines?.find((p) => p.is_default);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CampaignInput>({
    resolver: zodResolver(campaignSchema),
    defaultValues: { priority: "1", pipeline_id: "" },
  });

  const applyParsedJD = (data: ParsedJD) => {
    if (data.title) setValue("title", data.title);
    if (data.role_title) setValue("role_title", data.role_title);
    if (data.role_description) setValue("role_description", data.role_description);
    if (data.ideal_candidate_profile) setValue("ideal_candidate_profile", data.ideal_candidate_profile);
    if (data.linkedin_search_url) setValue("linkedin_search_url", data.linkedin_search_url);
    if (data.job_spec && Object.keys(data.job_spec).length > 0) {
      setJobSpec((prev) => ({ ...prev, ...data.job_spec }));
    }
    setJdSuccess(true);
    setTimeout(() => setJdSuccess(false), 5000);
  };

  const parseJDFile = async (file: File) => {
    setJdParsing(true);
    setJdError("");
    setJdSuccess(false);
    try {
      const api = getApiClient();
      const formData = new FormData();
      formData.append("file", file);
      const { data } = await api.post("/api/ai/parse-jd", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 30000,
      });
      applyParsedJD(data);
    } catch (err: any) {
      setJdError(err.response?.data?.error || "Failed to parse job description");
    } finally {
      setJdParsing(false);
    }
  };

  const parseJDText = async () => {
    if (!pasteText.trim()) return;
    setJdParsing(true);
    setJdError("");
    setJdSuccess(false);
    try {
      const api = getApiClient();
      const { data } = await api.post("/api/ai/parse-jd", { text: pasteText }, { timeout: 30000 });
      applyParsedJD(data);
      setPasteText("");
    } catch (err: any) {
      setJdError(err.response?.data?.error || "Failed to parse job description");
    } finally {
      setJdParsing(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) parseJDFile(file);
  }, []);

  const onSubmit = async (data: CampaignInput) => {
    setError("");
    try {
      await api.post("/api/campaigns", {
        title: data.title,
        role_title: data.role_title,
        role_description: data.role_description,
        ideal_candidate_profile: data.ideal_candidate_profile || null,
        linkedin_search_url: data.linkedin_search_url || null,
        priority: parseInt(data.priority || "1", 10),
        pipeline_id: data.pipeline_id || null,
        assigned_user_ids: Array.from(assignedUserIds),
        job_spec: Object.keys(jobSpec).length > 0 ? jobSpec : undefined,
      });
      router.push("/campaigns");
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { error?: string } } };
      setError(apiErr.response?.data?.error || "Failed to create campaign");
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">New Campaign</h1>

      {/* JD Upload Section */}
      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Auto-Fill from Job Description</h2>
        <p className="text-sm text-gray-500">
          Upload a PDF, DOCX, or TXT file, or paste the JD text below. AI will extract the key fields.
        </p>

        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
            dragActive ? "border-blue-500 bg-blue-50" : "border-gray-300"
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) parseJDFile(f); }}
            className="hidden"
          />
          <p className="text-sm text-gray-500 mb-2">
            {dragActive ? "Drop file here" : "Drag & drop a file here, or"}
          </p>
          {!dragActive && (
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={jdParsing}>
              Choose File
            </Button>
          )}
        </div>

        <div className="relative">
          <Textarea
            rows={3}
            placeholder="Or paste job description text here..."
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            disabled={jdParsing}
          />
          {pasteText.trim() && (
            <Button
              size="sm"
              className="absolute bottom-2 right-2"
              onClick={parseJDText}
              disabled={jdParsing}
            >
              {jdParsing ? "Parsing..." : "Parse Text"}
            </Button>
          )}
        </div>

        {jdParsing && (
          <div className="flex items-center gap-2 text-sm text-blue-600">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            Analyzing job description with AI...
          </div>
        )}
        {jdSuccess && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded text-sm">
            Fields auto-filled successfully. Review and edit below before submitting.
          </div>
        )}
        {jdError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">
            {jdError}
          </div>
        )}
      </div>

      {/* Campaign Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-lg shadow p-6 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700">Campaign Title</label>
          <Input className="mt-1" {...register("title")} />
          {errors.title && <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Role Title</label>
          <Input className="mt-1" {...register("role_title")} />
          {errors.role_title && <p className="mt-1 text-sm text-red-600">{errors.role_title.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Role Description</label>
          <Textarea rows={4} className="mt-1" {...register("role_description")} />
          {errors.role_description && <p className="mt-1 text-sm text-red-600">{errors.role_description.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Ideal Candidate Profile</label>
          <Textarea rows={3} className="mt-1" {...register("ideal_candidate_profile")} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">LinkedIn Search URL</label>
          <Input type="url" className="mt-1" {...register("linkedin_search_url")} />
          <p className="mt-1 text-xs text-gray-400">
            AI-recommended based on the job description. Review and adjust the search URL to refine your candidate results.
          </p>
          {errors.linkedin_search_url && <p className="mt-1 text-sm text-red-600">{errors.linkedin_search_url.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Priority</label>
          <Input type="number" min={1} max={10} className="mt-1 w-24" {...register("priority")} />
          {errors.priority && <p className="mt-1 text-sm text-red-600">{errors.priority.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Pipeline</label>
          <Select className="mt-1" {...register("pipeline_id")}>
            <option value="">
              {defaultPipeline ? `Default (${defaultPipeline.name})` : "None"}
            </option>
            {(pipelines || []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.is_default ? " (Default)" : ""}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-gray-400">Leave empty to use the default pipeline</p>
        </div>

        <JobSpecEditor value={jobSpec} onChange={setJobSpec} />

        {activeUsers && activeUsers.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700">Team Members</label>
            <p className="mt-1 text-xs text-gray-400">Select users who can view and manage this campaign</p>
            <div className="mt-2 space-y-2">
              {activeUsers.map((u) => {
                const isCurrentUser = u.id === user?.id;
                return (
                  <label key={u.id} className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={assignedUserIds.has(u.id)}
                      disabled={isCurrentUser}
                      onChange={(e) => {
                        setAssignedUserIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(u.id);
                          else next.delete(u.id);
                          return next;
                        });
                      }}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    {u.name}{isCurrentUser ? " (you)" : ""}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-4">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating..." : "Create Campaign"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
