// Choose the more legible foreground for user-selected hex button colors.
export function getButtonTextColor(color: string): "#ffffff" | "#000000" {
  const hex = color.replace(/^#/, "");
  const expanded = hex.length === 3 ? hex.split("").map((digit) => digit + digit).join("") : hex;
  if (!/^[0-9a-f]{6}$/i.test(expanded)) return "#000000";
  const channels = [0, 2, 4].map((offset) => {
    const value = parseInt(expanded.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  // White or black, whichever provides the greater contrast ratio.
  const darkLuminance = 0;
  return 1.05 / (luminance + 0.05) > (luminance + 0.05) / (darkLuminance + 0.05) ? "#ffffff" : "#000000";
}


export function isCustomRoomTheme(theme?: { custom?: boolean; accent?: string; background?: string; buttonColor?: string }): boolean {
  if (!theme) return false;
  if (theme.custom !== undefined) return theme.custom;
  // Recognize room links created before the explicit custom-theme flag.
  const accent = (theme.accent || "#5eead4").toLowerCase();
  const background = (theme.background || "#0f172a").toLowerCase();
  const button = (theme.buttonColor || accent).toLowerCase();
  return button !== accent || ![
    ["#5eead4", "#0f172a"], ["#93c5fd", "#111827"],
    ["#f9a8d4", "#1f2937"], ["#a78bfa", "#140f2d"],
  ].some(([presetAccent, presetBackground]) => accent === presetAccent && background === presetBackground);
}
