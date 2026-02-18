"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "Must be at least 6 characters"),
});

type PasswordInput = z.infer<typeof passwordSchema>;

const linkedinSchema = z.object({
  linkedin_email: z.string().email("Valid email required"),
  linkedin_password: z.string().min(1, "Password is required"),
});

type LinkedInInput = z.infer<typeof linkedinSchema>;

interface UserProfile {
  telegram_chat_id: string | null;
}

export default function ProfilePage() {
  const { user } = useAuth();
  const api = getApiClient();
  const { toast } = useToast();

  // Password form
  const pwForm = useForm<PasswordInput>({
    resolver: zodResolver(passwordSchema),
  });

  const changePassword = useMutation({
    mutationFn: (data: PasswordInput) => api.patch("/api/me/password", data),
    onSuccess: () => {
      toast.success("Password changed successfully");
      pwForm.reset();
    },
    onError: (err: unknown) => {
      const apiErr = err as { response?: { data?: { error?: string } } };
      toast.error(apiErr.response?.data?.error || "Failed to change password");
    },
  });

  // Telegram link code
  const [linkCode, setLinkCode] = useState("");
  const generateLinkCode = useMutation({
    mutationFn: () => api.post("/api/me/telegram-link-code"),
    onSuccess: (res) => {
      setLinkCode(res.data.code);
      toast.success("Link code generated");
    },
    onError: (err: unknown) => {
      const apiErr = err as { response?: { data?: { error?: string } } };
      toast.error(apiErr.response?.data?.error || "Something went wrong");
    },
  });

  // LinkedIn credentials form
  const liForm = useForm<LinkedInInput>({
    resolver: zodResolver(linkedinSchema),
  });

  const { data: profile } = useQuery<UserProfile>({
    queryKey: ["me"],
    queryFn: () => api.get("/api/me").then((r) => r.data),
  });

  const saveLiCreds = useMutation({
    mutationFn: (data: LinkedInInput) => api.put("/api/me/linkedin-credentials", data),
    onSuccess: () => {
      toast.success("LinkedIn credentials saved");
      liForm.setValue("linkedin_password", "");
    },
    onError: (err: unknown) => {
      const apiErr = err as { response?: { data?: { error?: string } } };
      toast.error(apiErr.response?.data?.error || "Failed to save credentials");
    },
  });

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <h1 className="text-3xl font-bold text-gray-900">Profile</h1>

      {/* Account Info */}
      <section className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Account</h2>
        <dl className="space-y-2">
          <div className="flex justify-between">
            <dt className="text-sm text-gray-500">Name</dt>
            <dd className="text-sm text-gray-900">{user?.name}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sm text-gray-500">Email</dt>
            <dd className="text-sm text-gray-900">{user?.email}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sm text-gray-500">Role</dt>
            <dd className="text-sm text-gray-900 capitalize">{user?.role}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sm text-gray-500">Telegram</dt>
            <dd className="text-sm text-gray-900">
              {profile?.telegram_chat_id ? "Linked" : "Not linked"}
            </dd>
          </div>
        </dl>
      </section>

      {/* Change Password */}
      <section className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Change Password</h2>
        <form onSubmit={pwForm.handleSubmit((data) => changePassword.mutate(data))} className="space-y-3">
          <Input
            type="password"
            placeholder="Current password"
            {...pwForm.register("currentPassword")}
          />
          {pwForm.formState.errors.currentPassword && (
            <p className="text-sm text-red-600">{pwForm.formState.errors.currentPassword.message}</p>
          )}
          <Input
            type="password"
            placeholder="New password"
            {...pwForm.register("newPassword")}
          />
          {pwForm.formState.errors.newPassword && (
            <p className="text-sm text-red-600">{pwForm.formState.errors.newPassword.message}</p>
          )}
          <Button type="submit" disabled={changePassword.isPending}>
            Update Password
          </Button>
        </form>
      </section>

      {/* Link Telegram */}
      <section className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Link Telegram</h2>
        <p className="text-sm text-gray-600 mb-4">
          Generate a code, then send <code className="bg-gray-100 px-1 rounded">/link CODE</code> to the C2C Recruiter bot on Telegram.
        </p>
        {linkCode ? (
          <div className="bg-blue-50 border border-blue-200 rounded p-4 text-center">
            <p className="text-sm text-blue-700">Your link code (expires in 10 min):</p>
            <p className="text-3xl font-mono font-bold text-blue-900 mt-2">{linkCode}</p>
          </div>
        ) : (
          <Button onClick={() => generateLinkCode.mutate()} disabled={generateLinkCode.isPending}>
            Generate Link Code
          </Button>
        )}
      </section>

      {/* LinkedIn Credentials */}
      <section className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">LinkedIn Credentials</h2>
        <p className="text-sm text-gray-600 mb-4">
          Stored encrypted. The Electron app decrypts them locally.
        </p>
        <form onSubmit={liForm.handleSubmit((data) => saveLiCreds.mutate(data))} className="space-y-3">
          <Input
            type="email"
            placeholder="LinkedIn email"
            {...liForm.register("linkedin_email")}
          />
          {liForm.formState.errors.linkedin_email && (
            <p className="text-sm text-red-600">{liForm.formState.errors.linkedin_email.message}</p>
          )}
          <Input
            type="password"
            placeholder="LinkedIn password"
            {...liForm.register("linkedin_password")}
          />
          {liForm.formState.errors.linkedin_password && (
            <p className="text-sm text-red-600">{liForm.formState.errors.linkedin_password.message}</p>
          )}
          <Button type="submit" disabled={saveLiCreds.isPending}>
            Save Credentials
          </Button>
        </form>
      </section>
    </div>
  );
}
