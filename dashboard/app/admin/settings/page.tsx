"use client";

import { useQuery } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import type { Settings } from "@/lib/types";

interface SettingRowProps {
  label: string;
  value: string | number | boolean | undefined;
}

function SettingRow({ label, value }: SettingRowProps) {
  return (
    <div className="flex justify-between">
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd className="text-sm font-medium text-gray-900">{value ?? "\u2014"}</dd>
    </div>
  );
}

export default function AdminSettingsPage() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const api = getApiClient();

  if (!isAdmin) {
    router.push("/");
    return null;
  }

  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ["settings"],
    queryFn: () => api.get("/api/settings").then((r) => r.data),
  });

  if (isLoading) return <div className="text-gray-500">Loading...</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Settings</h1>

      <section className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Rate Limits</h2>
        <dl className="space-y-3">
          <SettingRow label="Daily Connection Requests" value={settings?.daily_connection_requests} />
          <SettingRow label="Daily Messages" value={settings?.daily_messages} />
          <SettingRow label="Weekly Connection Cap" value={settings?.weekly_connection_cap} />
          <SettingRow label="Min Delay (seconds)" value={settings?.min_delay_seconds} />
          <SettingRow label="Max Delay (seconds)" value={settings?.max_delay_seconds} />
        </dl>
      </section>

      <section className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Working Hours</h2>
        <dl className="space-y-3">
          <SettingRow label="Start" value={settings?.working_hours_start} />
          <SettingRow label="End" value={settings?.working_hours_end} />
          <SettingRow label="Timezone" value={settings?.timezone} />
          <SettingRow label="Pause Weekends" value={settings?.pause_weekends ? "Yes" : "No"} />
        </dl>
      </section>

      <section className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">AI Settings</h2>
        <dl className="space-y-3">
          <SettingRow label="Model" value={settings?.model} />
          <SettingRow label="Temperature" value={settings?.temperature} />
          <SettingRow label="Max Tokens" value={settings?.max_tokens} />
        </dl>
      </section>

      <section className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Connection Strategy</h2>
        <dl className="space-y-3">
          <SettingRow label="Wait After Acceptance (hours)" value={settings?.wait_after_acceptance_hours} />
          <SettingRow label="Include Note" value={settings?.include_note_with_request ? "Yes" : "No"} />
          <SettingRow label="Max Follow-ups" value={settings?.max_follow_ups} />
          <SettingRow label="Follow-up Delay (days)" value={settings?.follow_up_delay_days} />
        </dl>
      </section>

      <p className="text-sm text-gray-400">Settings are currently read-only. Edit via database.</p>
    </div>
  );
}
