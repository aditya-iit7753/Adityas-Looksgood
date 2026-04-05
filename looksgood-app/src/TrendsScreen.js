import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from "react-native";
import { colors, fonts, radius } from "./theme";
import { BodyText, Card, Chip, Screen, Title } from "./ui";

const ALERTS_KEY = "looksgood.app.trends.alerts.v1";
const SAVED_TRENDS_KEY = "looksgood.app.trends.saved.v1";
const UPCOMING_REMINDERS_KEY = "looksgood.app.trends.reminders.v1";

const HEADER_TOP = Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 30 : 18;

const TRENDING = [
  {
    id: "quiet-luxury",
    icon: "diamond-outline",
    title: "Quiet Luxury",
    subtitle: "Minimal, premium basics with perfect fit.",
    tags: ["tailored", "neutral", "quality"],
    prompt: "Build a Quiet Luxury capsule wardrobe: 10 outfits for 7 days, with color palette, fabrics, and 3 shopping keywords per item.",
  },
  {
    id: "sporty-chic",
    icon: "tennisball-outline",
    title: "Sporty Chic",
    subtitle: "Athleisure + structured layers for daily wear.",
    tags: ["athleisure", "layers", "sneakers"],
    prompt: "Create 8 Sporty Chic outfits for daily wear with layering tips and 2 accessory options each.",
  },
  {
    id: "denim-max",
    icon: "shirt-outline",
    title: "Denim Maxing",
    subtitle: "Denim-on-denim done clean (not costume).",
    tags: ["double denim", "wash mix", "boots"],
    prompt: "Generate 6 denim-on-denim outfit formulas (top+bottom) with how to mix washes and avoid clashing.",
  },
  {
    id: "clean-girl",
    icon: "sparkles-outline",
    title: "Clean Girl 2.0",
    subtitle: "Polished basics + subtle statement details.",
    tags: ["polished", "gold", "slick hair"],
    prompt: "Create a Clean Girl 2.0 styling guide with 5 outfit templates and the key details that make it look expensive.",
  },
  {
    id: "techwear-lite",
    icon: "rocket-outline",
    title: "Techwear Lite",
    subtitle: "Functional fabrics without looking tactical.",
    tags: ["utility", "lightweight", "monochrome"],
    prompt: "Make 7 Techwear Lite outfits for warm weather: breathable pieces, functional pockets, and minimal silhouettes.",
  },
];

