"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function ProfilePage() {
  const { user } = useAuth();
  const api = getApiClient();

  // Password change
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwMsg, setPwMsg] = useState("");

  const changePassword = useMutation({
    mutationFn: () => api.patch("/api/me/password", { currentPassword, newPassword }),
    onSuccess: () => {
      setPwMsg("Password changed successfully");
      setCurrentPassword("");
      setNewPassword("");
    },
    onError: (err: any) => {
      setPwMsg(err.response?.data?.error || "Failed to change password");
    },
  });

  // Telegram link code
  const [linkCode, setLinkCode] = useState("");

  const generateLinkCode = useMutation({
    mutationFn: () => api.post("/api/me/telegram-link-code"),
    onSuccess: (res) => {
      setLinkCode(res.data.code);
    },
  });

  // LinkedIn credentials
  const [liEmail, setLiEmail] = useState("");
  const [liPassword, setLiPassword] = useState("");
  const [liMsg, setLiMsg] = useState("");

  const { data: profile } = useQuery({
    queryKey: ["me"],
    queryFn: () => api.get("/api/me").then((r) => r.data),
  });

  const saveLiCreds = useMutation({
    mutationFn: () => api.put("/api/me/linkedin-credentials", { linkedin_email: liEmail, linkedin_password: liPassword }),
    onSuccess: () => {
      setLiMsg("LinkedIn credentials saved");
      setLiPassword("");
    },
    onError: (err: any) => {
      setLiMsg(err.response?.data?.error || "Failed to save credentials");
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
        {pwMsg && <p className="text-sm mb-3 text-blue-600">{pwMsg}</p>}
        <div className="space-y-3">
          <input
            type="password"
            placeholder="Current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <input
            type="password"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={() => changePassword.mutate()}
            disabled={!currentPassword || !newPassword || changePassword.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            Update Password
          </button>
        </div>
      </section>

      {/* Link Telegram */}
      <section className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Link Telegram</h2>
        <p className="text-sm text-gray-600 mb-4">
          Generate a code, then send <code className="bg-gray-100 px-1 rounded">/link CODE</code> to the Hood Hero bot on Telegram.
        </p>
        {linkCode ? (
          <div className="bg-blue-50 border border-blue-200 rounded p-4 text-center">
            <p className="text-sm text-blue-700">Your link code (expires in 10 min):</p>
            <p className="text-3xl font-mono font-bold text-blue-900 mt-2">{linkCode}</p>
          </div>
        ) : (
          <button
            onClick={() => generateLinkCode.mutate()}
            disabled={generateLinkCode.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            Generate Link Code
          </button>
        )}
      </section>

      {/* LinkedIn Credentials */}
      <section className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">LinkedIn Credentials</h2>
        <p className="text-sm text-gray-600 mb-4">
          Stored encrypted. The Electron app decrypts them locally.
        </p>
        {liMsg && <p className="text-sm mb-3 text-blue-600">{liMsg}</p>}
        <div className="space-y-3">
          <input
            type="email"
            placeholder="LinkedIn email"
            value={liEmail}
            onChange={(e) => setLiEmail(e.target.value)}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <input
            type="password"
            placeholder="LinkedIn password"
            value={liPassword}
            onChange={(e) => setLiPassword(e.target.value)}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={() => saveLiCreds.mutate()}
            disabled={!liEmail || !liPassword || saveLiCreds.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            Save Credentials
          </button>
        </div>
      </section>
    </div>
  );
}
