import { Audio } from "expo-av";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from "react-native";
import API from "./services/api";
import { colors, fonts, radius } from "./theme";
import { BodyText, Card, Chip, Screen, Title } from "./ui";
import { useAgent } from "./agent/AgentContext";

const HEADER_TOP = Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 30 : 18;
const COMPOSER_LIFT = Platform.OS === "android" ? 52 : 38;
const HANDS_FREE_CHUNK_MS = 3800;
const WAKE_PHRASES = ["hey lsg", "hi lsg"];

const ALLOWED_ROUTES = new Set([
  "Feed",
  "Reels",
  "Discover",
  "Profile",
  "Chat",
  "ChatRoom",
  "Settings",
  "Upload",
  "Notifications",
  "AIAgent",
  "Trends",
  "AppAgent",
  "StyleDNA",
  "Generate",
  "CreatorChat",
  "CloseFriends",
  "ARFilters",
  "Avatar3D",
  "WebFrontend",
  "Preview",
]);

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

function actionPreview(actions) {
  const names = actions.map((entry) => safeString(entry?.type) || "unknown").filter(Boolean);
  return names.join(" -> ");
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

export default function AppAgentScreen({ navigation, route }) {
  const [autoRun, setAutoRun] = useState(false);
  const { handsFreeEnabled: handsFree, setHandsFreeEnabled: setHandsFree } = useAgent();
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(null);
  const [input, setInput] = useState("");
  const [log, setLog] = useState([]);
  const [pendingActions, setPendingActions] = useState([]);
  const [pendingFeatureSpec, setPendingFeatureSpec] = useState(null);
  const scrollRef = useRef(null);
  const handsFreeRef = useRef(false);
  const handsFreeLoopBusyRef = useRef(false);
  const handsFreeRecordingRef = useRef(null);

  const screenName = useMemo(() => String(route?.name || "AppAgent"), [route?.name]);

  useEffect(() => {
    if (!log.length) return;
    setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), 0);
  }, [log.length]);

  useEffect(() => {
    handsFreeRef.current = handsFree;
  }, [handsFree]);

  useEffect(() => {
    if (handsFree) return;
    const rec = handsFreeRecordingRef.current;
    if (!rec) return;

    const stop = async () => {
      try {
        await rec.stopAndUnloadAsync();
      } catch (_err) {
        // ignore
      } finally {
        handsFreeRecordingRef.current = null;
        setRecording(null);
      }
    };
    stop();
  }, [handsFree]);

  const pushLog = useCallback((item) => setLog((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, ...item }]), []);

  const extractWakeCommand = useCallback((transcript) => {
    const raw = safeString(transcript);
    const lower = raw.toLowerCase();
    for (const phrase of WAKE_PHRASES) {
      const idx = lower.indexOf(phrase);
      if (idx === -1) continue;
      return raw.slice(idx + phrase.length).trim();
    }
    return "";
  }, []);

  const executeAction = useCallback(
    async (action) => {
      if (!action || typeof action !== "object") return;
      const type = safeString(action.type).toLowerCase();

      if (type === "navigate") {
        const nextRoute = safeString(action.route);
        if (!nextRoute || !ALLOWED_ROUTES.has(nextRoute)) {
          pushLog({ role: "assistant", text: `I cannot open "${nextRoute || "that"}".` });
          return;
        }
        navigation.navigate(nextRoute);
        return;
      }

      if (type === "create_post" || type === "create_reel") {
        navigation.navigate("Upload");
        return;
      }

      if (type === "open_profile_photo") {
        navigation.navigate("Profile");
        return;
      }

      if (type === "update_bio") {
        const bio = safeString(action.bio);
        if (!bio) {
          pushLog({ role: "assistant", text: "Bio text is missing." });
          return;
        }
        const formData = new FormData();
        formData.append("display_name", "");
        formData.append("bio", bio);
        await API.post("/social/profile/update", formData, { headers: { "Content-Type": "multipart/form-data" } });
        pushLog({ role: "assistant", text: "Bio updated." });
        navigation.navigate("Profile");
        return;
      }

      if (type === "mark_notifications_read") {
        await API.post("/social/notifications/read-all");
        pushLog({ role: "assistant", text: "Notifications marked as read." });
        navigation.navigate("Notifications");
        return;
      }

      if (type === "follow_user") {
        const username = safeString(action.username);
        const user = await findUserByHandle(username);
        if (!user?.id) {
          pushLog({ role: "assistant", text: `I couldn't find ${username ? `@${username}` : "that user"}.` });
          return;
        }
        await API.post(`/social/follow/${user.id}`);
        pushLog({ role: "assistant", text: `Following @${user.username || username}.` });
        return;
      }

      if (type === "send_message") {
        const username = safeString(action.username);
        const message = safeString(action.message);
        const user = await findUserByHandle(username);
        if (!user?.id) {
          pushLog({ role: "assistant", text: `I couldn't find ${username ? `@${username}` : "that user"}.` });
          return;
        }
        if (message) {
          await API.post(`/social/chat/${user.id}`, { content: message });
        }
        navigation.navigate("ChatRoom", { userId: user.id, username: user.username });
        return;
      }

      if (type === "update_settings") {
        const payload = {};
        if (typeof action.is_private_account === "boolean") payload.is_private_account = action.is_private_account;
        if (typeof action.show_activity_status === "boolean") payload.show_activity_status = action.show_activity_status;
        if (typeof action.allow_message_requests === "boolean") payload.allow_message_requests = action.allow_message_requests;
        if (!Object.keys(payload).length) {
          pushLog({ role: "assistant", text: "No settings changes provided." });
          return;
        }
        await API.post("/social/settings", payload);
        pushLog({ role: "assistant", text: "Settings updated." });
        navigation.navigate("Settings");
        return;
      }

      if (type === "like_post" || type === "save_post" || type === "unsave_post" || type === "share_post" || type === "comment_post") {
        const postId = Number(action.post_id);
        if (!Number.isFinite(postId) || postId <= 0) {
          pushLog({ role: "assistant", text: "Post ID is missing for that action." });
          return;
        }

        if (type === "like_post") {
          await API.post(`/social/posts/${postId}/like`);
          pushLog({ role: "assistant", text: `Liked post ${postId}.` });
          return;
        }
        if (type === "save_post") {
          await API.post(`/social/posts/${postId}/save`);
          pushLog({ role: "assistant", text: `Saved post ${postId}.` });
          return;
        }
        if (type === "unsave_post") {
          await API.delete(`/social/posts/${postId}/save`);
          pushLog({ role: "assistant", text: `Removed post ${postId} from saved.` });
          return;
        }
        if (type === "share_post") {
          await API.post(`/social/posts/${postId}/share`);
          pushLog({ role: "assistant", text: `Shared post ${postId}.` });
          return;
        }
        if (type === "comment_post") {
          const comment = safeString(action.comment);
          if (!comment) {
            pushLog({ role: "assistant", text: "Comment text is missing." });
            return;
          }
          await API.post(`/social/posts/${postId}/comments`, { content: comment });
          pushLog({ role: "assistant", text: `Commented on post ${postId}.` });
          return;
        }
      }

      if (type === "propose_feature") {
        const title = safeString(action?.feature_spec?.title) || "New Feature";
        pushLog({ role: "assistant", text: `Feature draft ready: ${title}.` });
        navigation.navigate("AIAgent");
        return;
      }

      pushLog({ role: "assistant", text: "I understood the command but can't run that action yet." });
    },
    [navigation, pushLog]
  );

  const executeActions = useCallback(
    async (actions) => {
      const steps = Array.isArray(actions) ? actions.filter((entry) => entry && typeof entry === "object") : [];
      if (!steps.length) return;

      for (const action of steps) {
        try {
          await executeAction(action);
        } catch (err) {
          pushLog({ role: "assistant", text: err?.response?.data?.detail || err?.message || "Action step failed." });
        }
      }
    },
    [executeAction, pushLog]
  );

  const transcribeUri = useCallback(
    async (uri) => {
      const formData = new FormData();
      formData.append("audio", {
        uri,
        name: "lsg-command.m4a",
        type: guessAudioMime(uri),
      });

      try {
        const transcribeRes = await API.post("/ai/lsg/transcribe", formData, { headers: { "Content-Type": "multipart/form-data" } });
        return safeString(transcribeRes?.data?.transcript);
      } catch (err) {
        if (Number(err?.response?.status) === 402) {
          navigation.navigate("Paywall");
        }
        throw err;
      }
    },
    [navigation]
  );

  const runCommandText = useCallback(
    async (text) => {
      const clean = safeString(text);
      if (!clean) return;

      pushLog({ role: "user", text: clean });
      setBusy(true);
      setPendingActions([]);
      setPendingFeatureSpec(null);
      try {
        const res = await API.post("/ai/lsg/command", { text: clean, screen: screenName });
        const reply = safeString(res?.data?.reply) || "Done.";
        const actions = normalizeActionList(res?.data);
        const runnableActions = actions.filter((entry) => safeString(entry?.type).toLowerCase() !== "unknown");
        const featureSpec = res?.data?.feature_spec && typeof res?.data?.feature_spec === "object" ? res.data.feature_spec : null;
        pushLog({
          role: "assistant",
          text: reply,
          meta: {
            intent: res?.data?.intent,
            provider: res?.data?.provider,
            steps: Math.max(1, runnableActions.length || actions.length),
          },
        });

        if (featureSpec?.title) {
          pushLog({ role: "assistant", text: `Feature draft: ${featureSpec.title}` });
        }

        if (autoRun) {
          await executeActions(runnableActions);
        } else {
          setPendingActions(runnableActions);
          setPendingFeatureSpec(featureSpec);
        }
      } catch (err) {
        if (Number(err?.response?.status) === 402) {
          navigation.navigate("Paywall");
          return;
        }
        pushLog({ role: "assistant", text: err?.response?.data?.detail || err?.message || "Command failed." });
      } finally {
        setBusy(false);
      }
    },
    [autoRun, executeActions, navigation, pushLog, screenName]
  );

  const runCommandTextFast = useCallback(
    async (text) => {
      const clean = safeString(text);
      if (!clean) return;

      pushLog({ role: "user", text: clean });
      setBusy(true);
      setPendingActions([]);
      setPendingFeatureSpec(null);
      try {
        const res = await API.post("/ai/lsg/command", { text: clean, screen: screenName });
        const reply = safeString(res?.data?.reply) || "Done.";
        const actions = normalizeActionList(res?.data);
        const runnableActions = actions.filter((entry) => safeString(entry?.type).toLowerCase() !== "unknown");
        pushLog({
          role: "assistant",
          text: reply,
          meta: {
            intent: res?.data?.intent,
            provider: res?.data?.provider,
            steps: Math.max(1, runnableActions.length || actions.length),
          },
        });
        await executeActions(runnableActions);
      } catch (err) {
        if (Number(err?.response?.status) === 402) {
          navigation.navigate("Paywall");
          return;
        }
        pushLog({ role: "assistant", text: err?.response?.data?.detail || err?.message || "Command failed." });
      } finally {
        setBusy(false);
      }
    },
    [executeActions, navigation, pushLog, screenName]
  );

  const startHandsFreeChunk = useCallback(async () => {
    if (!handsFreeRef.current) return null;

    const perm = await Audio.requestPermissionsAsync();
    if (!perm.granted) return null;

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });

    const next = new Audio.Recording();
    await next.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    await next.startAsync();
    return next;
  }, []);

  const runHandsFreeLoopOnce = useCallback(async () => {
    if (!handsFreeRef.current) return;
    if (handsFreeLoopBusyRef.current) return;
    if (busy) return;
    if (recording) return;

    handsFreeLoopBusyRef.current = true;
    try {
      const rec = await startHandsFreeChunk();
      if (!rec) return;
      handsFreeRecordingRef.current = rec;
      setRecording(rec);

      await new Promise((resolve) => setTimeout(resolve, HANDS_FREE_CHUNK_MS));

      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      handsFreeRecordingRef.current = null;
      setRecording(null);
      if (!uri) return;
      if (!handsFreeRef.current) return;

      const transcript = await transcribeUri(uri);
      if (!transcript) return;

      const command = extractWakeCommand(transcript);
      if (!command) return;

      setAutoRun(true);
      await runCommandTextFast(command);
    } catch (_err) {
      handsFreeRecordingRef.current = null;
      setRecording(null);
    } finally {
      handsFreeLoopBusyRef.current = false;
    }
  }, [busy, extractWakeCommand, recording, runCommandTextFast, startHandsFreeChunk, transcribeUri]);

  useEffect(() => {
    if (!handsFree) return;

    let cancelled = false;
    const loop = async () => {
      while (!cancelled && handsFreeRef.current) {
        await runHandsFreeLoopOnce();
        await new Promise((resolve) => setTimeout(resolve, 260));
      }
    };
    loop();

    return () => {
      cancelled = true;
    };
  }, [handsFree, runHandsFreeLoopOnce]);

  const startRecording = useCallback(async () => {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission needed", "Allow microphone access to use voice commands.");
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      const next = new Audio.Recording();
      await next.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await next.startAsync();
      setRecording(next);
    } catch (err) {
      Alert.alert("Voice failed", err?.message || "Unable to start recording.");
      setRecording(null);
    }
  }, []);

  const stopRecording = useCallback(async () => {
    const active = recording;
    if (!active) return;
    setRecording(null);

    setBusy(true);
    try {
      await active.stopAndUnloadAsync();
      const uri = active.getURI();
      if (!uri) throw new Error("Audio recording missing");
      const transcript = await transcribeUri(uri);
      if (!transcript) {
        pushLog({ role: "assistant", text: "I couldn't transcribe that. Try typing the command." });
        return;
      }

      await runCommandText(transcript);
    } catch (err) {
      pushLog({ role: "assistant", text: err?.response?.data?.detail || err?.message || "Voice command failed." });
    } finally {
      setBusy(false);
    }
  }, [recording, pushLog, runCommandText, transcribeUri]);

  const runPending = useCallback(async () => {
    const actions = Array.isArray(pendingActions) ? pendingActions : [];
    if (!actions.length) return;
    setPendingActions([]);
    setPendingFeatureSpec(null);
    setBusy(true);
    try {
      await executeActions(actions);
    } catch (err) {
      pushLog({ role: "assistant", text: err?.response?.data?.detail || err?.message || "Action failed." });
    } finally {
      setBusy(false);
    }
  }, [executeActions, pendingActions, pushLog]);

  return (
    <Screen padded={false}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.header, { paddingTop: HEADER_TOP }]}>
        <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>AI Agent</Text>
          <Text style={styles.headerSub}>Type or speak commands to control the app</Text>
        </View>
        <Pressable onPress={() => setAutoRun((v) => !v)} style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}>
          <Ionicons name={autoRun ? "flash" : "flash-off"} size={18} color={autoRun ? colors.primary : colors.subtext} />
        </Pressable>
      </View>

      <View style={styles.toolsRow}>
        <Pressable onPress={() => setHandsFree(!handsFree)} style={({ pressed }) => [pressed && styles.pressed]}>
          <Chip bg={handsFree ? colors.text : colors.chip} color={handsFree ? colors.bg : colors.primary}>
            Hands-free: {handsFree ? "On" : "Off"}
          </Chip>
        </Pressable>
        <Pressable onPress={() => setAutoRun((v) => !v)} style={({ pressed }) => [pressed && styles.pressed]}>
          <Chip bg={autoRun ? colors.text : colors.chip} color={autoRun ? colors.bg : colors.primary}>
            Auto-run: {autoRun ? "On" : "Off"}
          </Chip>
        </Pressable>
        {handsFree ? (
          <Chip bg={recording ? colors.primary : colors.chip} color={recording ? colors.bg : colors.primary}>
            {recording ? "Listening..." : "Listening"}
          </Chip>
        ) : null}
        <Chip>Say: Hey LSG open reels then follow @name, or create a new feature for ...</Chip>
      </View>

      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={styles.chat} showsVerticalScrollIndicator={false}>
        {log.length === 0 ? (
          <Card>
            <Title size={22}>Try a command</Title>
            <BodyText>Examples: Open trends, Follow @alex, Set my bio to minimal streetwear lover, Message @alex hi.</BodyText>
          </Card>
        ) : null}

        {log.map((item) => (
          <View key={item.id} style={[styles.bubble, item.role === "user" ? styles.bubbleUser : styles.bubbleAssistant]}>
            <Text style={[styles.bubbleText, item.role === "user" ? styles.bubbleTextUser : styles.bubbleTextAssistant]}>{item.text}</Text>
            {item.meta?.provider ? <Text style={styles.metaText}>{`${String(item.meta.provider)} · ${Number(item.meta.steps || 1)} step(s)`}</Text> : null}
          </View>
        ))}

        {pendingActions.length ? (
          <Card style={{ gap: 10 }}>
            <Text style={styles.pendingTitle}>Ready to run plan</Text>
            <BodyText>{`Steps: ${pendingActions.length}`}</BodyText>
            <BodyText>{`Plan: ${actionPreview(pendingActions)}`}</BodyText>
            <View style={styles.pendingRow}>
              <Pressable
                onPress={() => {
                  setPendingActions([]);
                  setPendingFeatureSpec(null);
                }}
                disabled={busy}
                style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}>
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={runPending} disabled={busy} style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed, busy && styles.disabledBtn]}>
                <Text style={styles.primaryBtnText}>{busy ? "Running..." : "Run"}</Text>
              </Pressable>
            </View>
          </Card>
        ) : null}

        {pendingFeatureSpec?.title ? (
          <Card style={{ gap: 8 }}>
            <Text style={styles.pendingTitle}>Feature Draft</Text>
            <BodyText>{pendingFeatureSpec.title}</BodyText>
            <BodyText>{safeString(pendingFeatureSpec.proposal)}</BodyText>
          </Card>
        ) : null}

        <View style={{ height: 14 }} />
      </ScrollView>

      <View style={[styles.composer, { marginBottom: COMPOSER_LIFT }]}>
        <Pressable
          onPress={recording ? stopRecording : startRecording}
          disabled={busy || handsFree}
          style={({ pressed }) => [styles.micBtn, recording && styles.micBtnActive, pressed && styles.pressed, (busy || handsFree) && styles.disabledBtn]}>
          <Ionicons name={recording ? "stop" : "mic"} size={18} color={recording ? colors.bg : colors.text} />
        </Pressable>
        <TextInput value={input} onChangeText={setInput} placeholder="Type a command..." placeholderTextColor={colors.subtext} style={styles.input} />
        <Pressable
          onPress={async () => {
            const next = input;
            setInput("");
            await runCommandText(next);
          }}
          disabled={busy || !safeString(input)}
          style={({ pressed }) => [styles.sendBtn, pressed && styles.pressed, (busy || !safeString(input)) && styles.disabledBtn]}>
          <Ionicons name="send" size={16} color={colors.bg} />
        </Pressable>
      </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 10,
    backgroundColor: colors.bg,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerTitle: { fontFamily: fonts.display, fontWeight: "900", fontSize: 22, color: colors.text },
  headerSub: { fontFamily: fonts.body, fontSize: 12.5, color: colors.subtext, marginTop: 2 },
  pressed: { opacity: 0.78 },
  toolsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
  chat: { paddingHorizontal: 16, paddingBottom: 10, gap: 10 },
  bubble: { maxWidth: "92%", borderRadius: 16, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1 },
  bubbleUser: { alignSelf: "flex-end", backgroundColor: colors.text, borderColor: colors.text },
  bubbleAssistant: { alignSelf: "flex-start", backgroundColor: colors.card, borderColor: colors.border },
  bubbleText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 19 },
  bubbleTextUser: { color: colors.bg, fontWeight: "800" },
  bubbleTextAssistant: { color: colors.text, fontWeight: "700" },
  metaText: { marginTop: 6, fontSize: 11, color: colors.subtext, fontFamily: fonts.body },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  micBtn: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  micBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  input: {
    flex: 1,
    minHeight: 42,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    color: colors.text,
    backgroundColor: colors.card,
    fontFamily: fonts.body,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  disabledBtn: { opacity: 0.5 },
  pendingTitle: { fontFamily: fonts.display, fontWeight: "900", color: colors.text, fontSize: 16 },
  pendingRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  primaryBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 11,
  },
  primaryBtnPressed: { opacity: 0.9 },
  primaryBtnText: { color: colors.bg, fontFamily: fonts.body, fontWeight: "900" },
  secondaryBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryBtnPressed: { opacity: 0.88 },
  secondaryBtnText: { color: colors.text, fontFamily: fonts.body, fontWeight: "900" },
});
