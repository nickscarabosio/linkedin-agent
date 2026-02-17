"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";

const addCandidateSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  title: z.string().max(255).optional(),
  company: z.string().max(255).optional(),
  location: z.string().max(255).optional(),
  linkedin_url: z
    .string()
    .min(1, "LinkedIn URL is required")
    .url("Must be a valid URL")
    .refine((url) => url.includes("linkedin.com"), "Must be a LinkedIn URL"),
});

type AddCandidateInput = z.infer<typeof addCandidateSchema>;

interface AddCandidateFormProps {
  campaignId: string;
  onClose: () => void;
}

export function AddCandidateForm({ campaignId, onClose }: AddCandidateFormProps) {
  const queryClient = useQueryClient();
  const api = getApiClient();
  const [warning, setWarning] = useState("");

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AddCandidateInput>({
    resolver: zodResolver(addCandidateSchema),
  });

  const mutation = useMutation({
    mutationFn: (data: AddCandidateInput) =>
      api.post("/api/candidates", {
        campaign_id: campaignId,
        name: data.name,
        title: data.title || null,
        company: data.company || null,
        location: data.location || null,
        linkedin_url: data.linkedin_url,
      }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["candidates", { campaign_id: campaignId }] });
      if (response.data.already_exists) {
        setWarning("Candidate already exists in the system.");
      } else {
        setWarning("");
        reset();
        onClose();
      }
    },
  });

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="font-semibold text-gray-900 mb-4">Add Candidate</h3>
      <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="space-y-3">
        {warning && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-3 py-2 rounded text-sm">
            {warning}
          </div>
        )}
        {mutation.isError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
            Failed to add candidate
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700">Name *</label>
            <Input className="mt-1" {...register("name")} />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">LinkedIn URL *</label>
            <Input className="mt-1" placeholder="https://linkedin.com/in/..." {...register("linkedin_url")} />
            {errors.linkedin_url && <p className="mt-1 text-xs text-red-600">{errors.linkedin_url.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Title</label>
            <Input className="mt-1" {...register("title")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Company</label>
            <Input className="mt-1" {...register("company")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Location</label>
            <Input className="mt-1" {...register("location")} />
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <Button type="submit" size="sm" disabled={mutation.isPending}>
            {mutation.isPending ? "Adding..." : "Add Candidate"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
