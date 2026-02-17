"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  X,
  ExternalLink,
  Briefcase,
  Building2,
  MessageSquare,
  Trash2,
  Bell,
  StickyNote,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { getApiClient } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import type { Approval, CandidateNote } from "@/lib/types";

interface CandidateProfileModalProps {
  approval: Approval;
  onClose: () => void;
}

export function CandidateProfileModal({ approval, onClose }: CandidateProfileModalProps) {
  const api = getApiClient();
  const queryClient = useQueryClient();

  const [noteContent, setNoteContent] = useState("");
  const [reminderContent, setReminderContent] = useState("");
  const [reminderDate, setReminderDate] = useState("");

  const notesQuery = useQuery<CandidateNote[]>({
    queryKey: ["candidate-notes", approval.candidate_id],
    queryFn: () =>
      api.get(`/api/candidates/${approval.candidate_id}/notes`).then((r) => r.data),
  });

  const notes = notesQuery.data ?? [];
  const plainNotes = notes.filter((n) => !n.remind_at);
  const reminders = notes.filter((n) => n.remind_at);

  const createNote = useMutation({
    mutationFn: (body: { content: string; remind_at?: string }) =>
      api.post(`/api/candidates/${approval.candidate_id}/notes`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidate-notes", approval.candidate_id] });
      setNoteContent("");
      setReminderContent("");
      setReminderDate("");
    },
  });

  const toggleReminder = useMutation({
    mutationFn: ({ id, completed_at }: { id: string; completed_at: string | null }) =>
      api.patch(`/api/notes/${id}`, { completed_at }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidate-notes", approval.candidate_id] });
    },
  });

  const deleteNote = useMutation({
    mutationFn: (id: string) => api.delete(`/api/notes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidate-notes", approval.candidate_id] });
    },
  });

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteContent.trim()) return;
    createNote.mutate({ content: noteContent.trim() });
  };

  const handleAddReminder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reminderContent.trim() || !reminderDate) return;
    createNote.mutate({
      content: reminderContent.trim(),
      remind_at: new Date(reminderDate).toISOString(),
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="p-6 space-y-6">
          {/* Header: candidate info */}
          <div className="flex items-start justify-between gap-4 pr-8">
            <div className="space-y-1.5">
              <h2 className="text-xl font-semibold text-gray-900">
                {approval.candidate_name}
              </h2>
              {approval.candidate_title && (
                <div className="flex items-center gap-1.5 text-sm text-gray-600">
                  <Briefcase className="h-3.5 w-3.5 shrink-0" />
                  <span>{approval.candidate_title}</span>
                </div>
              )}
              {approval.candidate_company && (
                <div className="flex items-center gap-1.5 text-sm text-gray-600">
                  <Building2 className="h-3.5 w-3.5 shrink-0" />
                  <span>{approval.candidate_company}</span>
                </div>
              )}
            </div>
            {approval.linkedin_url && (
              <a
                href={approval.linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors shrink-0"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                LinkedIn
              </a>
            )}
          </div>

          {/* Approval context */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="info">{approval.approval_type}</Badge>
              <Badge
                variant={
                  approval.status === "approved"
                    ? "success"
                    : approval.status === "rejected"
                    ? "danger"
                    : "default"
                }
              >
                {approval.status}
              </Badge>
            </div>

            {(approval.reasoning || approval.context) && (
              <div className="text-sm text-gray-600 bg-gray-50 rounded-md p-3">
                <p className="font-medium text-gray-700 mb-1">Why this candidate</p>
                <p>{approval.reasoning || approval.context}</p>
              </div>
            )}

            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <MessageSquare className="h-3.5 w-3.5 text-gray-500" />
                <p className="text-sm font-medium text-gray-700">Proposed message</p>
              </div>
              <div className="bg-gray-50 rounded-md p-3 text-sm text-gray-700 whitespace-pre-wrap">
                {approval.proposed_text}
              </div>
            </div>
          </div>

          {/* Divider */}
          <hr className="border-gray-200" />

          {/* Notes section */}
          <div className="space-y-3">
            <div className="flex items-center gap-1.5">
              <StickyNote className="h-4 w-4 text-gray-500" />
              <h3 className="text-sm font-semibold text-gray-900">Notes</h3>
            </div>

            {plainNotes.length > 0 && (
              <div className="space-y-2">
                {plainNotes.map((note) => (
                  <div
                    key={note.id}
                    className="flex items-start justify-between gap-2 bg-gray-50 rounded-md p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.content}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(note.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteNote.mutate(note.id)}
                      className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-red-500 transition-colors shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleAddNote} className="flex gap-2">
              <Textarea
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Add a note..."
                rows={2}
                className="flex-1"
              />
              <Button
                type="submit"
                size="sm"
                disabled={!noteContent.trim() || createNote.isPending}
                className="self-end"
              >
                Add
              </Button>
            </form>
          </div>

          {/* Divider */}
          <hr className="border-gray-200" />

          {/* Reminders section */}
          <div className="space-y-3">
            <div className="flex items-center gap-1.5">
              <Bell className="h-4 w-4 text-gray-500" />
              <h3 className="text-sm font-semibold text-gray-900">Follow-up Reminders</h3>
            </div>

            {reminders.length > 0 && (
              <div className="space-y-2">
                {reminders.map((reminder) => {
                  const isComplete = !!reminder.completed_at;
                  return (
                    <div
                      key={reminder.id}
                      className={cn(
                        "flex items-start gap-2 rounded-md p-3",
                        isComplete ? "bg-green-50" : "bg-yellow-50"
                      )}
                    >
                      <button
                        onClick={() =>
                          toggleReminder.mutate({
                            id: reminder.id,
                            completed_at: isComplete ? null : new Date().toISOString(),
                          })
                        }
                        className={cn(
                          "mt-0.5 shrink-0 transition-colors",
                          isComplete
                            ? "text-green-500 hover:text-green-700"
                            : "text-gray-400 hover:text-green-500"
                        )}
                      >
                        {isComplete ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          <Circle className="h-4 w-4" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p
                          className={cn(
                            "text-sm whitespace-pre-wrap",
                            isComplete ? "text-gray-500 line-through" : "text-gray-700"
                          )}
                        >
                          {reminder.content}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          Due: {new Date(reminder.remind_at!).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        onClick={() => deleteNote.mutate(reminder.id)}
                        className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-red-500 transition-colors shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <form onSubmit={handleAddReminder} className="space-y-2">
              <Textarea
                value={reminderContent}
                onChange={(e) => setReminderContent(e.target.value)}
                placeholder="Follow-up reminder..."
                rows={2}
              />
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={reminderDate}
                  onChange={(e) => setReminderDate(e.target.value)}
                  className="block rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={
                    !reminderContent.trim() || !reminderDate || createNote.isPending
                  }
                >
                  Add Reminder
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
