import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, FlatList, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import API from "./services/api";
import { colors, fonts, radius } from "./theme";
import { BodyText, Screen, Title } from "./ui";

export default function CommentsScreen({ route }) {
  const post = route.params?.post;
  const [comments, setComments] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const introAnim = useRef(new Animated.Value(0)).current;
  const { height } = useWindowDimensions();
  const compact = height < 760;

  const loadComments = useCallback(async () => {
    if (!post?.id) return;
    setLoading(true);
    try {
      const res = await API.get(`/social/posts/${post.id}/comments`);
      setComments(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      Alert.alert("Failed", err?.message || "Could not load comments");
    } finally {
      setLoading(false);
    }
  }, [post?.id]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  useEffect(() => {
    Animated.timing(introAnim, {
      toValue: 1,
      duration: 520,
      useNativeDriver: true,
    }).start();
  }, [introAnim]);

  const submit = async () => {
    if (!text.trim() || !post?.id) return;
    try {
      setSending(true);
      await API.post(`/social/posts/${post.id}/comments`, { content: text.trim() });
      setText("");
      await loadComments();
    } catch (err) {
      Alert.alert("Failed", err?.message || "Could not add comment");
    } finally {
      setSending(false);
    }
  };

  const headerTranslateY = introAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  const commentsCountLabel = useMemo(() => String(comments.length), [comments.length]);

  const renderHeader = () => (
    <View style={[styles.headerBlock, compact && styles.headerBlockCompact]}>
      <Animated.View style={{ opacity: introAnim, transform: [{ translateY: headerTranslateY }] }}>
        <LinearGradient
          colors={["#3A3A3A", "#6B6B6B", "#929292"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.heroCard, compact && styles.heroCardCompact]}>
          <View style={styles.heroTopRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroKicker}>COMMENTS</Text>
              <Title size={30}>
                <Text style={styles.heroTitle}>Join the conversation</Text>
              </Title>
              <BodyText style={styles.heroSub}>{post?.caption || "Share your thoughts on this post."}</BodyText>
            </View>
            <View style={styles.heroIconBtn}>
              <Ionicons name="chatbubble-ellipses-outline" size={20} color="#363636" />
            </View>
          </View>

          <View style={styles.heroMetric}>
            <Ionicons name="sparkles-outline" size={14} color="#F2F2F2" />
            <Text style={styles.heroMetricValue}>{commentsCountLabel}</Text>
            <Text style={styles.heroMetricLabel}>Comments</Text>
          </View>
        </LinearGradient>
      </Animated.View>

      <View style={[styles.composerCard, compact && styles.composerCardCompact]}>
        <View style={styles.composerTitleRow}>
          <Ionicons name="create-outline" size={16} color={colors.primary} />
          <Text style={styles.composerTitle}>Add a comment</Text>
        </View>
        <View style={styles.inputShell}>
          <Ionicons name="text-outline" size={16} color={colors.subtext} />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Write a comment..."
            placeholderTextColor={colors.subtext}
            style={styles.input}
          />
        </View>
        <Pressable onPress={submit} disabled={sending || !text.trim()} style={[styles.postBtn, (sending || !text.trim()) && styles.postBtnDisabled]}>
          <Ionicons name="send-outline" size={16} color="#FFFFFF" />
          <Text style={styles.postBtnText}>{sending ? "Posting..." : "Post Comment"}</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <Screen padded={false}>
      {loading && comments.length === 0 ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}
      <FlatList
        data={comments}
        refreshing={loading}
        onRefresh={loadComments}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[styles.listContent, compact && styles.listContentCompact]}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <BodyText>No comments yet.</BodyText>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.commentCard}>
            <View style={styles.commentTopRow}>
              <View style={styles.commentUserWrap}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{String(item.user || "U").slice(0, 1).toUpperCase()}</Text>
                </View>
                <Text style={styles.userText}>@{item.user}</Text>
              </View>
              {item.is_me ? (
                <View style={styles.youBadge}>
                  <Text style={styles.youBadgeText}>You</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.contentText}>{item.content}</Text>
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  loaderWrap: {
    position: "absolute",
    top: 100,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 2,
  },
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
    gap: 12,
    marginBottom: 2,
  },
  headerBlockCompact: {
    gap: 10,
  },
  heroCard: {
    borderRadius: radius.xl,
    padding: 16,
    shadowColor: "#3A3A3A",
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
    gap: 10,
    alignItems: "flex-start",
  },
  heroKicker: {
    color: "#EFEFEF",
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
    color: "#EDEDED",
    marginTop: 5,
    maxWidth: 260,
  },
  heroIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.9)",
  },
  heroMetric: {
    marginTop: 12,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.pill,
    backgroundColor: "rgba(31, 31, 31, 0.23)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  heroMetricValue: {
    color: "#FFFFFF",
    fontFamily: fonts.display,
    fontWeight: "800",
    fontSize: 16,
  },
  heroMetricLabel: {
    color: "#F0F0F0",
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: "700",
  },
  composerCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#DDDDDD",
    backgroundColor: "#FFFFFF",
    padding: 12,
    gap: 10,
  },
  composerCardCompact: {
    gap: 8,
    padding: 11,
  },
  composerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  composerTitle: {
    color: colors.text,
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 15,
  },
  inputShell: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 11,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.body,
    paddingVertical: 10,
  },
  postBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  postBtnDisabled: {
    backgroundColor: "#9B9B9B",
  },
  postBtnText: {
    color: "#FFFFFF",
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 12,
  },
  commentCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#DEDEDE",
    backgroundColor: "#FFFFFF",
    padding: 12,
    gap: 8,
  },
  commentTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  commentUserWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#ECECEC",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#3F3F3F",
    fontFamily: fonts.display,
    fontWeight: "800",
    fontSize: 15,
  },
  userText: {
    color: colors.text,
    fontFamily: fonts.body,
    fontWeight: "800",
  },
  youBadge: {
    borderRadius: radius.pill,
    backgroundColor: "#F4F4F4",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  youBadgeText: {
    color: colors.primary,
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 11,
  },
  contentText: {
    color: colors.text,
    fontFamily: fonts.body,
    lineHeight: 20,
  },
  emptyWrap: {
    alignItems: "center",
    marginTop: 40,
  },
});
