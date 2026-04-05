import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import API from "./services/api";
import { colors, fonts, radius } from "./theme";
import { BodyText, Screen, Title } from "./ui";

const SPECIAL_PREFIX = {
  voice: "[VOICE_CALL]",
  video: "[VIDEO_CALL]",
  creation: "[SUGGEST_CREATION]",
  friend: "[SUGGEST_FRIEND]",
};

const TRENDING_PROMPTS = [
  "What’s your OOTD today?",
  "Drop your current vibe: clean / street / coquette / techwear / vintage",
  "Send me 1 outfit pic and I’ll suggest a better combo.",
  "What’s the one piece you’re obsessed with this week?",
  "Quick rate: my fit is a ___/10 (be honest).",
];

function parseMessage(rawContent) {
  const content = String(rawContent || "");
  const roomMatch = content.match(/room:([a-z0-9-_]+)/i);
  const roomId = roomMatch?.[1] || null;
  if (content.startsWith(SPECIAL_PREFIX.voice)) {
    return {
      type: "voice",
      label: "Voice Call Invite",
      icon: "call-outline",
      text: content.replace(SPECIAL_PREFIX.voice, "").replace(/room:[a-z0-9-_]+/i, "").trim(),
      roomId,
    };
  }
  if (content.startsWith(SPECIAL_PREFIX.video)) {
    return {
      type: "video",
      label: "Video Call Invite",
      icon: "videocam-outline",
      text: content.replace(SPECIAL_PREFIX.video, "").replace(/room:[a-z0-9-_]+/i, "").trim(),
      roomId,
    };
  }
  if (content.startsWith(SPECIAL_PREFIX.creation)) {
    return {
      type: "creation",
      label: "Creation Suggestion",
      icon: "sparkles-outline",
      text: content.replace(SPECIAL_PREFIX.creation, "").trim(),
    };
  }
  if (content.startsWith(SPECIAL_PREFIX.friend)) {
    return {
      type: "friend",
      label: "Friend Suggestion",
      icon: "person-add-outline",
      text: content.replace(SPECIAL_PREFIX.friend, "").trim(),
    };
  }
  return null;
}

