import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Video } from "expo-av";
import ReelCard from "./ReelCard";
import API from "./services/api";
import { colors, fonts, radius } from "./theme";
import { Screen } from "./ui";
import BrandGlyph from "./BrandGlyph";

const VIDEO_PATTERN = /\.(mp4|mov|m4v|webm|avi|mkv)(\?|$)/i;

function isVideoUrl(uri) {
  const value = String(uri || "").toLowerCase();
  if (!value) return false;
  return VIDEO_PATTERN.test(value) || value.includes("/video/upload/") || value.includes("/video/");
}

export default function FeedScreen({ navigation }) {
  const [feed, setFeed] = useState([]);
  const [stories, setStories] = useState([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [headerHeight, setHeaderHeight] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerStartIndex, setViewerStartIndex] = useState(0);
  const [viewerPausedMap, setViewerPausedMap] = useState({});
  const viewerListRef = useRef(null);

  const introAnim = useRef(new Animated.Value(0)).current;
  const { height } = useWindowDimensions();
  const compact = height < 760;

  const actionItems = [
    { key: "create", icon: "add-circle", route: "Upload" },
    { key: "reels", icon: "film", route: "Reels" },
    { key: "ai", icon: "sparkles", route: "AIAgent" },
    { key: "agent", icon: "mic", route: "AppAgent" },
    { key: "trends", icon: "trending-up", route: "Trends" },
    { key: "dna", icon: "finger-print", route: "StyleDNA" },
    { key: "profile", icon: "person-circle", route: "Profile" },
    { key: "chat", icon: "chatbubble-ellipses", route: "Chat" },
  ];

  // Shrink requested: -120px normal, -90px compact.
  const feedShrinkPx = compact ? 90 : 120;
  const feedViewportHeight = useMemo(
    () => Math.max(320, Math.round(height - headerHeight - feedShrinkPx)),
    [feedShrinkPx, height, headerHeight]
  );

  const reelItems = useMemo(
    () => feed.filter((entry) => String(entry?.media_url || entry?.video_url || "").trim()),
    [feed]
  );

  const loadFeed = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [feedRes, notificationsRes, storiesRes] = await Promise.allSettled([
        API.get("/feed/ai"),
        API.get("/social/notifications"),
        API.get("/stories"),
      ]);

      if (feedRes.status === "fulfilled") {
        setFeed(Array.isArray(feedRes.value?.data) ? feedRes.value.data : []);
      } else {
        throw feedRes.reason;
      }

      if (notificationsRes.status === "fulfilled") {
        const rows = Array.isArray(notificationsRes.value?.data) ? notificationsRes.value.data : [];
        const unread = rows.filter((item) => !item?.is_read).length;
        setUnreadNotifications(unread);
      } else {
        setUnreadNotifications(0);
      }

      if (storiesRes.status === "fulfilled") {
        setStories(Array.isArray(storiesRes.value?.data) ? storiesRes.value.data : []);
      } else {
        setStories([]);
      }
    } catch (err) {
      setError(err?.message || "Unable to load feed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  useEffect(() => {
    Animated.timing(introAnim, {
      toValue: 1,
      duration: 460,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [introAnim]);

  const openProfile = useCallback(
    (item) => {
      const userId = Number(item?.user_id || item?.userId || item?.user?.id || 0);
      if (!userId) return;
      navigation.navigate("Profile", { userId });
    },
    [navigation]
  );

  const openComments = useCallback(
    (item) => {
      if (!item) return;
      navigation.navigate("Comments", { post: item });
    },
    [navigation]
  );

  const sharePost = useCallback(async (item) => {
    try {
      const url = item?.media_url || item?.video_url || item?.link || "";
      const message = item?.caption ? `${item.caption}\n${url}` : String(url || "LooksGood");
      await Share.share({ message });
    } catch (_err) {
      // no-op
    }
  }, []);

  const toggleLike = useCallback(async (item) => {
    if (!item?.id) return;
    const postId = item.id;
    const wasLiked = Boolean(item.liked_by_me);
    try {
      if (wasLiked) {
        await API.delete(`/social/posts/${postId}/like`);
      } else {
        await API.post(`/social/posts/${postId}/like`);
      }
      setFeed((prev) =>
        prev.map((entry) => {
          if (entry?.id !== postId) return entry;
          const nextLikes = Math.max(0, Number(entry.likes_count ?? 0) + (wasLiked ? -1 : 1));
          return { ...entry, liked_by_me: !wasLiked, likes_count: nextLikes };
        })
      );
    } catch (err) {
      Alert.alert("Like failed", err?.message || "Unable to update like.");
    }
  }, []);

  const openFullscreenViewer = useCallback(
    (item) => {
      const mediaUrl = item?.media_url || item?.video_url;
      if (!mediaUrl) return;
      const idx = reelItems.findIndex((x) => x?.id === item?.id);
      setViewerStartIndex(Math.max(0, idx));
      setViewerPausedMap({});
      setViewerOpen(true);
      setTimeout(() => {
        try {
          viewerListRef.current?.scrollToIndex?.({ index: Math.max(0, idx), animated: false });
        } catch (_err) {
          // no-op
        }
      }, 0);
    },
    [reelItems]
  );

  const heroOpacity = introAnim;
  const heroTranslateY = introAnim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });
  const topIconLift = compact ? 16 : 12;

  return (
    <Screen padded={false}>
      <View style={{ flex: 1 }}>
        <Animated.View
          onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
          style={[styles.topContainer, compact && styles.topContainerCompact, { opacity: heroOpacity, transform: [{ translateY: heroTranslateY }] }]}>
          <View style={styles.topBar}>
            <Pressable onPress={() => navigation.navigate("Notifications")} style={[styles.notifyBtn, { marginTop: topIconLift }]}>
              <Ionicons name="notifications-outline" size={18} color="#29414E" />
              {unreadNotifications > 0 ? (
                <View style={styles.notifyBadge}>
                  <Text style={styles.notifyBadgeText}>{unreadNotifications > 99 ? "99+" : String(unreadNotifications)}</Text>
                </View>
              ) : null}
            </Pressable>

            <View style={styles.topTitleWrap}>
              <Text style={styles.topTitle}>LooksGood</Text>
            </View>

            <View style={[styles.topLogoWrap, { marginTop: topIconLift }]}>
              <BrandGlyph size={30} flat />
            </View>
          </View>

          <View style={styles.iconRailWrap}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.iconRailRow}>
              {actionItems.map((action) => (
                <View key={action.key} style={styles.iconFrame}>
                  <Pressable onPress={() => navigation.navigate(action.route)} style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}>
                    <Ionicons name={action.icon} size={14} color={colors.text} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          </View>

          <View style={styles.storyBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storyRow}>
              {stories.length === 0 ? (
                <View style={styles.storyPlaceholder}>
                  <Ionicons name="add" size={20} color={colors.subtext} />
                </View>
              ) : (
                stories.map((story) => (
                  <Pressable key={story.id} onPress={() => navigation.navigate("StoryViewer", { story })} style={styles.storyItem}>
                    {story.media_url ? (
                      <Image source={{ uri: story.media_url }} style={styles.storyThumb} />
                    ) : (
                      <View style={[styles.storyThumb, styles.storyThumbFallback]}>
                        <Text numberOfLines={2} style={styles.storyText}>
                          {story.status_text || story.caption || "@story"}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                ))
              )}
            </ScrollView>
          </View>
        </Animated.View>

        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="warning-outline" size={18} color={colors.danger} />
            <Text style={styles.errorText} numberOfLines={1}>
              {error}
            </Text>
            <Pressable onPress={loadFeed} style={styles.errorRetryIcon}>
              <Ionicons name="refresh-outline" size={18} color={colors.primary} />
            </Pressable>
          </View>
        ) : null}

        <View style={[styles.feedViewport, { height: feedViewportHeight }]}>
          <FlatList
            data={feed}
            refreshing={loading}
            onRefresh={loadFeed}
            keyExtractor={(item, index) => String(item?.id ?? index)}
            snapToAlignment="start"
            snapToInterval={feedViewportHeight}
            disableIntervalMomentum
            decelerationRate="fast"
            showsVerticalScrollIndicator={false}
            style={styles.feedList}
            getItemLayout={(_data, index) => ({
              length: feedViewportHeight,
              offset: feedViewportHeight * index,
              index,
            })}
            renderItem={({ item }) => (
              <View style={{ height: feedViewportHeight }}>
                <ReelCard
                  item={item}
                  onToggleLike={toggleLike}
                  onOpenComments={openComments}
                  onOpenProfile={openProfile}
                  onSharePost={sharePost}
                  onOpenViewer={openFullscreenViewer}
                  fullBleed
                  mediaHeight={feedViewportHeight}
                />
              </View>
            )}
            ListEmptyComponent={
              !loading ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>No posts yet</Text>
                  <Text style={styles.emptySub}>Follow creators or create a new look to start your feed.</Text>
                </View>
              ) : null
            }
          />
        </View>
      </View>

      <Modal visible={viewerOpen} animationType="slide" transparent={false} onRequestClose={() => setViewerOpen(false)}>
        <View style={styles.viewerRoot}>
          <Pressable onPress={() => setViewerOpen(false)} style={styles.viewerClose}>
            <Ionicons name="close" size={20} color="#FFFFFF" />
          </Pressable>

          <FlatList
            ref={viewerListRef}
            data={reelItems}
            pagingEnabled
            showsVerticalScrollIndicator={false}
            initialScrollIndex={viewerStartIndex}
            getItemLayout={(_data, index) => ({
              length: height,
              offset: height * index,
              index,
            })}
            onScrollToIndexFailed={() => {}}
            keyExtractor={(item, index) => String(item?.id ?? index)}
            renderItem={({ item }) => {
              const mediaUrl = item?.media_url || item?.video_url;
              const hasVideo = isVideoUrl(mediaUrl);
              const paused = Boolean(viewerPausedMap[item?.id]);
              return (
                <View style={[styles.viewerPage, { height }]}>
                  <Pressable
                    onPress={() => {
                      if (hasVideo && item?.id) {
                        setViewerPausedMap((prev) => ({ ...prev, [item.id]: !prev[item.id] }));
                      }
                    }}
                    style={styles.viewerMediaTap}>
                    {hasVideo ? (
                      <Video source={{ uri: mediaUrl }} style={styles.viewerMedia} resizeMode="cover" shouldPlay={!paused} isLooping />
                    ) : (
                      <Image source={{ uri: mediaUrl }} style={styles.viewerMedia} resizeMode="cover" />
                    )}
                    {hasVideo && paused ? (
                      <View style={styles.viewerPlayOverlay}>
                        <Ionicons name="play" size={52} color="#FFFFFF" />
                      </View>
                    ) : null}
                  </Pressable>
                </View>
              );
            }}
          />
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topContainer: {
    paddingHorizontal: 14,
    paddingTop: 0,
    paddingBottom: 2,
    gap: 4,
    marginTop: -16,
  },
  topContainerCompact: {
    paddingTop: 0,
    gap: 4,
    marginTop: -16,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  topTitleWrap: {
    flex: 1,
    alignItems: "center",
  },
  topTitle: {
    fontFamily: fonts.display,
    fontWeight: "800",
    fontSize: 22,
    letterSpacing: 0.6,
    color: "#26333E",
  },
  topLogoWrap: {
    width: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  notifyBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    borderWidth: 0,
    borderColor: "transparent",
  },
  notifyBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#E76F51",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  notifyBadgeText: {
    color: "#FFFFFF",
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 9,
  },
  iconRailWrap: {
    backgroundColor: "#FFFFFF",
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  iconRailRow: {
    gap: 10,
    paddingHorizontal: 4,
  },
  iconFrame: {
    borderRadius: 14,
    padding: 1,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgStrong,
  },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  iconBtnPressed: {
    transform: [{ scale: 0.95 }],
  },
  storyBar: {
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 10,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  storyRow: {
    gap: 10,
    paddingHorizontal: 2,
  },
  storyItem: {
    width: 64,
    height: 64,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgStrong,
  },
  storyThumb: {
    width: "100%",
    height: "100%",
  },
  storyText: {
    color: colors.text,
    fontFamily: fonts.body,
    fontWeight: "700",
    fontSize: 10,
    textAlign: "center",
    paddingHorizontal: 6,
  },
  storyPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgStrong,
  },
  storyThumbFallback: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    backgroundColor: colors.bgStrong,
  },
  errorBox: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 6,
    backgroundColor: colors.bgStrong,
    borderRadius: radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  errorText: {
    flex: 1,
    color: colors.subtext,
    fontFamily: fonts.body,
    fontSize: 12,
  },
  errorRetryIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: colors.border,
  },
  feedViewport: {
    alignSelf: "stretch",
    overflow: "hidden",
  },
  feedList: {
    flex: 1,
  },
  emptyState: {
    alignItems: "center",
    marginTop: 80,
    paddingHorizontal: 20,
    gap: 10,
  },
  emptyTitle: {
    color: colors.text,
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 15,
  },
  emptySub: {
    color: colors.subtext,
    fontFamily: fonts.body,
    fontSize: 12,
    textAlign: "center",
  },
  viewerRoot: {
    flex: 1,
    backgroundColor: "#101010",
  },
  viewerClose: {
    position: "absolute",
    zIndex: 10,
    top: 44,
    right: 14,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.42)",
  },
  viewerPage: {
    width: "100%",
  },
  viewerMediaTap: {
    flex: 1,
  },
  viewerMedia: {
    width: "100%",
    height: "100%",
  },
  viewerPlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.2)",
  },
});
