"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TagInput } from "@/components/ui/tag-input";
import type { JobSpec } from "@/lib/types";

interface JobSpecEditorProps {
  value: JobSpec;
  onChange: (spec: JobSpec) => void;
}

const GROWTH_STAGES = ["Startup", "Early Stage", "Growth", "Scale-up", "Enterprise", "Public"];

export function JobSpecEditor({ value, onChange }: JobSpecEditorProps) {
  const [expanded, setExpanded] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const update = (partial: Partial<JobSpec>) => {
    onChange({ ...value, ...partial });
  };

  const hasContent = !!(
    value.function ||
    value.role_level ||
    value.industry_targets?.length ||
    value.required_skills?.length ||
    value.client_description_external
  );

  return (
    <div className="border border-gray-200 rounded-lg">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
          <span className="font-medium text-gray-900">Job Specification</span>
          {hasContent && (
            <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">configured</span>
          )}
        </div>
        <span className="text-xs text-gray-400">Scoring rubric for candidate evaluation</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-200 pt-4">
          {/* Core fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Function</label>
              <Input
                className="mt-1"
                placeholder="e.g. Sales, Engineering, Marketing"
                value={value.function || ""}
                onChange={(e) => update({ function: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Role Level</label>
              <Input
                className="mt-1"
                placeholder="e.g. VP, Director, Manager"
                value={value.role_level || ""}
                onChange={(e) => update({ role_level: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Client Description (external-facing)</label>
            <Textarea
              rows={2}
              className="mt-1"
              placeholder="e.g. a fast-growing B2B SaaS company in the fintech space"
              value={value.client_description_external || ""}
              onChange={(e) => update({ client_description_external: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Role One-Liner</label>
            <Input
              className="mt-1"
              placeholder="e.g. VP Sales to build and lead a 10-person SDR/AE team"
              value={value.role_one_liner || ""}
              onChange={(e) => update({ role_one_liner: e.target.value })}
            />
          </div>

          {/* Industry */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Target Industries</label>
            <TagInput
              className="mt-1"
              value={value.industry_targets || []}
              onChange={(tags) => update({ industry_targets: tags })}
              placeholder="e.g. SaaS, FinTech, HealthTech"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Adjacent Industries (also acceptable)</label>
            <TagInput
              className="mt-1"
              value={value.industry_adjacent_ok || []}
              onChange={(tags) => update({ industry_adjacent_ok: tags })}
              placeholder="e.g. EdTech, MarTech"
            />
          </div>

          {/* Company size + growth stage */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Company Size (employees)</label>
              <div className="mt-1 flex items-center gap-2">
                <Input
                  type="number"
                  placeholder="Min"
                  value={value.company_size_min ?? ""}
                  onChange={(e) => update({ company_size_min: e.target.value ? Number(e.target.value) : undefined })}
                />
                <span className="text-gray-400">-</span>
                <Input
                  type="number"
                  placeholder="Max"
                  value={value.company_size_max ?? ""}
                  onChange={(e) => update({ company_size_max: e.target.value ? Number(e.target.value) : undefined })}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Growth Stage</label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {GROWTH_STAGES.map((stage) => {
                  const selected = value.growth_stage?.includes(stage);
                  return (
                    <button
                      key={stage}
                      type="button"
                      onClick={() => {
                        const current = value.growth_stage || [];
                        update({
                          growth_stage: selected
                            ? current.filter((s) => s !== stage)
                            : [...current, stage],
                        });
                      }}
                      className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                        selected
                          ? "bg-blue-50 border-blue-300 text-blue-700"
                          : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      {stage}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Location + remote */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Location</label>
              <Input
                className="mt-1"
                placeholder="e.g. Denver, CO"
                value={value.location || ""}
                onChange={(e) => update({ location: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Remote Policy</label>
              <select
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={value.remote_policy || ""}
                onChange={(e) => update({ remote_policy: e.target.value || undefined })}
              >
                <option value="">Not specified</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="onsite">Onsite</option>
              </select>
            </div>
          </div>

          {/* Experience */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Min Years Experience</label>
              <Input
                type="number"
                className="mt-1"
                placeholder="e.g. 5"
                value={value.years_experience_min ?? ""}
                onChange={(e) => update({ years_experience_min: e.target.value ? Number(e.target.value) : undefined })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Ideal Years Experience</label>
              <Input
                type="number"
                className="mt-1"
                placeholder="e.g. 8"
                value={value.years_experience_ideal ?? ""}
                onChange={(e) => update({ years_experience_ideal: e.target.value ? Number(e.target.value) : undefined })}
              />
            </div>
          </div>

          {/* Skills */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Required Skills</label>
            <TagInput
              className="mt-1"
              value={value.required_skills || []}
              onChange={(tags) => update({ required_skills: tags })}
              placeholder="e.g. Salesforce, Pipeline Management"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Nice-to-Have Skills</label>
            <TagInput
              className="mt-1"
              value={value.nice_to_have_skills || []}
              onChange={(tags) => update({ nice_to_have_skills: tags })}
              placeholder="e.g. HubSpot, ABM"
            />
          </div>

          {/* Certifications + Education */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Required Certifications</label>
            <TagInput
              className="mt-1"
              value={value.required_certifications || []}
              onChange={(tags) => update({ required_certifications: tags })}
              placeholder="e.g. CPA, PMP"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={value.education_required ?? false}
                onChange={(e) => update({ education_required: e.target.checked })}
                className="rounded border-gray-300 text-blue-600"
              />
              <label className="text-sm text-gray-700">Education Required</label>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Preferred Degree</label>
              <Input
                className="mt-1"
                placeholder="e.g. MBA, BS Computer Science"
                value={value.education_preferred || ""}
                onChange={(e) => update({ education_preferred: e.target.value })}
              />
            </div>
          </div>

          {/* Disqualifiers */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Disqualify Companies</label>
            <TagInput
              className="mt-1"
              value={value.disqualify_companies || []}
              onChange={(tags) => update({ disqualify_companies: tags })}
              placeholder="Companies to exclude"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Disqualify Titles</label>
            <TagInput
              className="mt-1"
              value={value.disqualify_titles || []}
              onChange={(tags) => update({ disqualify_titles: tags })}
              placeholder="Title patterns to exclude"
            />
          </div>

          {/* Advanced: weight overrides */}
          <div className="border-t border-gray-200 pt-3">
            <button
              type="button"
              onClick={() => setAdvancedOpen(!advancedOpen)}
              className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              {advancedOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Advanced: Weight Overrides
            </button>

            {advancedOpen && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-gray-400">Adjust scoring weights (must sum to 100). Defaults: Role Fit 40, Company Context 25, Trajectory 20, Education 10, Profile Quality 5.</p>
                <div className="grid grid-cols-5 gap-2">
                  {[
                    { key: "role_fit", label: "Role Fit", default: 40 },
                    { key: "company_context", label: "Company", default: 25 },
                    { key: "trajectory_stability", label: "Trajectory", default: 20 },
                    { key: "education", label: "Education", default: 10 },
                    { key: "profile_quality", label: "Profile", default: 5 },
                  ].map((w) => (
                    <div key={w.key}>
                      <label className="block text-xs text-gray-500">{w.label}</label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        className="mt-1"
                        placeholder={String(w.default)}
                        value={value.weight_overrides?.[w.key] ?? ""}
                        onChange={(e) => {
                          const overrides = { ...(value.weight_overrides || {}) };
                          if (e.target.value) {
                            overrides[w.key] = Number(e.target.value);
                          } else {
                            delete overrides[w.key];
                          }
                          update({ weight_overrides: Object.keys(overrides).length > 0 ? overrides : undefined });
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Notes</label>
            <Textarea
              rows={2}
              className="mt-1"
              placeholder="Any additional notes for scoring context..."
              value={value.notes || ""}
              onChange={(e) => update({ notes: e.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
