import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, FlatList, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import API from "./services/api";
import { colors, fonts, radius } from "./theme";
import { BodyText, Screen, Title } from "./ui";
import BrandGlyph from "./BrandGlyph";

export default function DiscoverScreen({ navigation }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState(null);
  const introAnim = useRef(new Animated.Value(0)).current;
  const { height } = useWindowDimensions();
  const compact = height < 760;

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await API.get("/social/users", { params: { q: query || undefined } });
      setUsers(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setError(err?.message || "Unable to load users");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    Animated.timing(introAnim, {
      toValue: 1,
      duration: 520,
      useNativeDriver: true,
    }).start();
  }, [introAnim]);

  const toggleFollow = async (user) => {
    try {
      if (user.is_following) {
        await API.delete(`/social/follow/${user.id}`);
      } else {
        await API.post(`/social/follow/${user.id}`);
      }
      await loadUsers();
    } catch (err) {
      Alert.alert("Action failed", err?.message || "Please try again.");
    }
  };

  const userCounts = useMemo(() => {
    const creators = users.length;
    const followed = users.filter((x) => x.is_following).length;
    return { creators, followed };
  }, [users]);

  const headerTranslateY = introAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });

  return (
    <Screen padded={false}>
      <Animated.View style={[styles.heroWrap, compact && styles.heroWrapCompact, { opacity: introAnim, transform: [{ translateY: headerTranslateY }] }]}>
        <LinearGradient
          colors={["#393939", "#686868", "#8E8E8E"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.heroCard, compact && styles.heroCardCompact]}>
          <View style={styles.heroTopRow}>
            <View style={{ flex: 1 }}>
              <BrandGlyph size={compact ? 40 : 46} />
              <Title size={31}>
                <Text style={styles.heroTitle}>Find your next style circle</Text>
              </Title>
              <BodyText style={styles.heroSub}>Search creators, follow them, and grow your fashion network.</BodyText>
            </View>
            <Pressable onPress={() => navigation.navigate("Profile")} style={styles.heroIconBtn}>
              <Ionicons name="person-circle-outline" size={22} color="#343434" />
            </Pressable>
          </View>

          <View style={[styles.metricsRow, compact && styles.metricsRowCompact]}>
            <Metric icon="people-outline" label="Creators" value={String(userCounts.creators)} />
            <Metric icon="heart-outline" label="Following" value={String(userCounts.followed)} />
            <Metric icon="flash-outline" label="Status" value={loading ? "Sync" : "Live"} />
          </View>

          <View style={styles.searchShell}>
            <Ionicons name="search-outline" size={16} color="#595959" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search by username or email"
              placeholderTextColor="#7E7E7E"
              autoCapitalize="none"
              style={styles.searchInput}
            />
          </View>

          <View style={styles.heroActionsRow}>
            <Pressable onPress={loadUsers} style={styles.searchBtn}>
              <Ionicons name="search-outline" size={16} color="#2F2F2F" />
            </Pressable>
            <Pressable onPress={() => navigation.navigate("Profile")} style={styles.myProfileBtn}>
              <Ionicons name="person-outline" size={16} color="#FFFFFF" />
            </Pressable>
          </View>
        </LinearGradient>
      </Animated.View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={loadUsers}>
            <Text style={styles.errorAction}>Try again</Text>
          </Pressable>
        </View>
      ) : null}

      {loading && users.length === 0 ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[styles.listContent, compact && styles.listContentCompact]}
          renderItem={({ item }) => (
            <View style={styles.userCard}>
              <View style={styles.userTopRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{String(item.username || "U").slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>@{item.username}</Text>
                  <BodyText numberOfLines={1}>{item.email}</BodyText>
                </View>
                {!item.is_me ? (
                  <Pressable onPress={() => toggleFollow(item)} style={[styles.followBtn, item.is_following && styles.followingBtn]}>
                    <Ionicons name={item.is_following ? "checkmark-outline" : "person-add-outline"} size={14} color={item.is_following ? "#616161" : colors.primary} />
                    <Text style={[styles.followBtnText, item.is_following && styles.followBtnTextActive]}>
                      {item.is_following ? "Requested" : "Request"}
                    </Text>
                  </Pressable>
                ) : (
                  <View style={styles.youBadge}>
                    <Ionicons name="checkmark-circle-outline" size={14} color={colors.primary} />
                    <Text style={styles.youBadgeText}>You</Text>
                  </View>
                )}
              </View>

              <View style={styles.userMetaRow}>
                <Tag icon="people-outline" text={`${item.followers} followers`} />
                <Tag icon="person-add-outline" text={`${item.following} following`} />
              </View>

              <View style={styles.bottomActionsRow}>
                <Pressable onPress={() => navigation.navigate("Profile", { userId: item.id })} style={styles.viewProfileLink}>
                  <Ionicons name="person-circle-outline" size={18} color={colors.primary} />
                </Pressable>
                {!item.is_me ? (
                  <Pressable onPress={() => navigation.navigate("ChatRoom", { userId: item.id, username: item.username })} style={styles.messageLink}>
                    <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.primary} />
                  </Pressable>
                ) : null}
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <BodyText>No creators found.</BodyText>
            </View>
          }
        />
      )}
    </Screen>
  );
}

