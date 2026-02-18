"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/ui/skeleton";
import { QueryError } from "@/components/ui/query-error";
import type { User } from "@/lib/types";

const createUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email required"),
  password: z.string().min(6, "Must be at least 6 characters"),
  role: z.enum(["user", "admin"]),
});

type CreateUserInput = z.infer<typeof createUserSchema>;

export default function AdminUsersPage() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const api = getApiClient();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { role: "user" },
  });

  if (!isAdmin) {
    router.push("/");
    return null;
  }

  const { data: users, isLoading, isError, refetch } = useQuery<User[]>({
    queryKey: ["admin-users"],
    queryFn: () => api.get("/api/admin/users").then((r) => r.data),
  });

  const createUser = useMutation({
    mutationFn: (data: CreateUserInput) => api.post("/api/admin/users", data),
    onSuccess: () => {
      toast.success("User created");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setShowCreate(false);
      reset();
    },
    onError: (err: unknown) => {
      const apiErr = err as { response?: { data?: { error?: string } } };
      toast.error(apiErr.response?.data?.error || "Something went wrong");
    },
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api.patch(`/api/admin/users/${id}`, { is_active }),
    onSuccess: () => {
      toast.success("User status updated");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (err: unknown) => {
      const apiErr = err as { response?: { data?: { error?: string } } };
      toast.error(apiErr.response?.data?.error || "Something went wrong");
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Users</h1>
        <Button onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? "Cancel" : "+ New User"}
        </Button>
      </div>

      {showCreate && (
        <form onSubmit={handleSubmit((data) => createUser.mutate(data))} className="bg-white rounded-lg shadow p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Name</label>
              <Input className="mt-1" {...register("name")} />
              {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <Input type="email" className="mt-1" {...register("email")} />
              {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <Input type="password" className="mt-1" {...register("password")} />
              {errors.password && <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Role</label>
              <Select className="mt-1 w-full" {...register("role")}>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </Select>
            </div>
          </div>
          <Button type="submit" variant="success" disabled={createUser.isPending}>
            Create User
          </Button>
        </form>
      )}

      {isLoading ? (
        <TableSkeleton rows={4} columns={6} />
      ) : isError ? (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <QueryError onRetry={refetch} />
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Telegram</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Active</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {(users || []).map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900">{u.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{u.email}</td>
                  <td className="px-6 py-4">
                    <Badge variant={u.role === "admin" ? "purple" : "default"}>{u.role}</Badge>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {u.telegram_chat_id ? "Linked" : "\u2014"}
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={u.is_active ? "success" : "danger"}>
                      {u.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-6 py-4">
                    <Button
                      variant="link"
                      size="sm"
                      onClick={() => toggleActive.mutate({ id: u.id, is_active: !u.is_active })}
                    >
                      {u.is_active ? "Deactivate" : "Activate"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
