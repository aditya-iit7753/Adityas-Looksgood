import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import API from "./services/api";
import { colors, fonts, radius } from "./theme";
import { BodyText, Card, Screen, Title } from "./ui";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const colorFromSeed = (seed) => {
  const text = String(seed || "looksgood");
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  // Keep it classy: medium saturation, bright enough for white text.
  return `hsl(${hue}, 70%, 55%)`;
};

export default function StyleDNAScreen() {
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");

  const auraText = useMemo(() => {
    const aura = Array.isArray(payload?.aura) ? payload.aura.filter(Boolean) : [];
    return aura.length ? aura.join(" · ") : "Tap refresh after you like/save a few looks.";
  }, [payload]);

  const gradient = useMemo(() => {
    const seed = (Array.isArray(payload?.aura) && payload.aura.join("-")) || "looksgood-style-dna";
    const primary = colorFromSeed(seed);
    const secondary = colorFromSeed(`${seed}-b`);
    return [primary, secondary];
  }, [payload]);

  const signals = useMemo(() => {
    const s = payload?.signals || {};
    return {
      likes: Number(s.likes || 0),
      saves: Number(s.saves || 0),
      shares: Number(s.shares || 0),
      comments: Number(s.comments || 0),
    };
  }, [payload]);

  const loadDna = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await API.get("/feed/style-dna", { params: { limit: 12 } });
      setPayload(res?.data || null);
    } catch (err) {
      setError(err?.message || "Could not load Style DNA");
    } finally {
      setLoading(false);
    }
  }, []);

  const onShare = useCallback(async () => {
    const top = Array.isArray(payload?.top) ? payload.top : [];
    const tags = top
      .slice(0, 8)
      .map((row) => `#${String(row?.tag || "").replace(/\s+/g, "").trim()}`)
      .filter((t) => t.length > 1)
      .join(" ");

    const message = [`My LooksGood Style DNA: ${auraText}`, tags, "Built from what I like, save, share, and comment on."]
      .filter(Boolean)
      .join("\n");

    try {
      await Share.share({ message });
    } catch (_err) {
      // ignore cancelled shares
    }
  }, [auraText, payload]);

  useEffect(() => {
    loadDna();
  }, [loadDna]);

  const topRows = Array.isArray(payload?.top) ? payload.top : [];
  const hasSignals = Object.values(signals).some((value) => value > 0);

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroKicker}>STYLE DNA</Text>
              <Title size={34}>
                <Text style={styles.heroTitle}>Your fingerprint</Text>
              </Title>
              <Text style={styles.heroAura} numberOfLines={2}>
                {auraText}
              </Text>
            </View>
            <Pressable onPress={loadDna} disabled={loading} style={[styles.heroIconBtn, loading && styles.disabledBtn]}>
              {loading ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="refresh-outline" size={18} color="#FFFFFF" />}
            </Pressable>
          </View>

          <View style={styles.metricRow}>
            <Metric label="Likes" value={signals.likes} />
            <Metric label="Saves" value={signals.saves} />
            <Metric label="Shares" value={signals.shares} />
            <Metric label="Comments" value={signals.comments} />
          </View>
        </LinearGradient>

        <View style={styles.body}>
          <Card>
            <Text style={styles.sectionTitle}>Transparent algorithm</Text>
            <BodyText>
              Style DNA is built from your real activity. Each tag shows which signals shaped it.
            </BodyText>
          </Card>

          <Card>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Top Tags</Text>
              <Pressable onPress={onShare} disabled={!topRows.length} style={[styles.shareBtn, (!topRows.length || loading) && styles.disabledBtn]}>
                <Ionicons name="share-social-outline" size={16} color={colors.text} />
                <Text style={styles.shareText}>Share</Text>
              </Pressable>
            </View>

            {!loading && !topRows.length ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyTitle}>No Style DNA yet</Text>
                <BodyText>Like or save a few looks, then tap refresh.</BodyText>
              </View>
            ) : null}

            {topRows.map((row) => (
              <View key={String(row?.tag || "")} style={styles.tagRow}>
                <View style={styles.tagLeft}>
                  <View style={styles.tagChip}>
                    <Text style={styles.tagChipText}>#{String(row?.tag || "").slice(0, 20)}</Text>
                  </View>
                  <Text style={styles.tagScore}>Score {clamp(Number(row?.score || 0), 0, 999)}</Text>
                </View>
                <View style={styles.tagSources}>
                  <SourcePill label="♥" value={row?.sources?.likes} />
                  <SourcePill label="🔖" value={row?.sources?.saves} />
                  <SourcePill label="↗" value={row?.sources?.shares} />
                  <SourcePill label="💬" value={row?.sources?.comments} />
                </View>
              </View>
            ))}
          </Card>

          {!hasSignals ? (
            <Card>
              <Text style={styles.sectionTitle}>Pro tip</Text>
              <BodyText>Like or save a few looks, then hit refresh. Your Style DNA updates instantly.</BodyText>
            </Card>
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

function Metric({ label, value }) {
  return (
    <View style={styles.metricPill}>
      <Text style={styles.metricValue}>{String(value || 0)}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function SourcePill({ label, value }) {
  const resolved = clamp(Number(value || 0), 0, 99);
  return (
    <View style={styles.sourcePill}>
      <Text style={styles.sourceText}>{label}</Text>
      <Text style={styles.sourceValue}>{String(resolved)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 22,
    gap: 14,
  },
  hero: {
    borderRadius: radius.xl,
    padding: 16,
    gap: 12,
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  heroKicker: {
    color: "rgba(255, 255, 255, 0.82)",
    fontFamily: fonts.body,
    fontWeight: "800",
    letterSpacing: 1.2,
    fontSize: 11,
  },
  heroTitle: {
    color: "#FFFFFF",
  },
  heroAura: {
    marginTop: 6,
    color: "rgba(255, 255, 255, 0.9)",
    fontFamily: fonts.body,
    fontWeight: "700",
    fontSize: 13,
    lineHeight: 18,
  },
  heroIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.22)",
  },
  body: {
    gap: 14,
  },
  metricRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metricPill: {
    flexGrow: 1,
    minWidth: 92,
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.22)",
    borderRadius: radius.lg,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  metricValue: {
    color: "#FFFFFF",
    fontFamily: fonts.display,
    fontWeight: "800",
    fontSize: 16,
  },
  metricLabel: {
    marginTop: 2,
    color: "rgba(255, 255, 255, 0.85)",
    fontFamily: fonts.body,
    fontWeight: "700",
    fontSize: 11,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: fonts.display,
    fontWeight: "800",
    fontSize: 16,
  },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.bgStrong,
    borderWidth: 1,
    borderColor: colors.border,
  },
  shareText: {
    color: colors.text,
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 12,
  },
  emptyWrap: {
    paddingTop: 10,
    gap: 8,
  },
  emptyTitle: {
    color: colors.text,
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 14,
  },
  tagRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  tagLeft: {
    flex: 1,
    gap: 4,
  },
  tagChip: {
    alignSelf: "flex-start",
    backgroundColor: colors.chip,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tagChipText: {
    color: colors.text,
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 12,
  },
  tagScore: {
    color: colors.subtext,
    fontFamily: fonts.body,
    fontWeight: "700",
    fontSize: 11,
  },
  tagSources: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  sourcePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.bgStrong,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sourceText: {
    fontSize: 12,
  },
  sourceValue: {
    color: colors.text,
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 11,
  },
  disabledBtn: {
    opacity: 0.55,
  },
});