function Metric({ icon, label, value }) {
  return (
    <View style={styles.metricPill}>
      <Ionicons name={icon} size={14} color="#F2F2F2" />
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function Tag({ icon, text }) {
  return (
    <View style={styles.tag}>
      <Ionicons name={icon} size={13} color={colors.primary} />
      <Text style={styles.tagText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heroWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
  },
  heroWrapCompact: {
    paddingTop: 8,
    paddingBottom: 6,
  },
  heroCard: {
    borderRadius: radius.xl,
    padding: 16,
    shadowColor: "#393939",
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
  heroTitle: {
    color: "#FFFFFF",
    fontFamily: fonts.display,
    fontWeight: "800",
  },
  heroSub: {
    color: "#EBEBEB",
    marginTop: 5,
    maxWidth: 260,
  },
  heroIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  metricsRow: {
    marginTop: 14,
    flexDirection: "row",
    gap: 8,
  },
  metricsRowCompact: {
    marginTop: 10,
    gap: 6,
  },
  metricPill: {
    flex: 1,
    borderRadius: 13,
    backgroundColor: "rgba(29, 29, 29, 0.2)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.23)",
    paddingVertical: 8,
    alignItems: "center",
  },
  metricValue: {
    color: "#FFFFFF",
    fontFamily: fonts.display,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 2,
  },
  metricLabel: {
    color: "#EBEBEB",
    fontFamily: fonts.body,
    fontSize: 11,
  },
  searchShell: {
    marginTop: 12,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 14,
  },
  heroActionsRow: {
    marginTop: 10,
    flexDirection: "row",
    gap: 8,
  },
  searchBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F5F5F5",
  },
  myProfileBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.5)",
  },
  errorBox: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#CFCFCF",
    backgroundColor: "#F4F4F4",
    padding: 12,
  },
  errorText: {
    color: colors.danger,
    fontFamily: fonts.body,
    marginBottom: 6,
  },
  errorAction: {
    color: colors.primary,
    fontFamily: fonts.body,
    fontWeight: "800",
  },
  loaderWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 22,
    gap: 10,
  },
  listContentCompact: {
    paddingBottom: 16,
    gap: 8,
  },
  userCard: {
    borderRadius: radius.lg,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DFDFDF",
    padding: 12,
    gap: 10,
  },
  userTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#EEEEEE",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#3D3D3D",
    fontFamily: fonts.display,
    fontWeight: "800",
    fontSize: 18,
  },
  userInfo: {
    flex: 1,
    gap: 2,
  },
  userName: {
    color: colors.text,
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 16,
  },
  followBtn: {
    minWidth: 90,
    borderRadius: radius.pill,
    backgroundColor: "#F2F2F2",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: "row",
    gap: 5,
  },
  followingBtn: {
    backgroundColor: "#F3F3F3",
  },
  followBtnText: {
    color: colors.primary,
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 12,
  },
  followBtnTextActive: {
    color: "#616161",
  },
  youBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: "#F4F4F4",
  },
  youBadgeText: {
    color: colors.primary,
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 12,
  },
  userMetaRow: {
    flexDirection: "row",
    gap: 8,
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: "#F1F1F1",
  },
  tagText: {
    color: colors.primaryDark,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: "700",
  },
  viewProfileLink: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F3F3",
    alignSelf: "flex-start",
    flexDirection: "row",
  },
  bottomActionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 2,
  },
  messageLink: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    backgroundColor: "#F1F1F1",
  },
  emptyState: {
    alignItems: "center",
    marginTop: 70,
  },
});
