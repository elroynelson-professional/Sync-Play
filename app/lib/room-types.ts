export type RoomMember = {
  id: string;
  name: string;
};

export type MediaType = "youtube" | "direct" | "audio";

export type QueueTrack = {
  trackId: string;
  videoId: string;
  title: string;
  url: string | null;
  mediaType: MediaType;
  addedBy: string;
};

export type ChatMessage = {
  id: string;
  userId: string;
  name: string;
  text: string;
  createdAt: number;
};

export type PlaybackState = {
  trackId: string | null;
  videoId: string | null;
  title: string | null;
  url: string | null;
  mediaType: MediaType | null;
  position: number;
  playing: boolean;
  updatedAt: number;
};

export type RoomState = {
  roomId: string;
  hostId: string | null;
  users: RoomMember[];
  playback: PlaybackState;
  queue: QueueTrack[];
  history: QueueTrack[];
  messages: ChatMessage[];
  createdAt: number;
};
