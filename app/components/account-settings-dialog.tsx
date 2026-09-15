"use client";

import { useState } from "react";

type AccountSettingsDialogProps = {
  user: {
    name: string;
    email: string;
    createdAt: string;
  };
  socketUrl: string;
  onClose: () => void;
};

export function AccountSettingsDialog({ user, socketUrl, onClose }: AccountSettingsDialogProps) {
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [passwordMessage, setPasswordMessage] = useState("");
  const [preferences, setPreferences] = useState({ emailAlerts: true, pushNotifications: true, twoFactor: false });

  async function changePassword() {
    setPasswordMessage("");
    if (!passwordForm.currentPassword || passwordForm.newPassword.length < 8) {
      setPasswordMessage("Use your current password and a new password with at least 8 characters.");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordMessage("The new password and confirmation do not match.");
      return;
    }

    const response = await fetch(`${socketUrl}/api/auth/password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(passwordForm),
    });
    const payload = (await response.json()) as { error?: string; message?: string };
    setPasswordMessage(payload.error || payload.message || "Password update failed.");
    if (response.ok) setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 px-4 py-6 backdrop-blur-sm">
      <section className="mx-auto w-full max-w-3xl rounded-[28px] border border-white/10 bg-[#0b0b0c] p-5 shadow-2xl shadow-black/50 sm:p-7" role="dialog" aria-modal="true" aria-labelledby="account-settings-title">
        <div className="mb-7 flex items-start justify-between gap-4 border-b border-white/10 pb-5">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-[18px] bg-emerald-500/15 text-2xl font-semibold text-emerald-300">{user.name.slice(0, 2).toUpperCase()}</div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300">Profile</p>
              <h2 id="account-settings-title" className="mt-1 text-2xl font-semibold text-white">Account settings</h2>
              <p className="mt-1 text-sm text-slate-400">Account owner</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-[#121212] text-2xl text-white transition hover:bg-white/5" aria-label="Close account settings">×</button>
        </div>

        <div className="space-y-7">
          <section className="space-y-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300">Profile</p>
              <h3 className="mt-1 text-xl font-semibold text-white">Personal information</h3>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                ["First name", user.name.split(" ")[0] || user.name],
                ["Last name", user.name.split(" ").slice(1).join(" ") || "Not set"],
                ["Email address", user.email],
                ["Member since", new Date(user.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-white/10 bg-[#121212] px-3.5 py-3">
                  <div className="text-xs text-slate-400">{label}</div>
                  <div className="mt-1 text-sm text-white">{value}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-4 border-t border-white/10 pt-6">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300">Security</p>
              <h3 className="mt-1 text-xl font-semibold text-white">Change password</h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {(["currentPassword", "newPassword", "confirmPassword"] as const).map((key) => (
                <input key={key} type="password" value={passwordForm[key]} onChange={(event) => setPasswordForm((current) => ({ ...current, [key]: event.target.value }))} placeholder={key === "currentPassword" ? "Current password" : key === "newPassword" ? "New password" : "Confirm password"} className="rounded-xl border border-white/10 bg-[#121212] px-3.5 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/50" />
              ))}
            </div>
            <button type="button" onClick={() => void changePassword()} className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-[#03150a] transition hover:bg-emerald-400">Change password</button>
            {passwordMessage ? <p className="text-sm text-slate-300">{passwordMessage}</p> : null}
          </section>

          <section className="space-y-3 border-t border-white/10 pt-6">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300">Preferences</p>
              <h3 className="mt-1 text-xl font-semibold text-white">Notifications and privacy</h3>
            </div>
            {["emailAlerts", "pushNotifications", "twoFactor"].map((key) => {
              const enabled = preferences[key as keyof typeof preferences];
              const label = key === "emailAlerts" ? "Email alerts" : key === "pushNotifications" ? "Push notifications" : "Two-factor authentication";
              return <button key={key} type="button" onClick={() => setPreferences((current) => ({ ...current, [key]: !enabled }))} className="flex w-full items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#121212] p-4 text-left"><span className="text-sm font-medium text-white">{label}</span><span className={`relative h-7 w-12 rounded-full border ${enabled ? "border-emerald-400/50 bg-emerald-500/20" : "border-white/10 bg-white/5"}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${enabled ? "left-6" : "left-1"}`} /></span></button>;
            })}
          </section>

          <div className="flex items-center justify-between border-t border-white/10 pt-6"><span className="text-sm text-slate-300">Account status</span><span className="rounded-full border border-emerald-400/35 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200">Active</span></div>
        </div>
      </section>
    </div>
  );
}
