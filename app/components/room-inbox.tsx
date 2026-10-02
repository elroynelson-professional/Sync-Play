"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { socket, socketUrl } from "../lib/socket";
import { InboxPanel, type DirectMessage, type FriendContact } from "./inbox-panel";

export function RoomInbox({ user, onClose }: { user: { id: string; name: string }; onClose: () => void }) {
  const router = useRouter();
  const [friends, setFriends] = useState<FriendContact[]>([]);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [recipient, setRecipient] = useState("");
  const [draft, setDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState("Loading messages…");

  useEffect(() => {
    const controller = new AbortController();
    function receive(message: DirectMessage) {
      if (message.senderId !== user.id && message.recipientId !== user.id) return;
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
    }
    // RoomView owns the connection. Opening or closing the inbox must not reconnect it.
    socket.on("direct-message", receive);
    void Promise.all([
      fetch(`${socketUrl}/api/friends`, { credentials: "include", signal: controller.signal }),
      fetch(`${socketUrl}/api/messages`, { credentials: "include", signal: controller.signal }),
    ]).then(async ([friendResponse, messageResponse]) => {
      if (!friendResponse.ok || !messageResponse.ok) throw new Error("Inbox unavailable");
      const friendData = await friendResponse.json() as { friends?: FriendContact[] };
      const messageData = await messageResponse.json() as { messages?: DirectMessage[] };
      if (controller.signal.aborted) return;
      setFriends(friendData.friends || []);
      setMessages((current) => [...new Map([...(messageData.messages || []), ...current].map((message) => [message.id, message])).values()].sort((a, b) => a.createdAt - b.createdAt));
      setStatus(friendData.friends?.length ? "" : "Add friends to start a conversation.");
    }).catch(() => {
      if (!controller.signal.aborted) setStatus("Could not load your inbox. Close it and try again.");
    });
    return () => {
      controller.abort();
      socket.off("direct-message", receive);
    };
  }, [user.id]);

  function send(attachment: DirectMessage["attachment"] = null) {
    const recipientId = friends.find((friend) => friend.name === recipient)?.id;
    if (!recipientId || (!draft.trim() && !attachment)) return;
    if (!socket.connected) {
      setStatus("Reconnect to the room before sending a message.");
      return;
    }
    socket.emit("direct-message", { recipientId, text: draft.trim(), attachment });
    setDraft("");
    setStatus("");
  }

  async function upload(file?: File) {
    if (!file || !recipient) return;
    if (file.size > 25 * 1024 * 1024) {
      setStatus("Chat files must be 25 MB or smaller.");
      return;
    }
    setUploading(true);
    try {
      const response = await fetch(`${socketUrl}/uploads`, {
        method: "POST", credentials: "include", body: file,
        headers: { "Content-Type": file.type || "application/octet-stream", "X-File-Name": encodeURIComponent(file.name) },
      });
      const payload = await response.json() as { url?: string };
      if (!response.ok || !payload.url) throw new Error("Upload failed");
      send({ name: file.name, url: payload.url, contentType: file.type || "application/octet-stream", size: file.size });
    } catch {
      setStatus("The file could not be uploaded.");
    } finally {
      setUploading(false);
    }
  }

  return <InboxPanel user={user} friendContacts={friends} inboxMessages={messages}
    selectedConversation={selected} setSelectedConversation={setSelected} setMessageRecipient={setRecipient}
    closeInbox={onClose} status={status} messageDraft={draft} setMessageDraft={setDraft}
    sendDirectMessage={() => send()} handleAttachment={upload} isUploadingAttachment={uploading}
    joinRoomFromMessage={(roomId, title) => {
      if (!roomId) return;
      onClose();
      const query = new URLSearchParams({ linkVersion: "2", name: user.name, role: "guest", action: "join", title: title || `Room ${roomId}` });
      router.push(`/room/${encodeURIComponent(roomId)}?${query}`);
    }}
    renderMessageAttachment={(message) => {
      const attachment = message.attachment;
      if (!attachment) return null;
      return <div className="mt-3 space-y-2">
        {attachment.contentType.startsWith("video/") ? <video src={attachment.url} controls className="max-h-72 w-full rounded-xl" /> : null}
        {attachment.contentType.startsWith("audio/") ? <audio src={attachment.url} controls className="w-full" /> : null}
        <a href={attachment.url} target="_blank" rel="noreferrer" className="underline">{attachment.name || "Open attachment"}</a>
      </div>;
    }} />;
}