function daysUntil(dateValue) {
  const start = new Date();
  const end = new Date(dateValue);
  const ms = end.getTime() - start.getTime();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

function safeJsonParse(value, fallback) {
  try {
    if (!value) return fallback;
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export default function TrendsScreen({ navigation }) {
  const [tab, setTab] = useState("trending");
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [savedTrendIds, setSavedTrendIds] = useState(() => new Set());
  const [reminderIds, setReminderIds] = useState(() => new Set());

  const upcoming = useMemo(() => {
    const now = Date.now();
    return [
      { id: "drop-eco", icon: "leaf-outline", title: "Sustainable Drop", date: new Date(now + 8 * 86400000), subtitle: "Low-impact fabrics + minimal packaging." },
      { id: "event-runway", icon: "walk-outline", title: "Runway Recap Night", date: new Date(now + 14 * 86400000), subtitle: "Best looks + how to recreate them." },
      { id: "challenge-7day", icon: "trophy-outline", title: "7-Day Outfit Challenge", date: new Date(now + 21 * 86400000), subtitle: "One base piece, 7 different vibes." },
    ];
  }, []);

  useEffect(() => {
    const load = async () => {
      const alertsRaw = await AsyncStorage.getItem(ALERTS_KEY);
      if (alertsRaw != null) setAlertsEnabled(alertsRaw === "true");

      const savedRaw = await AsyncStorage.getItem(SAVED_TRENDS_KEY);
      const savedArr = safeJsonParse(savedRaw, []);
      if (Array.isArray(savedArr)) setSavedTrendIds(new Set(savedArr.map(String)));

      const remindersRaw = await AsyncStorage.getItem(UPCOMING_REMINDERS_KEY);
      const reminderArr = safeJsonParse(remindersRaw, []);
      if (Array.isArray(reminderArr)) setReminderIds(new Set(reminderArr.map(String)));
    };
    load();
  }, []);

  const persistSaved = useCallback(async (nextSet) => {
    const arr = Array.from(nextSet);
    await AsyncStorage.setItem(SAVED_TRENDS_KEY, JSON.stringify(arr));
  }, []);

  const persistReminders = useCallback(async (nextSet) => {
    const arr = Array.from(nextSet);
    await AsyncStorage.setItem(UPCOMING_REMINDERS_KEY, JSON.stringify(arr));
  }, []);

  const toggleAlerts = useCallback(async () => {
    const next = !alertsEnabled;
    setAlertsEnabled(next);
    await AsyncStorage.setItem(ALERTS_KEY, String(next));
  }, [alertsEnabled]);

  const openInStudio = useCallback(
    (presetPrompt) => {
      navigation.navigate("AIAgent", { presetPrompt, presetMode: "content" });
    },
    [navigation]
  );

  const toggleSaved = useCallback(
    async (id) => {
      const next = new Set(savedTrendIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSavedTrendIds(next);
      await persistSaved(next);
    },
    [persistSaved, savedTrendIds]
  );

  const toggleReminder = useCallback(
    async (id) => {
      const next = new Set(reminderIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setReminderIds(next);
      await persistReminders(next);
    },
    [persistReminders, reminderIds]
  );

  return (
    <Screen padded={false}>
      <View style={[styles.header, { paddingTop: HEADER_TOP }]}>
        <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Trends</Text>
          <Text style={styles.headerSub}>Upcoming vibes, drops, and AI-ready ideas</Text>
        </View>
        <Pressable onPress={toggleAlerts} style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}>
          <Ionicons name={alertsEnabled ? "notifications" : "notifications-off"} size={20} color={alertsEnabled ? colors.primary : colors.subtext} />
        </Pressable>
      </View>

      <View style={styles.tabsRow}>
        <Pressable onPress={() => setTab("trending")} style={[styles.tab, tab === "trending" && styles.tabActive]}>
          <Text style={[styles.tabText, tab === "trending" && styles.tabTextActive]}>Trending</Text>
        </Pressable>
        <Pressable onPress={() => setTab("upcoming")} style={[styles.tab, tab === "upcoming" && styles.tabActive]}>
          <Text style={[styles.tabText, tab === "upcoming" && styles.tabTextActive]}>Upcoming</Text>
        </Pressable>
        <Pressable onPress={() => setTab("advanced")} style={[styles.tab, tab === "advanced" && styles.tabActive]}>
          <Text style={[styles.tabText, tab === "advanced" && styles.tabTextActive]}>Advanced</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {tab === "trending" && (
          <View style={{ gap: 12 }}>
            <Card>
              <Title size={24}>Trend Radar</Title>
              <BodyText>Tap a trend to open it in Creative Studio with an optimized prompt.</BodyText>
            </Card>

            {TRENDING.map((item) => {
              const saved = savedTrendIds.has(item.id);
              return (
                <Card key={item.id} style={{ gap: 12 }}>
                  <View style={styles.row}>
                    <View style={styles.iconBubble}>
                      <Ionicons name={item.icon} size={18} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>{item.title}</Text>
                      <Text style={styles.cardSub}>{item.subtitle}</Text>
                    </View>
                    <Pressable onPress={() => toggleSaved(item.id)} style={({ pressed }) => [styles.miniBtn, pressed && styles.pressed]}>
                      <Ionicons name={saved ? "bookmark" : "bookmark-outline"} size={18} color={saved ? colors.primary : colors.subtext} />
                    </Pressable>
                  </View>

                  <View style={styles.tagsRow}>
                    {item.tags.map((tag) => (
                      <Chip key={`${item.id}-${tag}`}>{tag}</Chip>
                    ))}
                  </View>

                  <View style={styles.actionsRow}>
                    <Pressable onPress={() => openInStudio(item.prompt)} style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}>
                      <Ionicons name="sparkles" size={16} color={colors.bg} />
                      <Text style={styles.primaryBtnText}>Open in Studio</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => navigation.navigate("Chat")}
                      style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}>
                      <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.text} />
                      <Text style={styles.secondaryBtnText}>Discuss</Text>
                    </Pressable>
                  </View>
                </Card>
              );
            })}
          </View>
        )}

        {tab === "upcoming" && (
          <View style={{ gap: 12 }}>
            <Card>
              <Title size={24}>Drops & Events</Title>
              <BodyText>Turn on reminders to keep up with the next wave.</BodyText>
              <View style={{ marginTop: 6 }}>
                <Chip color={alertsEnabled ? colors.primary : colors.subtext} bg={alertsEnabled ? colors.chip : "#EFEFEF"}>
                  Alerts: {alertsEnabled ? "On" : "Off"}
                </Chip>
              </View>
            </Card>

            {upcoming.map((item) => {
              const d = daysUntil(item.date);
              const enabled = reminderIds.has(item.id);
              return (
                <Card key={item.id} style={{ gap: 12 }}>
                  <View style={styles.row}>
                    <View style={styles.iconBubble}>
                      <Ionicons name={item.icon} size={18} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>{item.title}</Text>
                      <Text style={styles.cardSub}>{item.subtitle}</Text>
                    </View>
                    <Chip>{d === 0 ? "Today" : `${d}d`}</Chip>
                  </View>

                  <View style={styles.actionsRow}>
                    <Pressable
                      onPress={() => toggleReminder(item.id)}
                      style={({ pressed }) => [styles.secondaryBtn, enabled && styles.secondaryBtnActive, pressed && styles.secondaryBtnPressed]}>
                      <Ionicons name={enabled ? "alarm" : "alarm-outline"} size={16} color={enabled ? colors.bg : colors.text} />
                      <Text style={[styles.secondaryBtnText, enabled && { color: colors.bg }]}>Reminder</Text>
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        openInStudio(
                          `Plan an outfit for "${item.title}" with 3 styling options, color palette, and a shopping list. Keep it realistic and wearable.`
                        )
                      }
                      style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}>
                      <Ionicons name="sparkles" size={16} color={colors.bg} />
                      <Text style={styles.primaryBtnText}>Prep Looks</Text>
                    </Pressable>
                  </View>
                </Card>
              );
            })}
          </View>
        )}

        {tab === "advanced" && (
          <View style={{ gap: 12 }}>
            <Card>
              <Title size={24}>Next-Gen Features</Title>
              <BodyText>Fast shortcuts to the most advanced tools already inside the app.</BodyText>
            </Card>

            <Card style={{ gap: 10 }}>
              <Text style={styles.cardTitle}>AI Trend Predictor</Text>
              <BodyText>Generate a weekly trend report + outfit angles that fit your style.</BodyText>
              <Pressable
                onPress={() =>
                  openInStudio(
                    "Act as a fashion trend analyst. Create a weekly trend report with 5 trends, why they matter, who they suit, and 2 outfit ideas per trend."
                  )
                }
                style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}>
                <Ionicons name="sparkles" size={16} color={colors.bg} />
                <Text style={styles.primaryBtnText}>Generate Report</Text>
              </Pressable>
            </Card>

            <Card style={{ gap: 10 }}>
              <Text style={styles.cardTitle}>AR & Avatar Studio</Text>
              <BodyText>Try filters, explore 3D looks, and build your personal styling identity.</BodyText>
              <View style={styles.actionsRow}>
                <Pressable onPress={() => navigation.navigate("ARFilters")} style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}>
                  <Ionicons name="color-filter-outline" size={16} color={colors.text} />
                  <Text style={styles.secondaryBtnText}>AR Filters</Text>
                </Pressable>
                <Pressable onPress={() => navigation.navigate("Avatar3D")} style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}>
                  <Ionicons name="person-outline" size={16} color={colors.text} />
                  <Text style={styles.secondaryBtnText}>3D Avatar</Text>
                </Pressable>
              </View>
            </Card>

            <Card style={{ gap: 10 }}>
              <Text style={styles.cardTitle}>Style DNA Upgrade</Text>
              <BodyText>Lock your signature style and keep recommendations consistent.</BodyText>
              <Pressable onPress={() => navigation.navigate("StyleDNA")} style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}>
                <Ionicons name="finger-print-outline" size={16} color={colors.text} />
                <Text style={styles.secondaryBtnText}>Open Style DNA</Text>
              </Pressable>
            </Card>
          </View>
        )}

        <View style={{ height: 18 }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
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
  pressed: { opacity: 0.75 },
  tabsRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  tab: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    paddingVertical: 9,
    alignItems: "center",
  },
  tabActive: { backgroundColor: colors.text, borderColor: colors.text },
  tabText: { fontFamily: fonts.body, fontWeight: "800", color: colors.text, fontSize: 12.5 },
  tabTextActive: { color: colors.bg },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.chip,
  },
  cardTitle: { fontFamily: fonts.display, fontWeight: "900", fontSize: 16, color: colors.text },
  cardSub: { fontFamily: fonts.body, fontSize: 13, color: colors.subtext, marginTop: 2 },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actionsRow: { flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "space-between" },
  primaryBtn: {
    flex: 1,
    flexDirection: "row",
    gap: 8,
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
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryBtnActive: { backgroundColor: colors.text, borderColor: colors.text },
  secondaryBtnPressed: { opacity: 0.88 },
  secondaryBtnText: { color: colors.text, fontFamily: fonts.body, fontWeight: "900" },
  miniBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
