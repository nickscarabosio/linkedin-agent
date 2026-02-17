"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getApiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const campaignSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  role_title: z.string().min(1, "Role title is required").max(200),
  role_description: z.string().min(1, "Role description is required"),
  ideal_candidate_profile: z.string().optional(),
  linkedin_search_url: z.string().optional(),
  priority: z.string().optional(),
});

type CampaignInput = z.infer<typeof campaignSchema>;

export default function NewCampaignPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CampaignInput>({
    resolver: zodResolver(campaignSchema),
    defaultValues: { priority: "1" },
  });

  const onSubmit = async (data: CampaignInput) => {
    setError("");
    try {
      const api = getApiClient();
      await api.post("/api/campaigns", {
        title: data.title,
        role_title: data.role_title,
        role_description: data.role_description,
        ideal_candidate_profile: data.ideal_candidate_profile || null,
        linkedin_search_url: data.linkedin_search_url || null,
        priority: parseInt(data.priority || "1", 10),
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
          {errors.linkedin_search_url && <p className="mt-1 text-sm text-red-600">{errors.linkedin_search_url.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Priority</label>
          <Input type="number" min={1} max={10} className="mt-1 w-24" {...register("priority")} />
          {errors.priority && <p className="mt-1 text-sm text-red-600">{errors.priority.message}</p>}
        </div>

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
