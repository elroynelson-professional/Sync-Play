"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const ACTIVE_USER_KEY = "syncplay-active-user-v1";

type AccountUser = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

function readActiveUser(): AccountUser | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(ACTIVE_USER_KEY);
    return raw ? (JSON.parse(raw) as AccountUser) : null;
  } catch {
    return null;
  }
}

export default function AccountSettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<AccountUser | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPasswordField, setShowNewPasswordField] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    const activeUser = readActiveUser();
    if (!activeUser) {
      router.replace("/");
      return;
    }

    const [fname, ...rest] = activeUser.name.split(" ");
    setUser(activeUser);
    setFirstName(fname || "");
    setLastName(rest.join(" ") || "");
    setEmail(activeUser.email);
  }, [router]);

  function saveChanges() {
    if (!user) return;

    const updatedName = `${firstName.trim()} ${lastName.trim()}`.trim() || user.name;
    const updatedUser = {
      ...user,
      name: updatedName,
      email: email.trim() || user.email,
    };

    if (typeof window !== "undefined") {
      window.localStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(updatedUser));
    }

    setUser(updatedUser);
    setStatus("Changes saved successfully.");
  }

  function changePassword() {
    if (!currentPassword.trim()) {
      setStatus("Please enter your current password.");
      return;
    }

    if (!newPassword.trim()) {
      setStatus("Please enter a new password.");
      return;
    }

    if (newPassword.trim().length < 6) {
      setStatus("New password must be at least 6 characters long.");
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setShowNewPasswordField(false);
    setStatus("Password changed successfully.");
  }

  function handleChangePasswordClick() {
    if (!showNewPasswordField) {
      setShowNewPasswordField(true);
      setStatus("");
      return;
    }

    changePassword();
  }

  function signOut() {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(ACTIVE_USER_KEY);
    }

    setUser(null);
    router.replace("/");
  }

  if (!user) {
    return null;
  }

  return (
    <main className="min-h-screen bg-black p-0 text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-8 sm:px-8 lg:px-10">
        <header className="mb-8 flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-emerald-300">Profile</p>
            <h1 className="mt-2 text-[2.1rem] font-semibold tracking-[-0.06em] text-white">Account</h1>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition hover:bg-white/10">
              Back to dashboard
            </Link>
            <button
              type="button"
              onClick={signOut}
              className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-200 transition hover:bg-emerald-500/15"
            >
              Sign out
            </button>
          </div>
        </header>

        <section className="space-y-8">
          <div className="flex items-center justify-between border-b border-white/10 pb-5">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[radial-gradient(circle_at_30%_30%,_#f0d0b7,_#9c6a43_40%,_#2e2a2f_100%)] text-xl font-semibold text-white shadow-inner shadow-black/40">
                {(user.name || "G").slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="text-[1.05rem] font-semibold text-white">Profile picture</div>
                <div className="text-sm text-slate-400">PNG, JPEG under 15MB</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button type="button" className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/10">
                Upload new picture
              </button>
              <button type="button" className="rounded-xl border border-white/10 bg-[#0a0a0a] px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/5">
                Delete
              </button>
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <div className="mb-3 text-[1.05rem] font-semibold text-white">Full name</div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm text-slate-300">First name</span>
                  <input
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#0a0a0a] px-4 py-3 text-white outline-none placeholder:text-slate-500"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm text-slate-300">Last name</span>
                  <input
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#0a0a0a] px-4 py-3 text-white outline-none placeholder:text-slate-500"
                  />
                </label>
              </div>
            </div>

            <div>
              <div className="mb-3 text-[1.05rem] font-semibold text-white">Contact email</div>
              <p className="mb-3 text-sm text-slate-400">Manage your account email address.</p>
              <div className="flex items-center gap-3">
                <div className="flex flex-1 items-center rounded-xl border border-white/10 bg-[#0a0a0a] px-4 py-3">
                  <span className="mr-2 text-slate-300">✉</span>
                  <input
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full bg-transparent text-white outline-none placeholder:text-slate-500"
                  />
                </div>
                <button type="button" className="flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-3 text-sm font-medium text-emerald-200 transition hover:bg-emerald-500/15">
                  <span className="text-base">＋</span>
                  Add another email
                </button>
              </div>
            </div>

            <div>
              <div className="mb-3 text-[1.05rem] font-semibold text-white">Password</div>
              <p className="mb-3 text-sm text-slate-400">Update your password securely.</p>
              <div className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)]">
                  <label className="block">
                    <span className="mb-2 block text-sm text-slate-300">Current password</span>
                    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#0a0a0a] px-4 py-3">
                      <input
                        type={showCurrentPassword ? "text" : "password"}
                        value={currentPassword}
                        onChange={(event) => setCurrentPassword(event.target.value)}
                        className="w-full bg-transparent text-white outline-none placeholder:text-slate-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword((value) => !value)}
                        className="text-xs font-medium uppercase tracking-[0.12em] text-slate-400 transition hover:text-white"
                      >
                        {showCurrentPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                  </label>

                  <div className="flex items-end justify-end">
                    <button
                      type="button"
                      onClick={handleChangePasswordClick}
                      className="shrink-0 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-[#03150a] transition hover:bg-emerald-400"
                    >
                      Change password
                    </button>
                  </div>
                </div>

                {showNewPasswordField && (
                  <div className="w-full">
                    <span className="mb-2 block text-sm text-slate-300">New password</span>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      placeholder="Enter new password"
                      className="w-full rounded-xl border border-white/10 bg-[#0a0a0a] px-4 py-3 text-white outline-none placeholder:text-slate-500"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="pt-2">
              <div className="mb-3 text-[1.05rem] font-semibold text-white">Account security</div>
              <p className="mb-4 text-sm text-slate-400">Manage your account security.</p>
              <div className="flex items-center gap-3">
                <button type="button" className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#0a0a0a] px-3 py-2.5 text-sm font-medium text-white transition hover:bg-white/5">
                  <span>⎋</span>
                  Log out
                </button>
                <button type="button" onClick={signOut} className="rounded-xl border border-rose-400/35 bg-rose-500/10 px-3 py-2.5 text-sm font-medium text-rose-200 transition hover:bg-rose-500/15">
                  Delete my account
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-white/10 pt-5">
              <div className="min-h-[1.5rem] text-sm text-emerald-300">{status}</div>
              <button
                type="button"
                onClick={saveChanges}
                className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-[#03150a] transition hover:bg-emerald-400"
              >
                Save changes
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
