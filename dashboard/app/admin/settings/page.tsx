"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { getApiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SettingsSection } from "./settings-section";
import type { Settings } from "@/lib/types";
import {
  rateLimitsSchema,
  workingHoursSchema,
  aiSettingsSchema,
  connectionStrategySchema,
  type RateLimitsForm,
  type WorkingHoursForm,
  type AISettingsForm,
  type ConnectionStrategyForm,
} from "@/lib/settings-schemas";

interface SettingRowProps {
  label: string;
  value: string | number | boolean | undefined;
}

function SettingRow({ label, value }: SettingRowProps) {
  const display = typeof value === "boolean" ? (value ? "Yes" : "No") : (value ?? "\u2014");
  return (
    <div className="flex justify-between">
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd className="text-sm font-medium text-gray-900">{display}</dd>
    </div>
  );
}

type SectionKey = "rateLimits" | "workingHours" | "aiSettings" | "connectionStrategy";

export default function AdminSettingsPage() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const api = getApiClient();
  const queryClient = useQueryClient();
  const [editingSection, setEditingSection] = useState<SectionKey | null>(null);
  const [saveError, setSaveError] = useState("");

  if (!isAdmin) {
    router.push("/");
    return null;
  }

  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ["settings"],
    queryFn: () => api.get("/api/settings").then((r) => r.data),
  });

  const mutation = useMutation({
    mutationFn: (data: Partial<Settings>) =>
      api.put("/api/admin/settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setEditingSection(null);
      setSaveError("");
    },
    onError: (err: any) => {
      setSaveError(err.response?.data?.error || "Failed to save settings");
    },
  });

  if (isLoading) return <div className="text-gray-500">Loading...</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Settings</h1>

      {saveError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
          {saveError}
        </div>
      )}

      <RateLimitsSection
        settings={settings}
        isEditing={editingSection === "rateLimits"}
        onEdit={() => { setEditingSection("rateLimits"); setSaveError(""); }}
        onCancel={() => setEditingSection(null)}
        onSave={(data) => mutation.mutate(data)}
        isSaving={mutation.isPending}
      />

      <WorkingHoursSection
        settings={settings}
        isEditing={editingSection === "workingHours"}
        onEdit={() => { setEditingSection("workingHours"); setSaveError(""); }}
        onCancel={() => setEditingSection(null)}
        onSave={(data) => mutation.mutate(data)}
        isSaving={mutation.isPending}
      />

      <AISettingsSection
        settings={settings}
        isEditing={editingSection === "aiSettings"}
        onEdit={() => { setEditingSection("aiSettings"); setSaveError(""); }}
        onCancel={() => setEditingSection(null)}
        onSave={(data) => mutation.mutate(data)}
        isSaving={mutation.isPending}
      />

      <ConnectionStrategySection
        settings={settings}
        isEditing={editingSection === "connectionStrategy"}
        onEdit={() => { setEditingSection("connectionStrategy"); setSaveError(""); }}
        onCancel={() => setEditingSection(null)}
        onSave={(data) => mutation.mutate(data)}
        isSaving={mutation.isPending}
      />
    </div>
  );
}

// --- Rate Limits Section ---

