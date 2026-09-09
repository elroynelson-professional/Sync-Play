export const FLOATING_PANEL_EVENT = "syncplay:open-floating-panel";

export type FloatingPanelName = "chat" | "voice" | "video";

export function openFloatingPanel(panel: FloatingPanelName) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<FloatingPanelName>(FLOATING_PANEL_EVENT, { detail: panel }));
  }
}
