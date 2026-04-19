import { Audio } from "expo-av";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, StatusBar, StyleSheet, Text, View } from "react-native";
import API from "./services/api";
import { colors, fonts, radius } from "./theme";
import { useAgent } from "./agent/AgentContext";

const CHUNK_MS = 3600;
const LOOP_PAUSE_MS = 280;
const WAKE_PHRASES = ["hey lsg", "hi lsg"];

const FLOAT_TOP = Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 10 : 12;

function safeString(value) {
  return String(value || "").trim();
}

function normalizeActionList(payload) {
  const list = Array.isArray(payload?.actions) ? payload.actions : [];
  if (list.length) {
    return list.filter((entry) => entry && typeof entry === "object").slice(0, 5);
  }
  if (payload?.action && typeof payload.action === "object") {
    return [payload.action];
  }
  return [{ type: "unknown" }];
}

function guessAudioMime(uri) {
  const value = String(uri || "").toLowerCase();
  if (value.endsWith(".m4a")) return "audio/m4a";
  if (value.endsWith(".wav")) return "audio/wav";
  if (value.endsWith(".aac")) return "audio/aac";
  if (value.endsWith(".mp3")) return "audio/mpeg";
  if (value.endsWith(".ogg")) return "audio/ogg";
  if (value.endsWith(".3gp")) return "audio/3gpp";
  return "audio/m4a";
}

function extractWakeCommand(transcript) {
  const raw = safeString(transcript);
  const lower = raw.toLowerCase();
  for (const phrase of WAKE_PHRASES) {
    const idx = lower.indexOf(phrase);
    if (idx === -1) continue;
    return raw.slice(idx + phrase.length).trim();
  }
  return "";
}

async function findUserByHandle(handle) {
  const q = safeString(handle).replace(/^@/, "");
  if (!q) return null;
  const res = await API.get("/social/users", { params: { q } });
  const rows = Array.isArray(res?.data) ? res.data : [];
  const best =
    rows.find((x) => String(x?.username || "").toLowerCase() === q.toLowerCase()) ||
    rows.find((x) => String(x?.email || "").toLowerCase().startsWith(q.toLowerCase())) ||
    rows[0];
  return best || null;
}

