import axios from "axios";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { clearToken } from "./authStorage";

const isReleaseRuntime = typeof __DEV__ === "boolean" ? !__DEV__ : process.env.NODE_ENV === "production";
const trim = (value) => String(value || "").replace(/\/+$/, "");
const normalizeUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const defaultScheme = isReleaseRuntime ? "https://" : "http://";
  return raw.startsWith("http://") || raw.startsWith("https://") ? trim(raw) : trim(`${defaultScheme}${raw}`);
};
const splitCsv = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const hostFromUrl = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    return new URL(text).hostname.toLowerCase();
  } catch (_err) {
    return text.replace(/^https?:\/\//i, "").split("/")[0].split(":")[0].toLowerCase();
  }
};

const isLocalOnlyHost = (host) => host === "10.0.2.2" || host === "127.0.0.1" || host === "localhost";
const isPrivateIpv4Host = (host) => {
  const value = String(host || "").toLowerCase();
  if (!value) return false;
  if (isLocalOnlyHost(value)) return true;
  if (/^10\./.test(value)) return true;
  if (/^192\.168\./.test(value)) return true;
  const match = value.match(/^172\.(\d{1,3})\./);
  if (match) {
    const secondOctet = Number(match[1]);
    if (secondOctet >= 16 && secondOctet <= 31) return true;
  }
  return false;
};
const isRoutablePublicHost = (host) => Boolean(host) && !isPrivateIpv4Host(host);
const isHttpsUrl = (url) => /^https:\/\//i.test(String(url || "").trim());
const hasExplicitPort = (url) => /^https?:\/\/[^/]+:\d+/i.test(String(url || "").trim());
const API_PORTS = [8100, 8110, 8000];
const DEFAULT_PROD_PATHS = ["", "/api"];
const DEFAULT_PUBLIC_API_CANDIDATES = [
  "https://looksgood-api-production.up.railway.app/api",
  "https://looksgood-api-production.up.railway.app",
];
const getExpoHostUri = () =>
  Constants.expoConfig?.hostUri ??
  Constants.manifest2?.extra?.expoClient?.hostUri ??
  Constants.manifest?.debuggerHost;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseUrlParts = (value) => {
  const normalized = normalizeUrl(value);
  if (!normalized) {
    return { host: "", path: "", normalized: "" };
  }
  try {
    const parsed = new URL(normalized);
    const cleanPath = parsed.pathname && parsed.pathname !== "/" ? trim(parsed.pathname) : "";
    return {
      host: String(parsed.hostname || "").toLowerCase(),
      path: cleanPath,
      normalized: trim(`${parsed.protocol}//${parsed.host}${cleanPath}`),
    };
  } catch (_err) {
    const withoutProto = normalized.replace(/^https?:\/\//i, "");
    const host = withoutProto.split("/")[0];
    const rawPath = withoutProto.includes("/") ? `/${withoutProto.split("/").slice(1).join("/")}` : "";
    const cleanPath = rawPath && rawPath !== "/" ? trim(rawPath) : "";
    return { host: host.toLowerCase(), path: cleanPath, normalized: trim(`http://${host}${cleanPath}`) };
  }
};

const hostUrls = (host, path = "") => {
  const cleanPath = String(path || "").trim();
  return API_PORTS.map((port) => trim(`http://${host}:${port}${cleanPath}`));
};
const joinUrl = (base, path = "") => {
  const cleanBase = trim(base);
  const cleanPath = String(path || "").replace(/^\/+/, "");
  return cleanPath ? `${cleanBase}/${cleanPath}` : cleanBase;
};

const explicitApiCandidates = () => {
  const envPrimary = splitCsv(process.env.EXPO_PUBLIC_API_URL);
  const envList = splitCsv(process.env.EXPO_PUBLIC_API_URLS);
  const expoPrimary = splitCsv(Constants.expoConfig?.extra?.apiUrl ?? Constants.manifest?.extra?.apiUrl);
  const publicDefaults = isReleaseRuntime ? DEFAULT_PUBLIC_API_CANDIDATES : [];
  const unique = [...new Set([...envPrimary, ...envList, ...expoPrimary, ...publicDefaults].map(normalizeUrl).filter(Boolean))].filter((candidate) => {
    if (!isReleaseRuntime) return true;
    return isHttpsUrl(candidate) && isRoutablePublicHost(hostFromUrl(candidate));
  });
  return unique.sort((left, right) => {
    const leftHost = hostFromUrl(left);
    const rightHost = hostFromUrl(right);
    const leftScore = (isRoutablePublicHost(leftHost) ? 100 : 0) + (isHttpsUrl(left) ? 40 : 0) + (hasExplicitPort(left) ? 20 : 0);
    const rightScore = (isRoutablePublicHost(rightHost) ? 100 : 0) + (isHttpsUrl(right) ? 40 : 0) + (hasExplicitPort(right) ? 20 : 0);
    return rightScore - leftScore;
  });
};

const shouldAllowOnDevice = (url) => {
  const isDevice = Constants.isDevice === true;
  const host = hostFromUrl(url);
  if (!isDevice) return true;
  if (Platform.OS === "android" && (host === "127.0.0.1" || host === "localhost")) {
    return true; // valid with adb reverse
  }
  if (Platform.OS !== "android" && host === "10.0.2.2") {
    return false;
  }
  if (isLocalOnlyHost(host) && Platform.OS === "android") {
    // 10.0.2.2/local-only on physical Android without reverse is unsafe.
    const hostUri = getExpoHostUri();
    const expoHost = String(hostUri ? hostUri.split(":")[0] : "").toLowerCase();
    if (host === "10.0.2.2") return false;
    return isLocalOnlyHost(expoHost);
  }
  return true;
};

const getConfiguredApiUrl = () => {
  const explicits = explicitApiCandidates();
  if (isReleaseRuntime) {
    return explicits[0] || "";
  }

  const explicitPublic = explicits.find((candidate) => shouldAllowOnDevice(candidate) && isRoutablePublicHost(hostFromUrl(candidate)));
  if (explicitPublic) {
    return explicitPublic;
  }

  // Android emulator should call host machine through 10.0.2.2.
  if (Platform.OS === "android" && Constants.isDevice === false) {
    return "http://10.0.2.2:8100";
  }

  const hostUri = getExpoHostUri();
  const expoHost = hostUri ? hostUri.split(":")[0] : "";
  if (expoHost) {
    const expoCandidate = normalizeUrl(`http://${expoHost}:8100`);
    if (shouldAllowOnDevice(expoCandidate)) {
      return expoCandidate;
    }
  }

  if (explicits.length) {
    for (const candidate of explicits) {
      if (shouldAllowOnDevice(candidate)) {
        return candidate;
      }
    }
  }

  return "http://127.0.0.1:8100";
};

const buildApiBaseCandidates = () => {
  const candidates = [];
  const explicitCandidates = explicitApiCandidates();
  const isPhysicalDevice = Constants.isDevice === true;
  const configured = trim(getConfiguredApiUrl());

  if (isReleaseRuntime) {
    if (configured) candidates.push(configured);
    for (const explicit of explicitCandidates) {
      if (explicit) candidates.push(explicit);
    }
    return [...new Set(candidates.filter(Boolean))];
  }

  const configuredHost = hostFromUrl(configured);
  if (configured) candidates.push(configured);
  const configuredParts = parseUrlParts(configured);
  if (configuredParts.host) {
    const extraPaths = configuredParts.path ? [configuredParts.path, ""] : [...DEFAULT_PROD_PATHS];
    for (const path of extraPaths) {
      candidates.push(...hostUrls(configuredParts.host, path));
    }
  }

  for (const explicit of explicitCandidates) {
    if (!explicit || !shouldAllowOnDevice(explicit)) continue;
    candidates.push(explicit);
    const parts = parseUrlParts(explicit);
    if (parts.host) {
      const extraPaths = parts.path ? [parts.path, ""] : [...DEFAULT_PROD_PATHS];
      for (const path of extraPaths) {
        candidates.push(...hostUrls(parts.host, path));
      }
    }
  }

  const hostUri = getExpoHostUri();
  const hostFromExpo = hostUri ? hostUri.split(":")[0] : "";
  const expoHostIsLoopback = isLocalOnlyHost(String(hostFromExpo || "").toLowerCase());
  if (hostUri) {
    const host = hostFromExpo;
    if (host) {
      candidates.push(...hostUrls(host).map(trim));
      candidates.push(...hostUrls(host, "/api").map(trim));
    }
  }

  // Android emulator: local loopback and 10.0.2.2 are valid.
  if (Platform.OS === "android" && !isPhysicalDevice) {
    candidates.push(...hostUrls("127.0.0.1"));
    candidates.push(...hostUrls("localhost"));
    candidates.push(...hostUrls("10.0.2.2"));
    candidates.push(...hostUrls("10.0.2.2", "/api"));
  }

  // Android physical device: keep loopback candidates for adb reverse fallback.
  if (Platform.OS === "android" && isPhysicalDevice) {
    candidates.push(...hostUrls("127.0.0.1"));
    candidates.push(...hostUrls("localhost"));
  }

  // Android physical device on LAN should avoid invalid local-only hosts.
  if (Platform.OS === "android") {
    if (isPhysicalDevice) {
      return [...new Set(candidates.filter((url) => {
        const host = hostFromUrl(url);
        if (!isLocalOnlyHost(host)) return true;
        if (host === "127.0.0.1" || host === "localhost") return true;
        return expoHostIsLoopback || isLocalOnlyHost(configuredHost);
      }))];
    }
  }

  // iOS/web loopback hosts are only valid in emulator/simulator contexts.
  if (Platform.OS !== "android" && !isPhysicalDevice) {
    candidates.push(...hostUrls("127.0.0.1"));
    candidates.push(...hostUrls("localhost"));
  }

  return [...new Set(candidates.filter(Boolean))];
};

const API_BASE_CANDIDATES = buildApiBaseCandidates();
let activeApiBaseUrl = API_BASE_CANDIDATES[0] || (isReleaseRuntime ? "" : "http://127.0.0.1:8100");
const API_DISCOVERY_TIMEOUT_MS = 1200;
const API_DISCOVERY_COOLDOWN_MS = 15000;
let apiBaseDiscoveryPromise = null;
let hasResolvedReachableApiBase = false;
let lastApiDiscoveryAttemptAt = 0;
const API_UNREACHABLE_HINT = "Open Connection Center to retry.";

const rememberActiveApiBase = (baseUrl) => {
  const normalized = trim(baseUrl);
  if (!normalized) return;
  activeApiBaseUrl = normalized;
  hasResolvedReachableApiBase = true;
};

const scoreApiCandidate = (candidate) => {
  const normalized = trim(candidate);
  const host = hostFromUrl(normalized);
  let score = 0;

  if (!normalized) return score;
  if (normalized === activeApiBaseUrl) score += 1000;
  if (/:\d+\/*api$/i.test(normalized)) score += 80;
  if (/:8100(?:\/|$)/i.test(normalized)) score += 60;
  if (isRoutablePublicHost(host)) score += 40;

  if (Platform.OS === "android" && Constants.isDevice === true) {
    if (host === "127.0.0.1") score += 600;
    if (host === "localhost") score += 520;
  } else if (Platform.OS === "android" && Constants.isDevice === false) {
    if (host === "10.0.2.2") score += 600;
    if (host === "127.0.0.1" || host === "localhost") score += 420;
  }

  return score;
};

const getDiscoveryCandidates = () =>
  [...new Set([activeApiBaseUrl, ...API_BASE_CANDIDATES].filter(Boolean))]
    .sort((left, right) => scoreApiCandidate(right) - scoreApiCandidate(left))
    .slice(0, 8);

const probeApiCandidate = async (candidate) => {
  try {
    const response = await axios.get(joinUrl(candidate, "health"), {
      timeout: API_DISCOVERY_TIMEOUT_MS,
      headers: { Accept: "application/json" },
      transitional: { clarifyTimeoutError: true },
    });
    return response?.status >= 200 && response?.status < 300;
  } catch (_error) {
    return false;
  }
};

const ensureReachableApiBase = async () => {
  if (isReleaseRuntime || hasResolvedReachableApiBase) {
    return activeApiBaseUrl;
  }

  const now = Date.now();
  if (apiBaseDiscoveryPromise) {
    return apiBaseDiscoveryPromise;
  }
  if (now - lastApiDiscoveryAttemptAt < API_DISCOVERY_COOLDOWN_MS) {
    return activeApiBaseUrl;
  }

  lastApiDiscoveryAttemptAt = now;
  apiBaseDiscoveryPromise = (async () => {
    for (const candidate of getDiscoveryCandidates()) {
      if (await probeApiCandidate(candidate)) {
        rememberActiveApiBase(candidate);
        break;
      }
    }
    return activeApiBaseUrl;
  })().finally(() => {
    apiBaseDiscoveryPromise = null;
  });

  return apiBaseDiscoveryPromise;
};

const ensureApiBaseConfigured = () => {
  if (activeApiBaseUrl) return;
  if (!isReleaseRuntime) return;
  throw new Error("API URL is not configured for production. Set EXPO_PUBLIC_API_URL to a public HTTPS URL before building.");
};

export const API_BASE_URL = activeApiBaseUrl;
export const getActiveApiBaseUrl = () => activeApiBaseUrl;
export const getApiBaseCandidates = () => [...new Set([activeApiBaseUrl, ...API_BASE_CANDIDATES].filter(Boolean))];

const deriveWebFrontendUrl = () => {
  const explicitWeb = trim(
    process.env.EXPO_PUBLIC_WEB_FRONTEND_URL ??
      Constants.expoConfig?.extra?.webFrontendUrl ??
      Constants.manifest?.extra?.webFrontendUrl
  );
  if (explicitWeb) return explicitWeb;
  if (isReleaseRuntime && !activeApiBaseUrl) return "";
  try {
    const parsed = new URL(activeApiBaseUrl);
    const host = parsed.hostname;
    const protocol = parsed.protocol || "http:";
    if (isReleaseRuntime) {
      return `${protocol}//${host}/`;
    }
    return `${protocol}//${host}:5500/web-frontend/index.html`;
  } catch (_err) {
    if (isReleaseRuntime) return "";
    return "http://127.0.0.1:5500/web-frontend/index.html";
  }
};

export const WEB_FRONTEND_URL =
  deriveWebFrontendUrl();

const normalizeRequestPath = (value) => `/${String(value || "").replace(/^\/+/, "")}`;
const looksLikeNetworkMessage = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes("network error") ||
    normalized.includes("fetch failed") ||
    normalized.includes("api unreachable") ||
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("socket hang up") ||
    normalized.includes("connection refused") ||
    normalized.includes("unable to reach api")
  );
};

export const isApiUnavailableError = (error) => {
  if (!error) return false;
  if (!error?.response && looksLikeNetworkMessage(error?.message || error)) {
    return true;
  }
  const status = Number(error?.response?.status || 0);
  if (status === 502 || status === 503 || status === 504) {
    return true;
  }
  return looksLikeNetworkMessage(error?.message || "");
};

const getDiagnosticCandidates = () =>
  [
    ...new Set(
      [
        activeApiBaseUrl,
        toggleApiBase(activeApiBaseUrl),
        ...API_BASE_CANDIDATES,
        ...API_BASE_CANDIDATES.map((candidate) => toggleApiBase(candidate)),
      ].filter(Boolean)
    ),
  ].sort((left, right) => scoreApiCandidate(right) - scoreApiCandidate(left));

export const runApiDiagnostics = async () => {
  const results = [];
  for (const candidate of getDiagnosticCandidates().slice(0, 10)) {
    try {
      const response = await axios.get(joinUrl(candidate, "health"), {
        timeout: 2500,
        headers: { Accept: "application/json" },
        transitional: { clarifyTimeoutError: true },
      });
      const ok = response?.status >= 200 && response?.status < 300;
      results.push({
        baseUrl: candidate,
        ok,
        status: Number(response?.status || 0),
        detail: response?.data?.status || response?.statusText || "reachable",
      });
      if (ok) {
        rememberActiveApiBase(candidate);
      }
    } catch (error) {
      results.push({
        baseUrl: candidate,
        ok: false,
        status: Number(error?.response?.status || 0),
        detail: formatDetail(error?.response?.data?.detail) || error?.message || "Unreachable",
      });
    }
  }

  return {
    activeBaseUrl: getActiveApiBaseUrl(),
    webFrontendUrl: WEB_FRONTEND_URL,
    reachable: results.some((entry) => entry.ok),
    results,
  };
};

export const repairApiConnection = async () => {
  const diagnostics = await runApiDiagnostics();
  if (!diagnostics.reachable) {
    throw new Error(`API is still unreachable at ${getActiveApiBaseUrl() || "the configured API URL"}. ${API_UNREACHABLE_HINT}`);
  }
  return diagnostics;
};

let authToken = null;

export const setAuthToken = (token) => {
  authToken = token || null;
};

const formatDetail = (detail) => {
  if (Array.isArray(detail)) {
    return detail
      .map((entry) => {
        if (typeof entry === "string") return entry;
        if (entry && typeof entry === "object") {
          const loc = Array.isArray(entry.loc) ? entry.loc.join(".") : "";
          const msg = String(entry.msg || "").trim();
          return loc && msg ? `${loc}: ${msg}` : msg || JSON.stringify(entry);
        }
        return String(entry || "");
      })
      .filter(Boolean)
      .join(" | ");
  }
  if (detail && typeof detail === "object") {
    return String(detail.msg || detail.error || JSON.stringify(detail));
  }
  return String(detail || "");
};

const API = axios.create({
  baseURL: activeApiBaseUrl,
  timeout: 30000,
});

const toggleApiBase = (base) => {
  const current = String(base || "").trim();
  if (!current) return "";
  try {
    const url = new URL(normalizeUrl(current));
    let path = trim(url.pathname || "");
    if (path.endsWith("/api")) {
      path = path.replace(/\/api\/?$/, "");
    } else {
      path = `${path}/api`;
    }
    const toggled = trim(`${url.origin}${path}`);
    return toggled || current;
  } catch (_err) {
    if (/\/api\/?$/.test(current)) {
      return current.replace(/\/api\/?$/, "");
    }
    return `${current}/api`.replace(/\/+api$/, "/api");
  }
};

API.interceptors.request.use(async (config) => {
  ensureApiBaseConfigured();
  if (!config.__skipBaseDiscovery && !/^https?:\/\//i.test(String(config.url || ""))) {
    await ensureReachableApiBase();
  }
  // Keep caller-provided baseURL (used by fallback retry).
  if (!config.baseURL) {
    config.baseURL = activeApiBaseUrl;
  }
  // Prevent leading slashes from dropping the /api path portion of baseURL.
  if (config.url && !/^https?:\/\//i.test(config.url)) {
    config.url = String(config.url).replace(/^\/+/, "");
  }
  if (authToken) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});

API.interceptors.response.use(
  (response) => {
    const resolvedBaseUrl = trim(response?.config?.baseURL || "");
    if (resolvedBaseUrl) {
      rememberActiveApiBase(resolvedBaseUrl);
    }
    return response;
  },
  async (error) => {
    const config = error?.config;
    const isNetworkFailure = !error?.response;
    const status = Number(error?.response?.status);
    const requestUrl = String(config?.url || "");
    const normalizedRequestUrl = normalizeRequestPath(requestUrl.split("?")[0]);
    const isAuthRequest = /^\/auth\//i.test(normalizedRequestUrl);
    const isRetryableGatewayError = status === 502 || status === 503 || status === 504;
    const isRetryableMissingRoute =
      status === 404 &&
      (normalizedRequestUrl === "/social/settings" ||
        normalizedRequestUrl === "/social/posts/saved" ||
        normalizedRequestUrl === "/social/posts/reposted" ||
        normalizedRequestUrl === "/video/publish-from-url" ||
        normalizedRequestUrl === "/video/mix-audio" ||
        /\/social\/posts\/\d+\/save$/.test(normalizedRequestUrl));

    // If server returns 405 (method not allowed), try toggling /api suffix once.
    if (config && status === 405 && !config.__apiPathToggled) {
      const toggled = toggleApiBase(config.baseURL || activeApiBaseUrl);
      if (toggled && toggled !== (config.baseURL || activeApiBaseUrl)) {
        try {
          config.__apiPathToggled = true;
          config.baseURL = toggled;
          const response = await API.request(config);
          rememberActiveApiBase(toggled);
          return response;
        } catch (retryError) {
          return Promise.reject(retryError);
        }
      }
    }

    // Retry once on the same public endpoint in case the backend was cold or a transient mobile network failure occurred.
    if (config && (isNetworkFailure || isRetryableGatewayError) && !config.__sameBaseRetried) {
      try {
        config.__sameBaseRetried = true;
        await delay(1200);
        return await API.request(config);
      } catch (retryError) {
        error = retryError;
      }
    }

    // Retry once across alternate local API endpoints if current base URL is unreachable.
    if (config && (isNetworkFailure || isRetryableMissingRoute || isRetryableGatewayError) && !config.__fallbackRetried) {
      config.__fallbackRetried = true;
      for (const candidate of API_BASE_CANDIDATES) {
        if (!candidate || candidate === activeApiBaseUrl) continue;
        try {
          config.baseURL = candidate;
          const response = await API.request(config);
          rememberActiveApiBase(candidate);
          return response;
        } catch (retryError) {
          if (retryError?.response) {
            return Promise.reject(retryError);
          }
        }
      }
    }

    if (status === 401 && authToken && !isAuthRequest) {
      authToken = null;
      try {
        await clearToken();
      } catch (_err) {
        // no-op
      }
      return Promise.reject(new Error("Session expired. Please login again."));
    }

    const statusText = Number(error?.response?.status);
    const message =
      formatDetail(error?.response?.data?.detail) ||
      formatDetail(error?.response?.data?.error) ||
      error?.message ||
      "Network request failed";
    const friendly =
      message === "Network Error" || String(message).toLowerCase().includes("fetch failed")
        ? `${message}. API unreachable at ${activeApiBaseUrl || "missing API URL configuration"}. ${API_UNREACHABLE_HINT}`
        : statusText >= 500
        ? `Server error (${statusText}). Please retry.`
        : message;
    return Promise.reject(new Error(friendly));
  }
);

export default API;

