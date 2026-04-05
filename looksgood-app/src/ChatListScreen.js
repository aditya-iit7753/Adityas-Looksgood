import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Platform, Pressable, StatusBar, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import API from "./services/api";
import { colors, fonts, radius } from "./theme";
import { BodyText, Screen, Title } from "./ui";
import BrandGlyph from "./BrandGlyph";

const SCREEN_HEADER_TOP_PAD = Platform.OS === "android" ? (StatusBar.currentHeight ?? 0) + 28 : 26;

export default function ChatListScreen({ navigation }) {
  const [conversations, setConversations] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [requestingUserId, setRequestingUserId] = useState(null);

  const loadChats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [convRes, contactsRes] = await Promise.all([
        API.get("/social/chat/conversations"),
        API.get("/social/chat/contacts"),
      ]);
      setConversations(Array.isArray(convRes.data) ? convRes.data : []);
      setContacts(Array.isArray(contactsRes.data) ? contactsRes.data : []);
    } catch (err) {
      setError(err?.message || "Could not load chats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  const openChat = (user) => {
    if (!user?.id) return;
    navigation.navigate("ChatRoom", { userId: user.id, username: user.username });
  };

  const openProfile = (user) => {
    if (!user?.id) return;
    navigation.navigate("Profile", { userId: user.id });
  };

  const syncUserFollowState = useCallback((userId, nextIsFollowing) => {
    setConversations((prev) =>
      prev.map((entry) =>
        entry?.user?.id === userId ? { ...entry, user: { ...entry.user, is_following: nextIsFollowing } } : entry
      )
    );
    setContacts((prev) =>
      prev.map((entry) => (entry?.id === userId ? { ...entry, is_following: nextIsFollowing } : entry))
    );
  }, []);

  const toggleRequest = useCallback(
    async (user) => {
      if (!user?.id || user?.is_me) return;
      setRequestingUserId(user.id);
      try {
        if (user.is_following) {
          await API.delete(`/social/follow/${user.id}`);
        } else {
          await API.post(`/social/follow/${user.id}`);
        }
        syncUserFollowState(user.id, !user.is_following);
      } finally {
        setRequestingUserId(null);
      }
    },
    [syncUserFollowState]
  );

  return (
    <Screen padded={false}>
      <View style={styles.screenHeader}>
        <Title size={24}>Chat</Title>
      </View>
      <FlatList
        style={{ flex: 1 }}
        data={conversations}
        refreshing={loading}
        onRefresh={loadChats}
        keyExtractor={(item, idx) => String(item?.user?.id ?? idx)}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            <LinearGradient colors={["#313131", "#6D6D6D", "#8D8D8D"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
              <View style={styles.heroTopRow}>
                <View style={{ flex: 1 }}>
                  <BrandGlyph size={38} />
                  <Title size={30}>
                    <Text style={styles.heroTitle}>Friends & Followers</Text>
                  </Title>
                  <BodyText style={styles.heroSub}>Message your community directly and stay connected.</BodyText>
                </View>
                <Pressable onPress={() => navigation.navigate("Discover")} style={styles.heroIconBtn}>
                  <Ionicons name="people-outline" size={20} color="#373737" />
                </Pressable>
              </View>

              <View style={styles.metricsRow}>
                <Metric icon="chatbubble-ellipses-outline" label="Chats" value={String(conversations.length)} />
                <Metric icon="people-outline" label="Contacts" value={String(contacts.length)} />
                <Metric icon="radio-outline" label="Status" value={loading ? "Sync" : "Live"} />
              </View>
            </LinearGradient>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
                <Pressable onPress={loadChats}>
                  <Text style={styles.errorAction}>Retry</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          const user = item?.user;
          if (!user) return null;
          return (
            <View style={styles.chatCard}>
              <Pressable onPress={() => openChat(user)} style={styles.chatTop}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{String(user.username || "U").slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={styles.chatMeta}>
                  <Text style={styles.username}>@{user.username}</Text>
                  <BodyText numberOfLines={1} style={styles.previewText}>
                    {item.last_message || "No messages yet"}
                  </BodyText>
                </View>
                <View style={styles.chatRight}>
                  {item.unread_count ? (
                    <View style={styles.unreadChip}>
                      <Text style={styles.unreadText}>{item.unread_count}</Text>
                    </View>
                  ) : null}
                  <Ionicons name="chevron-forward-outline" size={18} color={colors.subtext} />
                </View>
              </Pressable>

              <View style={styles.chatActionsRow}>
                <Pressable onPress={() => openProfile(user)} style={styles.profileBtn}>
                  <Ionicons name="person-circle-outline" size={14} color={colors.primaryDark} />
                  <Text style={styles.profileBtnText}>Profile</Text>
                </Pressable>
                <Pressable
                  onPress={() => openChat(user)}
                  style={styles.messageBtn}>
                  <Ionicons name="chatbubble-ellipses-outline" size={14} color="#2F2F2F" />
                  <Text style={styles.messageBtnText}>Message</Text>
                </Pressable>
                {!user.is_me ? (
                  <Pressable
                    onPress={() => toggleRequest(user)}
                    disabled={requestingUserId === user.id}
                    style={[styles.requestBtn, user.is_following && styles.requestBtnActive]}>
                    {requestingUserId === user.id ? (
                      <ActivityIndicator size="small" color={user.is_following ? "#5D5D5D" : "#2F2F2F"} />
                    ) : (
                      <>
                        <Ionicons
                          name={user.is_following ? "checkmark-circle-outline" : "person-add-outline"}
                          size={14}
                          color={user.is_following ? "#5D5D5D" : "#2F2F2F"}
                        />
                        <Text style={[styles.requestBtnText, user.is_following && styles.requestBtnTextActive]}>
                          {user.is_following ? "Requested" : "Request"}
                        </Text>
                      </>
                    )}
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          loading ? (
            <View style={styles.loaderWrap}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <BodyText style={{ marginBottom: 8 }}>No conversations yet. Start one with your contacts.</BodyText>
              {contacts.map((user) => (
                <Pressable key={user.id} onPress={() => openChat(user)} style={styles.contactBtn}>
                  <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.primary} />
                  <Text style={styles.contactBtnText}>@{user.username}</Text>
                </Pressable>
              ))}
              {contacts.length === 0 ? (
                <Pressable onPress={() => navigation.navigate("Discover")} style={styles.contactBtn}>
                  <Ionicons name="person-add-outline" size={14} color={colors.primary} />
                  <Text style={styles.contactBtnText}>Find users in Discover</Text>
                </Pressable>
              ) : null}
            </View>
          )
        }
      />
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

const styles = StyleSheet.create({
  screenHeader: {
    paddingHorizontal: 16,
    paddingTop: SCREEN_HEADER_TOP_PAD,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
    gap: 10,
  },
  headerWrap: {
    marginBottom: 2,
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
    color: "#ECECEC",
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
    marginTop: 12,
    flexDirection: "row",
    gap: 8,
  },
  metricPill: {
    flex: 1,
    alignItems: "center",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.24)",
    backgroundColor: "rgba(29, 29, 29, 0.22)",
    paddingVertical: 8,
  },
  metricValue: {
    color: "#FFFFFF",
    fontFamily: fonts.display,
    fontSize: 17,
    fontWeight: "800",
    marginTop: 2,
  },
  metricLabel: {
    color: "#F0F0F0",
    fontFamily: fonts.body,
    fontSize: 11,
  },
  errorBox: {
    marginTop: 8,
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
  chatCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#DFDFDF",
    backgroundColor: "#FFFFFF",
    padding: 12,
    gap: 10,
  },
  chatTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#ECECEC",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#3E3E3E",
    fontFamily: fonts.display,
    fontWeight: "800",
    fontSize: 18,
  },
  chatMeta: {
    flex: 1,
    gap: 2,
  },
  username: {
    color: colors.text,
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 15,
  },
  previewText: {
    color: colors.subtext,
  },
  chatRight: {
    alignItems: "flex-end",
    gap: 6,
  },
  chatActionsRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  profileBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 7,
    backgroundColor: "#F2F2F2",
    borderWidth: 1,
    borderColor: "#D8D8D8",
  },
  profileBtnText: {
    color: colors.primaryDark,
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 12,
  },
  messageBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 7,
    backgroundColor: "#F3F3F3",
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  messageBtnText: {
    color: "#2F2F2F",
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 12,
  },
  requestBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "#CACACA",
    backgroundColor: "#F3F3F3",
    minWidth: 96,
    justifyContent: "center",
  },
  requestBtnActive: {
    backgroundColor: "#F3F3F3",
    borderColor: "#D6D6D6",
  },
  requestBtnText: {
    color: "#2F2F2F",
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 12,
  },
  requestBtnTextActive: {
    color: "#5D5D5D",
  },
  unreadChip: {
    minWidth: 21,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: "#F3F3F3",
    alignItems: "center",
  },
  unreadText: {
    color: colors.primary,
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 11,
  },
  loaderWrap: {
    alignItems: "center",
    marginTop: 40,
  },
  emptyWrap: {
    marginTop: 20,
    gap: 8,
  },
  contactBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: "#F3F3F3",
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  contactBtnText: {
    color: colors.primaryDark,
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 12,
  },
});
