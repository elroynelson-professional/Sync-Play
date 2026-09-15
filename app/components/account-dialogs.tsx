"use client";

type AccountDialogProps = {
  user: {
    name: string;
    email: string;
  };
  onClose: () => void;
};

export function AccountDialog({ user, onClose }: AccountDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <section className="w-full max-w-md rounded-[28px] border border-white/10 bg-[#0d0d0d] p-6 shadow-2xl shadow-black/40" role="dialog" aria-modal="true" aria-labelledby="account-dialog-title">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Profile</p>
            <h2 id="account-dialog-title" className="mt-2 text-2xl font-semibold text-white">Account settings</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-lg text-slate-300 transition hover:bg-white/10" aria-label="Close account settings">×</button>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#0a0a0a] p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-sm font-semibold text-emerald-300">{user.name.slice(0, 2).toUpperCase()}</div>
            <div>
              <p className="font-medium text-white">{user.name}</p>
              <p className="text-sm text-slate-400">{user.email}</p>
            </div>
          </div>
        </div>
        <button type="button" onClick={onClose} className="mt-5 w-full rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-[#03150a] transition hover:bg-emerald-400">Done</button>
      </section>
    </div>
  );
}

export function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <section className="w-full max-w-md rounded-[28px] border border-white/10 bg-[#0d0d0d] p-6 shadow-2xl shadow-black/40" role="dialog" aria-modal="true" aria-labelledby="help-dialog-title">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Support</p>
            <h2 id="help-dialog-title" className="mt-2 text-2xl font-semibold text-white">Help</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-lg text-slate-300 transition hover:bg-white/10" aria-label="Close help">×</button>
        </div>
        <p className="text-sm leading-6 text-slate-300">Create or join a room from the sidebar. Use the search bar to filter the current page, and open your profile to view account details.</p>
        <button type="button" onClick={onClose} className="mt-5 w-full rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-[#03150a] transition hover:bg-emerald-400">Close</button>
      </section>
    </div>
  );
}
