import { WEB_FRONTEND_URL } from "./api";

const trim = (value) => String(value || "").replace(/\/+$/, "");

const getWebFrontendRoot = () => trim(String(WEB_FRONTEND_URL || "").replace(/\/index\.html$/i, ""));

export function buildWebFrontendUrl(path = "") {
  const base = getWebFrontendRoot();
  if (!base) return "";
  const cleanPath = String(path || "").trim().replace(/^\/+/, "");
  return cleanPath ? `${base}/${cleanPath}` : `${base}/`;
}

export const PRIVACY_POLICY_URL = buildWebFrontendUrl("privacy.html");
