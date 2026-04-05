import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import API from "./services/api";
import { colors, fonts, radius } from "./theme";
import { BodyText, Screen, Title } from "./ui";

export default function NotificationsScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const introAnim = useRef(new Animated.Value(0)).current;
  const { height } = useWindowDimensions();
  const compact = height < 760;

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get("/social/notifications");
      setItems(Array.isArray(res.data) ? res.data : []);
      await API.post("/social/notifications/read-all");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    Animated.timing(introAnim, {
      toValue: 1,
      duration: 520,
      useNativeDriver: true,
    }).start();
  }, [introAnim]);

  const onOpen = (item) => {
    if (item?.actor_user_id) {
      navigation.navigate("Profile", { userId: item.actor_user_id });
      return;
    }
    if (item?.ref_post_id) {
      navigation.navigate("Comments", { post: { id: item.ref_post_id, caption: "Post" } });
    }
  };

  const getTypeIcon = (type) => {
    const value = String(type || "").toLowerCase();
    if (value.includes("like")) return "heart-outline";
    if (value.includes("comment")) return "chatbubble-ellipses-outline";
    if (value.includes("follow")) return "person-add-outline";
    if (value.includes("message")) return "mail-outline";
    if (value.includes("share")) return "paper-plane-outline";
    return "notifications-outline";
  };

  const counts = useMemo(() => {
    const unread = items.filter((item) => !item.is_read).length;
    return { total: items.length, unread };
  }, [items]);

  const headerTranslateY = introAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });

  return (
    <Screen padded={false}>
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        refreshing={loading}
        onRefresh={loadItems}
        contentContainerStyle={[styles.listContent, compact && styles.listContentCompact]}
        ListHeaderComponent={
          <View style={[styles.headerBlock, compact && styles.headerBlockCompact]}>
            <Animated.View style={{ opacity: introAnim, transform: [{ translateY: headerTranslateY }] }}>
              <LinearGradient
                colors={["#373737", "#6D6D6D", "#959595"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.heroCard, compact && styles.heroCardCompact]}>
                <View style={styles.heroTopRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.heroKicker}>NOTIFICATIONS</Text>
                    <Title size={30}>
                      <Text style={styles.heroTitle}>Stay in the loop</Text>
                    </Title>
                    <BodyText style={styles.heroSub}>Track follows, likes, comments, and creator activity in one place.</BodyText>
                  </View>
                  <Pressable onPress={loadItems} style={styles.refreshBtn}>
                    <Ionicons name="refresh-outline" size={18} color="#363636" />
                  </Pressable>
                </View>

                <View style={[styles.metricRow, compact && styles.metricRowCompact]}>
                  <Metric icon="notifications-outline" label="Total" value={String(counts.total)} />
                  <Metric icon="sparkles-outline" label="Unread" value={String(counts.unread)} />
                  <Metric icon="checkmark-done-outline" label="Status" value={loading ? "Sync" : "Live"} />
                </View>
              </LinearGradient>
            </Animated.View>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.loaderWrap}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <BodyText>No notifications yet.</BodyText>
            </View>
          )
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => onOpen(item)} style={styles.itemCard}>
            <View style={styles.itemTopRow}>
              <View style={styles.typeBadge}>
                <Ionicons name={getTypeIcon(item.type)} size={15} color={colors.primary} />
                <Text style={styles.typeText}>{item.type?.toUpperCase() || "ACTIVITY"}</Text>
              </View>
              {!item.is_read ? (
                <View style={styles.newChip}>
                  <Text style={styles.newChipText}>New</Text>
                </View>
              ) : null}
            </View>
            <BodyText style={styles.messageText}>{item.message}</BodyText>
            <View style={styles.timeRow}>
              <Ionicons name="time-outline" size={13} color={colors.subtext} />
              <BodyText style={styles.timeText}>{item.created_at}</BodyText>
            </View>
          </Pressable>
        )}
      />
    </Screen>
  );
}

function Metric({ icon, label, value }) {
  return (
    <View style={styles.metricPill}>
      <Ionicons name={icon} size={14} color="#F4F4F4" />
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
    gap: 10,
  },
  listContentCompact: {
    paddingTop: 8,
    paddingBottom: 18,
    gap: 8,
  },
  headerBlock: {
    marginBottom: 2,
  },
  headerBlockCompact: {
    marginBottom: 0,
  },
  heroCard: {
    borderRadius: radius.xl,
    padding: 16,
    shadowColor: "#3D3D3D",
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  heroCardCompact: {
    padding: 14,
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  heroKicker: {
    color: "#F0F0F0",
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 11,
    letterSpacing: 0.8,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontFamily: fonts.display,
    fontWeight: "800",
  },
  heroSub: {
    color: "#ECECEC",
    marginTop: 5,
    maxWidth: 265,
  },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  metricRow: {
    marginTop: 12,
    flexDirection: "row",
    gap: 8,
  },
  metricRowCompact: {
    marginTop: 10,
    gap: 6,
  },
  metricPill: {
    flex: 1,
    borderRadius: 13,
    backgroundColor: "rgba(27, 27, 27, 0.22)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.25)",
    alignItems: "center",
    paddingVertical: 8,
  },
  metricValue: {
    color: "#FFFFFF",
    fontFamily: fonts.display,
    fontWeight: "800",
    fontSize: 17,
    marginTop: 2,
  },
  metricLabel: {
    color: "#F0F0F0",
    fontFamily: fonts.body,
    fontSize: 11,
  },
  itemCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#DEDEDE",
    backgroundColor: "#FFFFFF",
    padding: 12,
    gap: 8,
  },
  itemTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.pill,
    backgroundColor: "#F2F2F2",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  typeText: {
    color: colors.primaryDark,
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 11,
  },
  newChip: {
    borderRadius: radius.pill,
    backgroundColor: "#F2F2F2",
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  newChipText: {
    color: colors.primary,
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 11,
  },
  messageText: {
    color: colors.text,
    lineHeight: 20,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  timeText: {
    fontSize: 12,
  },
  loaderWrap: {
    alignItems: "center",
    marginTop: 70,
  },
  emptyWrap: {
    alignItems: "center",
    marginTop: 70,
  },
});
