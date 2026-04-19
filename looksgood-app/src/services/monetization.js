import { Platform } from "react-native";

const isEnabled = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
};

export const androidPlayBillingReady = isEnabled(process.env.EXPO_PUBLIC_ANDROID_PLAY_BILLING_READY);
export const allowsInAppSubscriptionCheckout = Platform.OS !== "android" || androidPlayBillingReady;
export const usesPlaySafeAndroidPaywall = Platform.OS === "android" && !androidPlayBillingReady;
