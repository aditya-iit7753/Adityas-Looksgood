import { useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, radius } from "./theme";

function sanitizeRoom(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export default function CallScreen({ route, navigation }) {
  const username = route?.params?.username || "creator";
  const mode = route?.params?.mode === "voice" ? "voice" : "video";
  const roomId = sanitizeRoom(route?.params?.roomId || `looksgood-room-${Date.now().toString(36)}`);
  const isVoice = mode === "voice";

  const callUrl = useMemo(() => {
    const base = `https://meet.jit.si/${roomId}`;
    if (isVoice) {
      return `${base}#config.prejoinPageEnabled=false&config.startWithVideoMuted=true&config.startAudioOnly=true&interfaceConfig.DISABLE_JOIN_LEAVE_NOTIFICATIONS=true`;
    }
    return `${base}#config.prejoinPageEnabled=false&config.startWithVideoMuted=false&interfaceConfig.DISABLE_JOIN_LEAVE_NOTIFICATIONS=true`;
  }, [isVoice, roomId]);

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back-outline" size={18} color="#FFFFFF" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{isVoice ? "Voice Call" : "Video Call"} · @{username}</Text>
          <Text style={styles.subTitle}>Room: {roomId}</Text>
        </View>
        <Pressable onPress={() => navigation.goBack()} style={styles.endBtn}>
          <Ionicons name="call-outline" size={16} color="#FFFFFF" />
          <Text style={styles.endBtnText}>End</Text>
        </Pressable>
      </View>

      <WebView
        source={{ uri: callUrl }}
        startInLoadingState
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        renderLoading={() => (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#181818",
  },
  topBar: {
    paddingTop: 42,
    paddingBottom: 10,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#262626",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.13)",
  },
  title: {
    color: "#FFFFFF",
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 14,
  },
  subTitle: {
    color: "rgba(255, 255, 255, 0.75)",
    fontFamily: fonts.body,
    fontSize: 11,
    marginTop: 1,
  },
  endBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: radius.pill,
    backgroundColor: "#5B5B5B",
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  endBtnText: {
    color: "#FFFFFF",
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 11,
  },
  loaderWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#171717",
  },
});