function RateLimitsSection({
  settings,
  isEditing,
  onEdit,
  onCancel,
  onSave,
  isSaving,
}: {
  settings: Settings | undefined;
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (data: RateLimitsForm) => void;
  isSaving: boolean;
}) {
  const { register, handleSubmit, formState: { errors } } = useForm<RateLimitsForm>({
    resolver: zodResolver(rateLimitsSchema),
    values: settings ? {
      daily_connection_requests: settings.daily_connection_requests,
      daily_messages: settings.daily_messages,
      weekly_connection_cap: settings.weekly_connection_cap,
      min_delay_seconds: settings.min_delay_seconds,
      max_delay_seconds: settings.max_delay_seconds,
    } : undefined,
  });

  return (
    <SettingsSection
      title="Rate Limits"
      isEditing={isEditing}
      onEdit={onEdit}
      onCancel={onCancel}
      onSave={handleSubmit(onSave)}
      isSaving={isSaving}
      viewContent={
        <dl className="space-y-3">
          <SettingRow label="Daily Connection Requests" value={settings?.daily_connection_requests} />
          <SettingRow label="Daily Messages" value={settings?.daily_messages} />
          <SettingRow label="Weekly Connection Cap" value={settings?.weekly_connection_cap} />
          <SettingRow label="Min Delay (seconds)" value={settings?.min_delay_seconds} />
          <SettingRow label="Max Delay (seconds)" value={settings?.max_delay_seconds} />
        </dl>
      }
      editContent={
        <div className="space-y-3">
          <FormField label="Daily Connection Requests" error={errors.daily_connection_requests?.message}>
            <Input type="number" {...register("daily_connection_requests", { valueAsNumber: true })} />
          </FormField>
          <FormField label="Daily Messages" error={errors.daily_messages?.message}>
            <Input type="number" {...register("daily_messages", { valueAsNumber: true })} />
          </FormField>
          <FormField label="Weekly Connection Cap" error={errors.weekly_connection_cap?.message}>
            <Input type="number" {...register("weekly_connection_cap", { valueAsNumber: true })} />
          </FormField>
          <FormField label="Min Delay (seconds)" error={errors.min_delay_seconds?.message}>
            <Input type="number" {...register("min_delay_seconds", { valueAsNumber: true })} />
          </FormField>
          <FormField label="Max Delay (seconds)" error={errors.max_delay_seconds?.message}>
            <Input type="number" {...register("max_delay_seconds", { valueAsNumber: true })} />
          </FormField>
        </div>
      }
    />
  );
}

// --- Working Hours Section ---

function WorkingHoursSection({
  settings,
  isEditing,
  onEdit,
  onCancel,
  onSave,
  isSaving,
}: {
  settings: Settings | undefined;
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (data: WorkingHoursForm) => void;
  isSaving: boolean;
}) {
  const { register, handleSubmit, formState: { errors }, watch, setValue } = useForm<WorkingHoursForm>({
    resolver: zodResolver(workingHoursSchema),
    values: settings ? {
      working_hours_start: settings.working_hours_start,
      working_hours_end: settings.working_hours_end,
      timezone: settings.timezone,
      pause_weekends: settings.pause_weekends,
    } : undefined,
  });

  return (
    <SettingsSection
      title="Working Hours"
      isEditing={isEditing}
      onEdit={onEdit}
      onCancel={onCancel}
      onSave={handleSubmit(onSave)}
      isSaving={isSaving}
      viewContent={
        <dl className="space-y-3">
          <SettingRow label="Start" value={settings?.working_hours_start} />
          <SettingRow label="End" value={settings?.working_hours_end} />
          <SettingRow label="Timezone" value={settings?.timezone} />
          <SettingRow label="Pause Weekends" value={settings?.pause_weekends} />
        </dl>
      }
      editContent={
        <div className="space-y-3">
          <FormField label="Start" error={errors.working_hours_start?.message}>
            <Input type="time" {...register("working_hours_start")} />
          </FormField>
          <FormField label="End" error={errors.working_hours_end?.message}>
            <Input type="time" {...register("working_hours_end")} />
          </FormField>
          <FormField label="Timezone" error={errors.timezone?.message}>
            <Select {...register("timezone")}>
              <option value="America/New_York">America/New_York</option>
              <option value="America/Chicago">America/Chicago</option>
              <option value="America/Denver">America/Denver</option>
              <option value="America/Los_Angeles">America/Los_Angeles</option>
              <option value="UTC">UTC</option>
            </Select>
          </FormField>
          <FormField label="Pause Weekends">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="rounded border-gray-300"
                checked={watch("pause_weekends")}
                onChange={(e) => setValue("pause_weekends", e.target.checked)}
              />
              <span className="text-sm text-gray-700">Pause on weekends</span>
            </label>
          </FormField>
        </div>
      }
    />
  );
}

// --- AI Settings Section ---

