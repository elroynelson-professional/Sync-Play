import { io } from "socket.io-client";

export const socketUrl = (process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:3002").replace(/\/$/, "");

export const socket = io(socketUrl, {
  autoConnect: false,
  reconnection: false,
});
