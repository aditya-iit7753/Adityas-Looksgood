import { Platform } from "react-native";

export const colors = {
  bg: "#FFFFFF",
  bgStrong: "#F5F5F5",
  card: "#FFFFFF",
  text: "#111111",
  subtext: "#555555",
  primary: "#000000",
  primaryDark: "#000000",
  accent: "#000000",
  border: "#E0E0E0",
  chip: "#F2F2F2",
  danger: "#111111",
  success: "#111111",
  warning: "#111111",
  pink: "#111111",
  violet: "#111111",
};

export const radius = {
  sm: 12,
  md: 16,
  lg: 22,
  xl: 28,
  pill: 999,
};

export const fonts = {
  display: Platform.select({
    ios: "AvenirNext-Bold",
    android: "serif",
    default: "sans-serif-condensed",
  }),
  body: Platform.select({
    ios: "AvenirNext-Regular",
    android: "sans-serif",
    default: "system-ui",
  }),
  mono: Platform.select({
    ios: "Menlo",
    android: "monospace",
    default: "monospace",
  }),
};