export default function ChatRoomScreen({ route, navigation }) {
  const userId = Number(route?.params?.userId || 0);
  const initialUsername = route?.params?.username || "creator";
  const [currentUserId, setCurrentUserId] = useState(0);
  const [messages, setMessages] = useState([]);
  const [myCreations, setMyCreations] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [suggestMode, setSuggestMode] = useState(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [contact, setContact] = useState(null);
  const timerRef = useRef(null);

  const username = useMemo(() => contact?.username || initialUsername, [contact?.username, initialUsername]);

  const loadMessages = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await API.get(`/social/chat/${userId}`);
      setMessages(Array.isArray(res?.data?.messages) ? res.data.messages : []);
      setContact(res?.data?.contact || null);
      await API.post(`/social/chat/${userId}/read`);
    } catch (_err) {
      // no-op, render empty state if unavailable
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (!userId) return undefined;
    timerRef.current = setInterval(() => {
      loadMessages();
    }, 6000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [loadMessages, userId]);

  const loadSuggestionData = useCallback(async () => {
    if (!userId) return;
    try {
      const [profileRes, contactsRes] = await Promise.all([
        API.get("/social/profile/me"),
        API.get("/social/chat/contacts"),
      ]);
      const posts = Array.isArray(profileRes?.data?.posts) ? profileRes.data.posts : [];
      const meId = Number(profileRes?.data?.profile?.id || 0);
      const friends = Array.isArray(contactsRes?.data) ? contactsRes.data : [];
      setCurrentUserId(meId);
      setMyCreations(posts.slice(0, 8));
      setContacts(friends.filter((x) => Number(x?.id) !== userId).slice(0, 12));
    } catch (_err) {
      // no-op
    }
  }, [userId]);

  useEffect(() => {
    loadSuggestionData();
  }, [loadSuggestionData]);

  const send = async (overrideText = null) => {
    const content = String(overrideText ?? text).trim();
    if (!userId || !content || sending) return;
    setSending(true);
    try {
      const res = await API.post(`/social/chat/${userId}`, { content });
      const msg = res?.data?.message;
      if (msg) {
        setMessages((prev) => [...prev, msg]);
      } else {
        await loadMessages();
      }
      if (!overrideText) setText("");
    } catch (_err) {
      // no-op
    } finally {
      setSending(false);
    }
  };

  const buildRoomId = () => {
    const a = currentUserId > 0 ? currentUserId : Date.now();
    const b = userId > 0 ? userId : 0;
    const min = Math.min(a, b);
    const max = Math.max(a, b);
    const suffix = Date.now().toString(36).slice(-4);
    return `looksgood-${min}-${max}-${suffix}`.toLowerCase();
  };

  const openCall = (mode, roomId) => {
    navigation.navigate("Call", { mode, roomId, userId, username });
  };

  const sendVoiceCallInvite = () => {
    const roomId = buildRoomId();
    send(`${SPECIAL_PREFIX.voice} room:${roomId} Voice call invite from @${username}. Join now.`);
    openCall("voice", roomId);
  };

  const sendVideoCallInvite = () => {
    const roomId = buildRoomId();
    send(`${SPECIAL_PREFIX.video} room:${roomId} Video call invite from @${username}. Join now.`);
    openCall("video", roomId);
  };

  const suggestCreation = (post) => {
    const caption = (post?.caption || "A style idea you should try").slice(0, 140);
    const url = post?.media_url ? ` ${post.media_url}` : "";
    send(`${SPECIAL_PREFIX.creation} ${caption}${url}`);
    setSuggestMode(null);
  };

  const suggestFriend = (friend) => {
    const label = friend?.username ? `@${friend.username}` : "this creator";
    send(`${SPECIAL_PREFIX.friend} You should connect with ${label}. Great fit for your style.`);
    setSuggestMode(null);
  };

  const sendTrendingPrompt = (prompt) => {
    const content = String(prompt || "").trim();
    if (!content) return;
    send(content);
    setSuggestMode(null);
  };

  return (
    <Screen padded={false}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={styles.headerWrap}>
          <View style={styles.headerTop}>
            <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Ionicons name="chevron-back-outline" size={18} color={colors.text} />
            </Pressable>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{String(username || "U").slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Title size={24}>
                <Text style={styles.titleText}>@{username}</Text>
              </Title>
              <BodyText>{loading ? "Syncing messages..." : "Live chat"}</BodyText>
            </View>
          </View>
          <View style={styles.quickActionRow}>
            <Pressable onPress={sendVoiceCallInvite} style={styles.quickActionBtn}>
              <Ionicons name="call-outline" size={14} color={colors.primary} />
              <Text style={styles.quickActionText}>Voice Call</Text>
            </Pressable>
            <Pressable onPress={sendVideoCallInvite} style={styles.quickActionBtn}>
              <Ionicons name="videocam-outline" size={14} color={colors.primary} />
              <Text style={styles.quickActionText}>Video Call</Text>
            </Pressable>
            <Pressable onPress={() => setSuggestMode((prev) => (prev === "trending" ? null : "trending"))} style={styles.quickActionBtn}>
              <Ionicons name="trending-up-outline" size={14} color={colors.primary} />
              <Text style={styles.quickActionText}>Trending</Text>
            </Pressable>
            <Pressable onPress={() => setSuggestMode((prev) => (prev === "creation" ? null : "creation"))} style={styles.quickActionBtn}>
              <Ionicons name="sparkles-outline" size={14} color={colors.primary} />
              <Text style={styles.quickActionText}>Suggest Creation</Text>
            </Pressable>
            <Pressable onPress={() => setSuggestMode((prev) => (prev === "friend" ? null : "friend"))} style={styles.quickActionBtn}>
              <Ionicons name="person-add-outline" size={14} color={colors.primary} />
              <Text style={styles.quickActionText}>Suggest Friend</Text>
            </Pressable>
          </View>

          {suggestMode === "trending" ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestRow}>
              {TRENDING_PROMPTS.map((prompt) => (
                <Pressable key={prompt} onPress={() => sendTrendingPrompt(prompt)} style={styles.suggestChip}>
                  <Ionicons name="trending-up-outline" size={14} color={colors.primary} />
                  <Text numberOfLines={1} style={styles.suggestChipText}>
                    {prompt}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          {suggestMode === "creation" ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestRow}>
              {myCreations.map((post, idx) => (
                <Pressable key={post.id ?? idx} onPress={() => suggestCreation(post)} style={styles.suggestChip}>
                  <Ionicons name="images-outline" size={14} color={colors.primary} />
                  <Text numberOfLines={1} style={styles.suggestChipText}>
                    {(post.caption || "Style creation").slice(0, 26)}
                  </Text>
                </Pressable>
              ))}
              {myCreations.length === 0 ? (
                <View style={styles.emptySuggest}>
                  <BodyText>Create posts first to suggest a creation.</BodyText>
                </View>
              ) : null}
            </ScrollView>
          ) : null}

          {suggestMode === "friend" ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestRow}>
              {contacts.map((friend, idx) => (
                <Pressable key={friend.id ?? idx} onPress={() => suggestFriend(friend)} style={styles.suggestChip}>
                  <Ionicons name="person-circle-outline" size={14} color={colors.primary} />
                  <Text numberOfLines={1} style={styles.suggestChipText}>
                    @{friend.username}
                  </Text>
                </Pressable>
              ))}
              {contacts.length === 0 ? (
                <View style={styles.emptySuggest}>
                  <BodyText>No friends/followers available to suggest.</BodyText>
                </View>
              ) : null}
            </ScrollView>
          ) : null}
        </View>

        <FlatList
          style={{ flex: 1 }}
          data={messages}
          keyExtractor={(item, idx) => String(item?.id ?? idx)}
          contentContainerStyle={styles.listContent}
          onRefresh={loadMessages}
          refreshing={loading}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const special = parseMessage(item?.content);
            return (
              <View style={[styles.bubble, item.is_me ? styles.myBubble : styles.theirBubble, special && styles.specialBubble]}>
                {special ? (
                  <View style={styles.specialHead}>
                    <Ionicons name={special.icon} size={13} color={item.is_me ? "#FFFFFF" : colors.primary} />
                    <Text style={[styles.specialHeadText, item.is_me && styles.myBubbleText]}>{special.label}</Text>
                  </View>
                ) : null}
                <Text style={[styles.bubbleText, item.is_me && styles.myBubbleText]}>{special ? special.text : item.content}</Text>
                {special && (special.type === "voice" || special.type === "video") && special.roomId ? (
                  <Pressable
                    onPress={() => openCall(special.type, special.roomId)}
                    style={[styles.joinCallBtn, item.is_me && styles.joinCallBtnMine]}>
                    <Ionicons name={special.type === "voice" ? "call-outline" : "videocam-outline"} size={13} color={item.is_me ? colors.primary : "#FFFFFF"} />
                    <Text style={[styles.joinCallBtnText, item.is_me && styles.joinCallBtnTextMine]}>
                      Join {special.type === "voice" ? "Voice" : "Video"} Call
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <BodyText>No messages yet. Say hello.</BodyText>
            </View>
          }
        />

        <View style={styles.inputRow}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Type a message..."
            placeholderTextColor={colors.subtext}
            style={styles.input}
          />
          <Pressable onPress={send} disabled={!text.trim() || sending} style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}>
            <Ionicons name="send-outline" size={16} color="#FFFFFF" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight ?? 0) + 12 : 10,
    paddingBottom: 8,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#DFDFDF",
    padding: 10,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F2F2F2",
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#ECECEC",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#3F3F3F",
    fontFamily: fonts.display,
    fontWeight: "800",
    fontSize: 17,
  },
  titleText: {
    color: colors.text,
    fontFamily: fonts.display,
    fontWeight: "800",
  },
  quickActionRow: {
    marginTop: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  quickActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: radius.pill,
    backgroundColor: "#F3F3F3",
    borderWidth: 1,
    borderColor: "#DBDBDB",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  quickActionText: {
    color: colors.primary,
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 11,
  },
  suggestRow: {
    marginTop: 8,
    gap: 8,
    paddingRight: 8,
  },
  suggestChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "#DEDEDE",
    backgroundColor: "#F9F9F9",
    paddingHorizontal: 10,
    paddingVertical: 7,
    maxWidth: 220,
  },
  suggestChipText: {
    color: colors.primaryDark,
    fontFamily: fonts.body,
    fontWeight: "700",
    fontSize: 12,
  },
  emptySuggest: {
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  bubble: {
    maxWidth: "82%",
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  specialBubble: {
    gap: 4,
  },
  specialHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  specialHeadText: {
    color: colors.primary,
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 11,
  },
  joinCallBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.28)",
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 2,
  },
  joinCallBtnMine: {
    borderColor: "rgba(255, 255, 255, 0.35)",
    backgroundColor: "rgba(255, 255, 255, 0.95)",
  },
  joinCallBtnText: {
    color: "#FFFFFF",
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 11,
  },
  joinCallBtnTextMine: {
    color: colors.primary,
  },
  myBubble: {
    alignSelf: "flex-end",
    backgroundColor: colors.primary,
  },
  theirBubble: {
    alignSelf: "flex-start",
    backgroundColor: "#F1F1F1",
    borderWidth: 1,
    borderColor: "#DDDDDD",
  },
  bubbleText: {
    color: colors.text,
    fontFamily: fonts.body,
    lineHeight: 19,
  },
  myBubbleText: {
    color: "#FFFFFF",
  },
  emptyWrap: {
    alignItems: "center",
    marginTop: 40,
  },
  inputRow: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    backgroundColor: "#FFFFFF",
    fontFamily: fonts.body,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  sendBtnDisabled: {
    backgroundColor: colors.primaryDark,
    opacity: 0.65,
  },
});
