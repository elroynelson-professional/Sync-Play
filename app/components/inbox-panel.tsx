"use client";

import type { ReactNode } from "react";

export type DirectMessage = {
  id: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  text: string;
  createdAt: number;
  read: boolean;
  recipientName?: string;
  roomId?: string;
  roomTitle?: string;
  attachment?: {
    name: string;
    url: string;
    contentType: string;
    size: number;
  } | null;
};

export type FriendContact = {
  id: string;
  name: string;
  profileImage?: string | null;
};

type InboxPanelProps = {
  user: { id: string };
  friendContacts: FriendContact[];
  inboxMessages: DirectMessage[];
  selectedConversation: string | null;
  setSelectedConversation: (value: string | null) => void;
  setMessageRecipient: (value: string) => void;
  closeInbox: () => void;
  joinRoomFromMessage: (roomId?: string, title?: string) => void;
  renderMessageAttachment: (message: DirectMessage) => ReactNode;
  handleAttachment: (file?: File) => void | Promise<void>;
  isUploadingAttachment: boolean;
  messageDraft: string;
  setMessageDraft: (value: string) => void;
  sendDirectMessage: () => void | Promise<void>;
  status?: string;
};

export function InboxPanel({ user, friendContacts, inboxMessages, selectedConversation, setSelectedConversation, setMessageRecipient, closeInbox, joinRoomFromMessage, renderMessageAttachment, handleAttachment, isUploadingAttachment, messageDraft, setMessageDraft, sendDirectMessage, status }: InboxPanelProps) {
  return (
<section role="dialog" aria-modal="true" aria-label="Inbox" className="fixed inset-0 z-50 flex bg-black/70 md:justify-end">
              <div className="flex h-full w-full max-w-[820px] flex-col overflow-hidden border-white/10 bg-[#0b0b0c] shadow-2xl shadow-black/60 md:min-h-[560px] md:flex-row md:rounded-l-[22px] md:border-y md:border-l">
                <aside className="w-full border-b border-white/10 bg-[#101011] md:w-[310px] md:border-b-0 md:border-r">
                  <div className="flex items-center gap-2 border-b border-white/10 p-3 sm:p-4">
                    <div className="flex flex-1 items-center gap-2 rounded-xl bg-[#1a1a1c] px-2.5 py-2 sm:px-3">
                      <span className="text-slate-500">⌕</span>
                      <input placeholder="Search" className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500" />
                    </div>
                    <button type="button" onClick={() => { setSelectedConversation(friendContacts[0]?.name || null); setMessageRecipient(friendContacts[0]?.name || ""); }} className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-lg text-slate-300" aria-label="New message">
                      +
                    </button>
                  </div>

                  <div className="px-3 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:px-4 sm:pt-4">Messages</div>
                  <div className="space-y-1 px-2 pb-3 sm:pb-4">
                    {friendContacts.map((friend) => {
                      const friendName = friend.name;
                      const friendMessages = inboxMessages.filter((message) => message.senderId === friend.id || message.recipientId === friend.id);
                      const latestMessage = friendMessages[friendMessages.length - 1];
                      const unread = friendMessages.some((message) => message.recipientId === user.id && !message.read);

                      return (
                        <button
                          key={friendName}
                          type="button"
                          onClick={() => {
                            setSelectedConversation(friendName);
                            setMessageRecipient(friendName);
                          }}
                          className={`flex w-full items-center gap-2.5 rounded-xl p-2.5 text-left transition sm:gap-3 sm:p-3 ${selectedConversation === friendName ? "bg-emerald-500/15" : "hover:bg-white/5"}`}
                        >
                          {friend.profileImage ? (
                            <img src={friend.profileImage} alt={friendName} className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-white/10 sm:h-10 sm:w-10" />
                          ) : (
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 text-xs font-semibold text-[#03150a] sm:h-10 sm:w-10 sm:text-sm">{friendName.split(" ").map((part) => part[0]).join("")}</div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-sm font-semibold text-white">{friendName}</span>
                              {latestMessage ? <span className="text-[10px] text-slate-500">{new Date(latestMessage.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}</span> : null}
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-xs text-slate-400">{latestMessage?.text || "Start a conversation"}</p>
                              {unread ? <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" /> : null}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </aside>

                <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#0b0b0c]">
                  <div className="flex items-center justify-between border-b border-white/10 px-3 py-3 sm:px-5 sm:py-4">
                    {selectedConversation ? (
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 text-xs font-semibold text-[#03150a] sm:h-10 sm:w-10 sm:text-sm">{selectedConversation.split(" ").map((part) => part[0]).join("")}</div>
                        <div>
                          <h2 className="font-semibold text-white">{selectedConversation}</h2>
                          <p className="text-xs text-emerald-300">Friend</p>
                        </div>
                      </div>
                    ) : <h2 className="text-lg font-semibold text-white">Messages</h2>}
                    <button type="button" onClick={closeInbox} className="flex h-9 w-9 items-center justify-center rounded-full text-2xl text-slate-400 transition hover:bg-white/5 hover:text-white" aria-label="Close inbox">×</button>
                  </div>

                  {status ? <p role="status" className="px-4 py-2 text-sm text-[var(--muted)]">{status}</p> : null}
                  {selectedConversation ? (
                    <>
                      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3 sm:space-y-3 sm:p-5">
                        {inboxMessages
                          .filter((message) => {
                            const selectedFriend = friendContacts.find((friend) => friend.name === selectedConversation);
                            return selectedFriend ? message.senderId === selectedFriend.id || message.recipientId === selectedFriend.id : false;
                          })
                          .map((message) => (
                            <div key={message.id} className={`flex ${message.senderId === user.id ? "justify-end" : "justify-start"}`}>
                              <div className={`max-w-[80%] rounded-2xl px-3 py-2.5 text-sm sm:max-w-[75%] sm:px-4 sm:py-3 ${message.senderId === user.id ? "bg-emerald-500 text-[#03150a]" : "bg-[#181819] text-slate-200"}`}>
                                {message.text ? <p>{message.text}</p> : null}
                                {message.roomId ? (
                                  <button
                                    type="button"
                                    onClick={() => joinRoomFromMessage(message.roomId, message.roomTitle)}
                                    className="mt-3 inline-flex items-center justify-center rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-[#03150a] shadow-sm shadow-emerald-950/40 transition hover:bg-emerald-400"
                                  >
                                    Join room
                                  </button>
                                ) : null}
                                {message.attachment ? renderMessageAttachment(message) : null}
                              </div>
                            </div>
                          ))}
                      </div>
                      <div className="border-t border-white/10 p-2.5 sm:p-4">
                        <div className="flex gap-2">
                          <label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-white/10 bg-[#121212] text-lg text-slate-300 transition hover:bg-white/10 sm:h-11 sm:w-11" aria-label="Attach a file">
                            <input type="file" className="hidden" onChange={(event) => { void handleAttachment(event.target.files?.[0]); event.currentTarget.value = ""; }} disabled={isUploadingAttachment} />
                            +
                          </label>
                          <input value={messageDraft} onChange={(event) => setMessageDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void sendDirectMessage(); }} placeholder={isUploadingAttachment ? "Uploading file..." : "Write a message..."} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#121212] px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/50 sm:px-4 sm:py-3" disabled={isUploadingAttachment} />
                          <button type="button" onClick={() => void sendDirectMessage()} disabled={!messageDraft.trim() || isUploadingAttachment} className="rounded-xl bg-emerald-500 px-3 py-2.5 text-sm font-semibold text-[#03150a] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 sm:py-3">Send</button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/5 text-2xl text-slate-400">✉</div>
                      <h2 className="mt-4 text-lg font-semibold text-white">Select a chat to start messaging</h2>
                      <p className="mt-2 max-w-sm text-sm text-slate-500">Choose a friend from your messages to view the conversation.</p>
                    </div>
                  )}
                </div>
              </div>
            </section>
  );
}
