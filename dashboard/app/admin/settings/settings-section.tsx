"use client";

import { ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface SettingsSectionProps {
  title: string;
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  isSaving: boolean;
  viewContent: ReactNode;
  editContent: ReactNode;
}

export function SettingsSection({
  title,
  isEditing,
  onEdit,
  onCancel,
  onSave,
  isSaving,
  viewContent,
  editContent,
}: SettingsSectionProps) {
  return (
    <section className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {!isEditing && (
          <Button variant="outline" size="sm" onClick={onEdit}>
            Edit
          </Button>
        )}
      </div>
      {isEditing ? (
        <div>
          {editContent}
          <div className="flex gap-3 mt-4 pt-4 border-t border-gray-200">
            <Button size="sm" onClick={onSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save"}
            </Button>
            <Button variant="outline" size="sm" onClick={onCancel} disabled={isSaving}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        viewContent
      )}
    </section>
  );
}
