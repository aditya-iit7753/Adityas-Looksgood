import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BodyText, Card, PrimaryButton, Screen, Title } from "./ui";
import { colors, fonts, radius } from "./theme";
import { WEB_FRONTEND_URL, getActiveApiBaseUrl, getApiBaseCandidates, repairApiConnection, runApiDiagnostics } from "./services/api";

function formatCheckedAt(timestamp) {
  if (!timestamp) return "Not checked yet";
  try {
    return new Date(timestamp).toLocaleTimeString();
  } catch (_err) {
    return "Checked";
  }
}

export default function ConnectionCenterScreen({ navigation }) {
  const [loading, setLoading] = useState(false);
  const [snapshot, setSnapshot] = useState(() => ({
    activeBaseUrl: getActiveApiBaseUrl(),
    webFrontendUrl: WEB_FRONTEND_URL,
    reachable: false,
    results: [],
  }));
  const [lastCheckedAt, setLastCheckedAt] = useState(null);

  const loadDiagnostics = useCallback(async () => {
    setLoading(true);
    try {
      const next = await runApiDiagnostics();
      setSnapshot(next);
      setLastCheckedAt(Date.now());
    } catch (error) {
      Alert.alert("Connection check failed", error?.message || "Unable to test the API right now.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDiagnostics();
  }, [loadDiagnostics]);

  const healthyTarget = useMemo(() => snapshot.results.find((entry) => entry.ok)?.baseUrl || snapshot.activeBaseUrl, [snapshot]);
  const configuredCandidates = useMemo(() => {
    const known = getApiBaseCandidates();
    return [...new Set([snapshot.activeBaseUrl, ...known].filter(Boolean))];
  }, [snapshot.activeBaseUrl]);

  const repairConnection = async () => {
    setLoading(true);
    try {
      const repaired = await repairApiConnection();
      setSnapshot(repaired);
      setLastCheckedAt(Date.now());
      Alert.alert("Connection restored", `The app can reach ${repaired.activeBaseUrl}.`);
    } catch (error) {
      Alert.alert("Still unreachable", error?.message || "The configured API is still unreachable.");
    } finally {
      setLoading(false);
    }
  };

  const openWebFrontend = () => {
    const targetUrl = String(snapshot.webFrontendUrl || WEB_FRONTEND_URL || "").trim();
    if (!targetUrl) {
      Alert.alert("Unavailable", "Web frontend URL is not configured for this build.");
      return;
    }
    navigation.navigate("WebFrontend", { title: "LooksGood Web", url: targetUrl });
  };

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroBadge}>
            <Ionicons name={snapshot.reachable ? "cloud-done-outline" : "cloud-offline-outline"} size={18} color="#FFFFFF" />
          </View>
          <Title size={30}>Connection Center</Title>
          <BodyText style={styles.heroText}>
            Check which API URL the app is using, retry connection discovery, and jump into the web experience while we recover mobile access.
          </BodyText>
        </View>

        <Card>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionTitle}>Current API</Text>
            <View style={[styles.statusPill, snapshot.reachable ? styles.statusPillLive : styles.statusPillDown]}>
              <Text style={styles.statusPillText}>{snapshot.reachable ? "Reachable" : "Offline"}</Text>
            </View>
          </View>
          <Text style={styles.urlText}>{snapshot.activeBaseUrl || "No API URL configured"}</Text>
          <BodyText>Last checked: {formatCheckedAt(lastCheckedAt)}</BodyText>
          <View style={styles.buttonRow}>
            <View style={styles.buttonSlot}>
              <PrimaryButton title={loading ? "Checking..." : "Run Check"} onPress={loadDiagnostics} loading={loading} />
            </View>
            <Pressable onPress={repairConnection} style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}>
              <Ionicons name="refresh-outline" size={16} color={colors.text} />
              <Text style={styles.secondaryBtnText}>Retry Repair</Text>
            </Pressable>
          </View>
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Fallback Access</Text>
          <BodyText>
            If mobile API calls are flaky, you can still use the web frontend while we finish the backend or DNS fix.
          </BodyText>
          <Text style={styles.urlText}>{snapshot.webFrontendUrl || WEB_FRONTEND_URL || "Web frontend URL not configured"}</Text>
          <Pressable onPress={openWebFrontend} style={({ pressed }) => [styles.linkBtn, pressed && styles.secondaryBtnPressed]}>
            <Ionicons name="open-outline" size={16} color={colors.primary} />
            <Text style={styles.linkBtnText}>Open LooksGood Web</Text>
          </Pressable>
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Detected API Targets</Text>
          {configuredCandidates.map((candidate) => (
            <View key={candidate} style={styles.candidateRow}>
              <Ionicons name={candidate === healthyTarget ? "checkmark-circle" : "radio-button-off-outline"} size={16} color={candidate === healthyTarget ? colors.primary : colors.subtext} />
              <Text style={styles.candidateText}>{candidate}</Text>
            </View>
          ))}
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Latest Health Results</Text>
          {snapshot.results.length === 0 ? <BodyText>No health checks have run yet.</BodyText> : null}
          {snapshot.results.map((entry) => (
            <View key={entry.baseUrl} style={styles.resultRow}>
              <View style={[styles.resultDot, entry.ok ? styles.resultDotOk : styles.resultDotBad]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.resultUrl}>{entry.baseUrl}</Text>
                <BodyText style={styles.resultDetail}>
                  {entry.ok ? `Healthy (${entry.status || 200})` : entry.detail || "Unreachable"}
                </BodyText>
              </View>
            </View>
          ))}
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 12,
  },
  hero: {
    gap: 8,
  },
  heroBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3B3B3B",
  },
  heroText: {
    maxWidth: 520,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 15,
  },
  statusPill: {
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusPillLive: {
    backgroundColor: "#EDEDED",
  },
  statusPillDown: {
    backgroundColor: "#F5EAEA",
  },
  statusPillText: {
    color: colors.text,
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 11,
  },
  urlText: {
    color: colors.text,
    fontFamily: fonts.mono,
    fontSize: 12,
  },
  buttonRow: {
    gap: 10,
  },
  buttonSlot: {
    width: "100%",
  },
  secondaryBtn: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#F7F7F7",
    paddingVertical: 11,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  secondaryBtnPressed: {
    opacity: 0.88,
  },
  secondaryBtnText: {
    color: colors.text,
    fontFamily: fonts.body,
    fontWeight: "800",
  },
  linkBtn: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#DADADA",
    backgroundColor: "#FAFAFA",
    paddingVertical: 11,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  linkBtnText: {
    color: colors.primary,
    fontFamily: fonts.body,
    fontWeight: "800",
  },
  candidateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  candidateText: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.mono,
    fontSize: 12,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 6,
  },
  resultDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 5,
  },
  resultDotOk: {
    backgroundColor: "#222222",
  },
  resultDotBad: {
    backgroundColor: "#B5B5B5",
  },
  resultUrl: {
    color: colors.text,
    fontFamily: fonts.body,
    fontWeight: "700",
    fontSize: 12,
  },
  resultDetail: {
    fontSize: 12,
  },
});
