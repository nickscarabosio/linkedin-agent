"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export interface StageInput {
  name: string;
  action_type: "connection_request" | "message" | "follow_up" | "wait" | "reminder" | "inmail" | "profile_view" | "withdraw";
  delay_days: number;
  requires_approval: boolean;
  template_id: string | null;
}

interface PipelineStageEditorProps {
  stages: StageInput[];
  onChange: (stages: StageInput[]) => void;
}

const ACTION_TYPES = [
  { value: "connection_request", label: "Connection Request" },
  { value: "message", label: "Message" },
  { value: "follow_up", label: "Follow-Up" },
  { value: "wait", label: "Wait" },
  { value: "reminder", label: "Reminder" },
  { value: "inmail", label: "InMail" },
  { value: "profile_view", label: "Profile View" },
  { value: "withdraw", label: "Withdraw Request" },
] as const;

export function PipelineStageEditor({ stages, onChange }: PipelineStageEditorProps) {
  const updateStage = (index: number, field: keyof StageInput, value: any) => {
    const updated = [...stages];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const addStage = () => {
    onChange([
      ...stages,
      { name: "", action_type: "message", delay_days: 0, requires_approval: true, template_id: null },
    ]);
  };

  const removeStage = (index: number) => {
    onChange(stages.filter((_, i) => i !== index));
  };

  const moveStage = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= stages.length) return;
    const updated = [...stages];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      {stages.map((stage, idx) => (
        <div key={idx} className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg bg-gray-50">
          <div className="flex flex-col items-center gap-1 pt-1">
            <span className="text-xs font-medium text-gray-400">{idx + 1}</span>
            <button
              type="button"
              onClick={() => moveStage(idx, -1)}
              disabled={idx === 0}
              className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs"
            >
              &#9650;
            </button>
            <button
              type="button"
              onClick={() => moveStage(idx, 1)}
              disabled={idx === stages.length - 1}
              className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs"
            >
              &#9660;
            </button>
          </div>
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Stage Name</label>
              <Input
                value={stage.name}
                onChange={(e) => updateStage(idx, "name", e.target.value)}
                placeholder="e.g. Send Connection Request"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Action Type</label>
              <Select
                value={stage.action_type}
                onChange={(e) => updateStage(idx, "action_type", e.target.value)}
              >
                {ACTION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Delay (days)</label>
              <Input
                type="number"
                min={0}
                value={stage.delay_days}
                onChange={(e) => updateStage(idx, "delay_days", parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 pb-2">
                <input
                  type="checkbox"
                  className="rounded border-gray-300"
                  checked={stage.requires_approval}
                  onChange={(e) => updateStage(idx, "requires_approval", e.target.checked)}
                />
                <span className="text-sm text-gray-700">Requires Approval</span>
              </label>
            </div>
          </div>
          <button
            type="button"
            onClick={() => removeStage(idx)}
            className="text-red-400 hover:text-red-600 text-sm pt-5"
          >
            Remove
          </button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addStage}>
        + Add Stage
      </Button>
    </div>
  );
}