function AISettingsSection({
  settings,
  isEditing,
  onEdit,
  onCancel,
  onSave,
  isSaving,
}: {
  settings: Settings | undefined;
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (data: AISettingsForm) => void;
  isSaving: boolean;
}) {
  const { register, handleSubmit, formState: { errors } } = useForm<AISettingsForm>({
    resolver: zodResolver(aiSettingsSchema),
    values: settings ? {
      model: settings.model,
      temperature: settings.temperature,
      max_tokens: settings.max_tokens,
    } : undefined,
  });

  return (
    <SettingsSection
      title="AI Settings"
      isEditing={isEditing}
      onEdit={onEdit}
      onCancel={onCancel}
      onSave={handleSubmit(onSave)}
      isSaving={isSaving}
      viewContent={
        <dl className="space-y-3">
          <SettingRow label="Model" value={settings?.model} />
          <SettingRow label="Temperature" value={settings?.temperature} />
          <SettingRow label="Max Tokens" value={settings?.max_tokens} />
        </dl>
      }
      editContent={
        <div className="space-y-3">
          <FormField label="Model" error={errors.model?.message}>
            <Select {...register("model")}>
              <option value="claude-sonnet-4-5-20250929">Claude Sonnet 4.5</option>
              <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5</option>
              <option value="gpt-4o">GPT-4o</option>
              <option value="gpt-4o-mini">GPT-4o Mini</option>
            </Select>
          </FormField>
          <FormField label="Temperature" error={errors.temperature?.message}>
            <Input type="number" step="0.1" {...register("temperature", { valueAsNumber: true })} />
          </FormField>
          <FormField label="Max Tokens" error={errors.max_tokens?.message}>
            <Input type="number" {...register("max_tokens", { valueAsNumber: true })} />
          </FormField>
        </div>
      }
    />
  );
}

// --- Connection Strategy Section ---

function ConnectionStrategySection({
  settings,
  isEditing,
  onEdit,
  onCancel,
  onSave,
  isSaving,
}: {
  settings: Settings | undefined;
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (data: ConnectionStrategyForm) => void;
  isSaving: boolean;
}) {
  const { register, handleSubmit, formState: { errors }, watch, setValue } = useForm<ConnectionStrategyForm>({
    resolver: zodResolver(connectionStrategySchema),
    values: settings ? {
      wait_after_acceptance_hours: settings.wait_after_acceptance_hours,
      include_note_with_request: settings.include_note_with_request,
      max_follow_ups: settings.max_follow_ups,
      follow_up_delay_days: settings.follow_up_delay_days,
    } : undefined,
  });

  return (
    <SettingsSection
      title="Connection Strategy"
      isEditing={isEditing}
      onEdit={onEdit}
      onCancel={onCancel}
      onSave={handleSubmit(onSave)}
      isSaving={isSaving}
      viewContent={
        <dl className="space-y-3">
          <SettingRow label="Wait After Acceptance (hours)" value={settings?.wait_after_acceptance_hours} />
          <SettingRow label="Include Note" value={settings?.include_note_with_request} />
          <SettingRow label="Max Follow-ups" value={settings?.max_follow_ups} />
          <SettingRow label="Follow-up Delay (days)" value={settings?.follow_up_delay_days} />
        </dl>
      }
      editContent={
        <div className="space-y-3">
          <FormField label="Wait After Acceptance (hours)" error={errors.wait_after_acceptance_hours?.message}>
            <Input type="number" {...register("wait_after_acceptance_hours", { valueAsNumber: true })} />
          </FormField>
          <FormField label="Include Note">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="rounded border-gray-300"
                checked={watch("include_note_with_request")}
                onChange={(e) => setValue("include_note_with_request", e.target.checked)}
              />
              <span className="text-sm text-gray-700">Include note with connection request</span>
            </label>
          </FormField>
          <FormField label="Max Follow-ups" error={errors.max_follow_ups?.message}>
            <Input type="number" {...register("max_follow_ups", { valueAsNumber: true })} />
          </FormField>
          <FormField label="Follow-up Delay (days)" error={errors.follow_up_delay_days?.message}>
            <Input type="number" {...register("follow_up_delay_days", { valueAsNumber: true })} />
          </FormField>
        </div>
      }
    />
  );
}

// --- Shared form field wrapper ---

function FormField({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