export default function GlobalVoiceAgent({ navigationRef, enabled = true }) {
  const { ready, handsFreeEnabled, setHandsFreeEnabled } = useAgent();
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState("");
  const recordingRef = useRef(null);
  const loopBusyRef = useRef(false);
  const enabledRef = useRef(false);

  useEffect(() => {
    enabledRef.current = handsFreeEnabled;
  }, [handsFreeEnabled]);

  const canRunHere = useCallback(() => {
    try {
      const current = navigationRef?.getCurrentRoute?.();
      const routeName = String(current?.name || "");
      // Avoid double-listening when AI Agent screen is open; it already supports hands-free.
      if (routeName === "AppAgent") return false;
      return true;
    } catch {
      return true;
    }
  }, [navigationRef]);

  const stopActiveRecording = useCallback(async () => {
    const rec = recordingRef.current;
    recordingRef.current = null;
    setListening(false);
    if (!rec) return;
    try {
      await rec.stopAndUnloadAsync();
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (handsFreeEnabled) return;
    stopActiveRecording();
    setBusy(false);
  }, [handsFreeEnabled, stopActiveRecording]);

  useEffect(() => {
    if (enabled) return;
    if (!handsFreeEnabled) return;
    setHandsFreeEnabled(false);
  }, [enabled, handsFreeEnabled, setHandsFreeEnabled]);

  const transcribeUri = useCallback(async (uri) => {
    const formData = new FormData();
    formData.append("audio", { uri, name: "lsg-command.m4a", type: guessAudioMime(uri) });
    const res = await API.post("/ai/lsg/transcribe", formData, { headers: { "Content-Type": "multipart/form-data" } });
    return safeString(res?.data?.transcript);
  }, []);

  const executeAction = useCallback(
    async (action) => {
      const type = safeString(action?.type).toLowerCase();
      if (!type) return;

      if (type === "navigate") {
        const route = safeString(action?.route);
        if (!route) return;
        if (navigationRef?.isReady?.() && navigationRef?.navigate) {
          navigationRef.navigate(route);
        }
        return;
      }

      if (type === "create_post" || type === "create_reel") {
        if (navigationRef?.isReady?.() && navigationRef?.navigate) {
          navigationRef.navigate("Upload");
        }
        return;
      }

      if (type === "open_profile_photo") {
        if (navigationRef?.isReady?.() && navigationRef?.navigate) {
          navigationRef.navigate("Profile");
        }
        return;
      }

      if (type === "mark_notifications_read") {
        await API.post("/social/notifications/read-all");
        if (navigationRef?.isReady?.() && navigationRef?.navigate) {
          navigationRef.navigate("Notifications");
        }
        return;
      }

      if (type === "update_bio") {
        const bio = safeString(action?.bio);
        if (!bio) return;
        const formData = new FormData();
        formData.append("display_name", "");
        formData.append("bio", bio);
        await API.post("/social/profile/update", formData, { headers: { "Content-Type": "multipart/form-data" } });
        return;
      }

      if (type === "update_settings") {
        const payload = {};
        if (typeof action?.is_private_account === "boolean") payload.is_private_account = action.is_private_account;
        if (typeof action?.show_activity_status === "boolean") payload.show_activity_status = action.show_activity_status;
        if (typeof action?.allow_message_requests === "boolean") payload.allow_message_requests = action.allow_message_requests;
        if (Object.keys(payload).length) {
          await API.post("/social/settings", payload);
        }
        return;
      }

      if (type === "follow_user") {
        const username = safeString(action?.username);
        const user = await findUserByHandle(username);
        if (!user?.id) return;
        await API.post(`/social/follow/${user.id}`);
        return;
      }

      if (type === "send_message") {
        const username = safeString(action?.username);
        const message = safeString(action?.message);
        const user = await findUserByHandle(username);
        if (!user?.id) return;
        if (message) {
          await API.post(`/social/chat/${user.id}`, { content: message });
        }
        if (navigationRef?.isReady?.() && navigationRef?.navigate) {
          navigationRef.navigate("ChatRoom", { userId: user.id, username: user.username });
        }
        return;
      }

      if (type === "like_post" || type === "save_post" || type === "unsave_post" || type === "share_post" || type === "comment_post") {
        const postId = Number(action?.post_id);
        if (!Number.isFinite(postId) || postId <= 0) return;

        if (type === "like_post") {
          await API.post(`/social/posts/${postId}/like`);
          return;
        }
        if (type === "save_post") {
          await API.post(`/social/posts/${postId}/save`);
          return;
        }
        if (type === "unsave_post") {
          await API.delete(`/social/posts/${postId}/save`);
          return;
        }
        if (type === "share_post") {
          await API.post(`/social/posts/${postId}/share`);
          return;
        }
        if (type === "comment_post") {
          const comment = safeString(action?.comment);
          if (!comment) return;
          await API.post(`/social/posts/${postId}/comments`, { content: comment });
          return;
        }
      }

      if (type === "propose_feature") {
        if (navigationRef?.isReady?.() && navigationRef?.navigate) {
          navigationRef.navigate("AppAgent");
        }
      }
    },
    [navigationRef]
  );

  const executeActions = useCallback(
    async (actions) => {
      const steps = Array.isArray(actions) ? actions.filter((entry) => entry && typeof entry === "object") : [];
      if (!steps.length) return;
      for (const action of steps) {
        try {
          await executeAction(action);
        } catch {
          // ignore failures and continue remaining steps
        }
      }
    },
    [executeAction]
  );

  const runLoopOnce = useCallback(async () => {
    if (!enabled) return;
    if (!enabledRef.current) return;
    if (!canRunHere()) return;
    if (loopBusyRef.current) return;
    if (busy) return;

    loopBusyRef.current = true;
    setBusy(true);
    setStatusText("Listening...");

    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        setStatusText("Mic permission needed");
        await setHandsFreeEnabled(false);
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      recordingRef.current = rec;
      setListening(true);

      await new Promise((resolve) => setTimeout(resolve, CHUNK_MS));

      const active = recordingRef.current;
      recordingRef.current = null;
      setListening(false);
      if (!active) return;

      await active.stopAndUnloadAsync();
      const uri = active.getURI();
      if (!uri) return;
      if (!enabledRef.current) return;

      setStatusText("Thinking...");
      const transcript = await transcribeUri(uri);
      if (!transcript) {
        setStatusText("");
        return;
      }

      const command = extractWakeCommand(transcript);
      if (!command) {
        setStatusText("");
        return;
      }

      const res = await API.post("/ai/lsg/command", { text: command, screen: "global" });
      const reply = safeString(res?.data?.reply) || "Done.";
      const actions = normalizeActionList(res?.data);
      const runnableActions = actions.filter((entry) => safeString(entry?.type).toLowerCase() !== "unknown");
      setStatusText(runnableActions.length > 1 ? `${reply} (${runnableActions.length} steps)` : reply);
      await executeActions(runnableActions);
    } catch (_err) {
      setStatusText("");
    } finally {
      setBusy(false);
      loopBusyRef.current = false;
    }
  }, [busy, canRunHere, enabled, executeActions, setHandsFreeEnabled, transcribeUri]);

  useEffect(() => {
    if (!enabled || !ready || !handsFreeEnabled) return;

    let cancelled = false;
    const loop = async () => {
      while (!cancelled && enabledRef.current) {
        await runLoopOnce();
        await new Promise((resolve) => setTimeout(resolve, LOOP_PAUSE_MS));
      }
    };
    loop();
    return () => {
      cancelled = true;
    };
  }, [enabled, handsFreeEnabled, ready, runLoopOnce]);

  const pill = useMemo(() => {
    if (!enabled || !handsFreeEnabled) return null;
    const label = statusText || (listening ? "Listening..." : "Hands-free on");
    return (
      <View style={[styles.pill, { top: FLOAT_TOP }]}>
        <Ionicons name={listening ? "mic" : "sparkles"} size={14} color={colors.bg} />
        <Text numberOfLines={1} style={styles.pillText}>
          {label}
        </Text>
        <Pressable onPress={() => setHandsFreeEnabled(false)} style={({ pressed }) => [styles.pillStop, pressed && styles.pressed]}>
          <Ionicons name="close" size={14} color={colors.bg} />
        </Pressable>
      </View>
    );
  }, [enabled, handsFreeEnabled, listening, setHandsFreeEnabled, statusText]);

  return pill;
}

const styles = StyleSheet.create({
  pill: {
    position: "absolute",
    right: 12,
    maxWidth: 290,
    backgroundColor: colors.text,
    borderRadius: radius.pill,
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  pillText: { color: colors.bg, fontFamily: fonts.body, fontWeight: "800", fontSize: 12, flexShrink: 1 },
  pillStop: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  pressed: { opacity: 0.78 },
});
