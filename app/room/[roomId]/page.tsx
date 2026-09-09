import { RoomView } from "../../components/room-view";

type RoomPageProps = {
  params: Promise<{
    roomId: string;
  }>;
  searchParams: Promise<{
    name?: string;
    role?: string;
    action?: string;
  }>;
};

export default async function RoomPage({ params, searchParams }: RoomPageProps) {
  const [{ roomId }, resolvedSearchParams] = await Promise.all([params, searchParams]);

  const initialName = resolvedSearchParams.name ? decodeURIComponent(resolvedSearchParams.name) : "Guest";
  const initialRole = resolvedSearchParams.role === "host" ? "host" : "guest";
  const initialAction = resolvedSearchParams.action === "create" ? "create" : "join";

  return (
    <RoomView
      roomId={roomId.toUpperCase()}
      initialName={initialName}
      initialRole={initialRole}
      initialAction={initialAction}
    />
  );
}