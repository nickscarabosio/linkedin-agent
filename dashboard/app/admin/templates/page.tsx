"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2 } from "lucide-react";
import type { MessageTemplate } from "@/lib/types";

const templateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["connection_request", "message", "follow_up", "inmail"]),
  body: z.string().min(1, "Body is required"),
});

type TemplateInput = z.infer<typeof templateSchema>;

const TYPE_LABELS: Record<string, string> = {
  connection_request: "Connection Request",
  message: "Message",
  follow_up: "Follow Up",
  inmail: "InMail",
};

interface AdminTemplate extends MessageTemplate {
  creator_name?: string;
}

export default function AdminTemplatesPage() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const api = getApiClient();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TemplateInput>({
    resolver: zodResolver(templateSchema),
    defaultValues: { type: "connection_request" },
  });

  const {
    register: registerEdit,
    handleSubmit: handleEditSubmit,
    reset: resetEdit,
    setValue: setEditValue,
    formState: { errors: editErrors },
  } = useForm<TemplateInput>({
    resolver: zodResolver(templateSchema),
  });

  if (!isAdmin) {
    router.push("/");
    return null;
  }

  const { data: templates, isLoading } = useQuery<AdminTemplate[]>({
    queryKey: ["admin-templates"],
    queryFn: () => api.get("/api/admin/templates").then((r) => r.data),
  });

  const createTemplate = useMutation({
    mutationFn: (data: TemplateInput) => api.post("/api/admin/templates", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-templates"] });
      setShowCreate(false);
      reset();
    },
  });

  const updateTemplate = useMutation({
    mutationFn: ({ id, data }: { id: string; data: TemplateInput }) =>
      api.patch(`/api/admin/templates/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-templates"] });
      setEditingId(null);
      resetEdit();
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-templates"] });
    },
  });

  const startEdit = (t: AdminTemplate) => {
    setEditingId(t.id);
    setEditValue("name", t.name);
    setEditValue("type", t.type);
    setEditValue("body", t.body);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Message Templates</h1>
        <Button onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? "Cancel" : "+ New Template"}
        </Button>
      </div>

      {showCreate && (
        <form onSubmit={handleSubmit((data) => createTemplate.mutate(data))} className="bg-white rounded-lg shadow p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Name</label>
              <Input className="mt-1" {...register("name")} placeholder="e.g. Warm Introduction" />
              {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Type</label>
              <Select className="mt-1 w-full" {...register("type")}>
                <option value="connection_request">Connection Request</option>
                <option value="message">Message</option>
                <option value="follow_up">Follow Up</option>
                <option value="inmail">InMail</option>
              </Select>
              {errors.type && <p className="mt-1 text-sm text-red-600">{errors.type.message}</p>}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Body</label>
            <Textarea className="mt-1" rows={5} {...register("body")} placeholder="Hi {{first_name}}, I noticed your work at {{company}}..." />
            {errors.body && <p className="mt-1 text-sm text-red-600">{errors.body.message}</p>}
            <p className="mt-1 text-xs text-gray-500">
              Available merge fields: {"{{first_name}}"}, {"{{last_name}}"}, {"{{full_name}}"}, {"{{title}}"}, {"{{company}}"}
            </p>
          </div>
          <Button type="submit" variant="success" disabled={createTemplate.isPending}>
            Create Template
          </Button>
        </form>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-center text-gray-500">Loading...</div>
        ) : !templates || templates.length === 0 ? (
          <div className="p-6 text-center text-gray-500">No templates yet. Create one to get started.</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Body</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created By</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {templates.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  {editingId === t.id ? (
                    <>
                      <td className="px-6 py-4">
                        <Input {...registerEdit("name")} />
                        {editErrors.name && <p className="mt-1 text-xs text-red-600">{editErrors.name.message}</p>}
                      </td>
                      <td className="px-6 py-4">
                        <Select className="w-full" {...registerEdit("type")}>
                          <option value="connection_request">Connection Request</option>
                          <option value="message">Message</option>
                          <option value="follow_up">Follow Up</option>
                          <option value="inmail">InMail</option>
                        </Select>
                      </td>
                      <td className="px-6 py-4">
                        <Textarea rows={3} {...registerEdit("body")} />
                        {editErrors.body && <p className="mt-1 text-xs text-red-600">{editErrors.body.message}</p>}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">{t.creator_name || "\u2014"}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="success"
                            onClick={handleEditSubmit((data) => updateTemplate.mutate({ id: t.id, data }))}
                            disabled={updateTemplate.isPending}
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="link"
                            onClick={() => { setEditingId(null); resetEdit(); }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-6 py-4 font-medium text-gray-900">{t.name}</td>
                      <td className="px-6 py-4">
                        <Badge variant="info">{TYPE_LABELS[t.type] || t.type}</Badge>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">{t.body}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{t.creator_name || "\u2014"}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => startEdit(t)}
                            className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm("Delete this template?")) {
                                deleteTemplate.mutate(t.id);
                              }
                            }}
                            className="p-1.5 rounded hover:bg-red-50 text-gray-500 hover:text-red-600 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
