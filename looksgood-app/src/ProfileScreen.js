import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { ActivityIndicator, Alert, Animated, FlatList, Image, Modal, Pressable, Share, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import API from "./services/api";
import ReelCard from "./ReelCard";
import { colors, fonts, radius } from "./theme";
import { BodyText, Screen } from "./ui";
import BrandGlyph from "./BrandGlyph";

const VIDEO_PATTERN = /\.(mp4|mov|m4v|webm|avi|mkv)(\?|$)/i;

function isVideoUrl(uri) {
  const value = String(uri || "").toLowerCase();
  if (!value) return false;
  return VIDEO_PATTERN.test(value) || value.includes("/video/upload/") || value.includes("/video/");
}

export default function ProfileScreen({ route, navigation }) {
  const userId = route.params?.userId;
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarAsset, setAvatarAsset] = useState(null);
  const [repostedPosts, setRepostedPosts] = useState([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [activeActivity, setActiveActivity] = useState("reels");
  const [aboutOpen, setAboutOpen] = useState(false);
  const [aboutDraft, setAboutDraft] = useState("");
  const introAnim = useRef(new Animated.Value(0)).current;
  const { height } = useWindowDimensions();
  const compact = height < 760;

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const endpoint = userId ? `/social/profile/${userId}` : "/social/profile/me";
      const res = await API.get(endpoint);
      const p = res.data?.profile || null;
      const basePosts = Array.isArray(res.data?.posts) ? res.data.posts : [];

      setProfile(p);
      setPosts(basePosts);
      setDisplayName(p?.username || "");
      setBio(p?.bio || "");

      if (p?.is_me) {
        setActivitiesLoading(true);
        const repostedRes = await API.get("/social/posts/reposted");
        const repostedRows = Array.isArray(repostedRes?.data) ? repostedRes.data : [];
        setRepostedPosts(repostedRows);
      } else {
        setRepostedPosts([]);
      }
    } catch (err) {
      Alert.alert("Failed", err?.message || "Could not load profile");
    } finally {
      setActivitiesLoading(false);
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    setActiveActivity("reels");
  }, [userId]);

  useEffect(() => {
    if (!profile) return;
    introAnim.setValue(0);
    Animated.timing(introAnim, {
      toValue: 1,
      duration: 540,
      useNativeDriver: true,
    }).start();
  }, [introAnim, profile]);

  const pickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow photo access to upload avatar.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.85,
      aspect: [1, 1],
    });
    if (!result.canceled) {
      setAvatarAsset(result.assets[0]);
    }
  };

  const captureAvatar = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow camera access to capture avatar.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.85,
      aspect: [1, 1],
    });
    if (!result.canceled) {
      setAvatarAsset(result.assets[0]);
    }
  };

  const saveProfile = async ({ nextDisplayName = displayName, nextBio = bio } = {}) => {
    try {
      setSaving(true);
      const formData = new FormData();
      formData.append("display_name", nextDisplayName || "");
      formData.append("bio", nextBio || "");
      if (avatarAsset?.uri) {
        formData.append("avatar", {
          uri: avatarAsset.uri,
          name: "avatar.jpg",
          type: "image/jpeg",
        });
      }
      await API.post("/social/profile/update", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setAvatarAsset(null);
      Alert.alert("Saved", "Profile updated.");
      await loadProfile();
    } catch (err) {
      Alert.alert("Save failed", err?.message || "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const toggleFollow = async () => {
    if (!profile || profile.is_me) return;
    try {
      if (profile.is_following) {
        await API.delete(`/social/follow/${profile.id}`);
      } else {
        await API.post(`/social/follow/${profile.id}`);
      }
      await loadProfile();
    } catch (err) {
      Alert.alert("Action failed", err?.message || "Please try again.");
    }
  };

  const openComments = (item) => navigation.navigate("Comments", { post: item });

  const toggleLike = async (item) => {
    try {
      if (item.liked_by_me) {
        await API.delete(`/social/posts/${item.id}/like`);
      } else {
        await API.post(`/social/posts/${item.id}/like`);
      }
      await loadProfile();
    } catch (err) {
      Alert.alert("Action failed", err?.message || "Please try again.");
    }
  };

  const sharePost = async (item) => {
    try {
      await API.post(`/social/posts/${item.id}/share`);
      await Share.share({ message: `Check out this look by @${item.user}: ${item.media_url || item.video_url}` });
      await loadProfile();
    } catch (err) {
      Alert.alert("Share failed", err?.message || "Please try again.");
    }
  };

  const avatarUri = avatarAsset?.uri || profile?.avatar_url;
  const heroTranslateY = introAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });
  const stats = useMemo(
    () => [
      { key: "posts", icon: "images-outline", label: "Posts", value: Number(profile?.posts_count ?? posts.length ?? 0) },
      { key: "followers", icon: "people-outline", label: "Followers", value: Number(profile?.followers ?? 0) },
      { key: "following", icon: "person-add-outline", label: "Following", value: Number(profile?.following ?? 0) },
    ],
    [posts.length, profile]
  );

  const postItems = useMemo(() => posts.filter((item) => !isVideoUrl(item?.media_url || item?.video_url)), [posts]);
  const reelItems = useMemo(() => posts.filter((item) => isVideoUrl(item?.media_url || item?.video_url)), [posts]);
  const repostedFallbackItems = useMemo(
    () =>
      posts.filter((item) =>
        String(item?.caption || "")
          .trim()
          .toLowerCase()
          .startsWith("repost from @")
      ),
    [posts]
  );
  const resolvedRepostedItems = repostedPosts.length > 0 ? repostedPosts : repostedFallbackItems;

  const activityTabs = useMemo(
    () => [
      { key: "posts", label: "Post", icon: "images-outline", count: postItems.length },
      { key: "reels", label: "Reel", icon: "film-outline", count: reelItems.length },
      { key: "reposts", label: "Repost", icon: "repeat-outline", count: resolvedRepostedItems.length },
    ],
    [postItems.length, reelItems.length, resolvedRepostedItems.length]
  );

  const visibleItems = useMemo(() => {
    if (activeActivity === "posts") return postItems;
    if (activeActivity === "reels") return reelItems;
    if (activeActivity === "reposts") return resolvedRepostedItems;
    return reelItems;
  }, [activeActivity, postItems, reelItems, resolvedRepostedItems]);

  const emptyMessage = useMemo(() => {
    if (activeActivity === "posts") return "No posts yet.";
    if (activeActivity === "reels") return "No reels yet.";
    if (activeActivity === "reposts") return "No repost activity yet.";
    return "Nothing to show.";
  }, [activeActivity]);

  const openAbout = useCallback(() => {
    setAboutDraft(profile?.bio || bio || "");
    setAboutOpen(true);
  }, [bio, profile?.bio]);

  const saveAbout = useCallback(async () => {
    await saveProfile({ nextBio: aboutDraft });
    setBio(aboutDraft);
    setAboutOpen(false);
  }, [aboutDraft, saveProfile]);

  const renderHeader = () => {
    if (loading && !profile) {
      return (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      );
    }
    if (!profile) return null;

    return (
      <View style={[styles.headerWrap, compact && styles.headerWrapCompact]}>
        <Animated.View style={{ opacity: introAnim, transform: [{ translateY: heroTranslateY }] }}>
          <View style={[styles.heroCard, compact && styles.heroCardCompact]}>
            <View style={styles.heroTopRow}>
              <View style={styles.avatarColumn}>
                <Pressable onPress={openAbout} style={styles.avatarShell}>
                  {avatarUri ? (
                    <Image source={{ uri: avatarUri }} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Ionicons name="person-outline" size={34} color="#3A3A3A" />
                    </View>
                  )}
                </Pressable>
                <Pressable onPress={openAbout} style={styles.aboutLink}>
                  <Text style={styles.aboutLinkText}>About</Text>
                </Pressable>
              </View>

              <View style={styles.heroIdentity}>
                <BrandGlyph size={compact ? 38 : 42} />
                <Text style={styles.heroName}>@{profile.username}</Text>
              </View>

              {profile.is_me ? (
                <Pressable onPress={() => navigation.navigate("Settings")} style={styles.heroIconBtn}>
                  <Ionicons name="settings-outline" size={20} color="#323232" />
                </Pressable>
              ) : (
                <Pressable onPress={toggleFollow} style={styles.followMiniBtn}>
                  <Text style={styles.followMiniText}>{profile.is_following ? "Requested" : "Request"}</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.statRow}>
              {stats.map((stat) => (
                <View key={stat.key} style={styles.statBox}>
                  <Ionicons name={stat.icon} size={14} color={colors.text} />
                  <Text style={styles.statValue}>{stat.value}</Text>
                  <Text style={styles.statLabel}>{stat.label}</Text>
                </View>
              ))}
            </View>

            <View style={styles.tabRow}>
              {activityTabs.map((tab) => {
                const active = activeActivity === tab.key;
                return (
                  <Pressable
                    key={tab.key}
                    onPress={() => setActiveActivity(tab.key)}
                    style={[styles.tabChip, active && styles.tabChipActive]}>
                    <Ionicons name={tab.icon} size={14} color={active ? "#FFFFFF" : colors.text} />
                    <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
                    <Text style={[styles.tabCount, active && styles.tabCountActive]}>{tab.count}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Animated.View>
      </View>
    );
  };

  return (
    <Screen padded={false}>
      <FlatList
        data={visibleItems}
        refreshing={loading}
        onRefresh={loadProfile}
        extraData={`${activeActivity}-${activitiesLoading}-${profile?.is_me ? "me" : "other"}`}
        keyExtractor={(item, index) => String(item?.id ?? `${activeActivity}-${index}`)}
        contentContainerStyle={[styles.listContent, compact && styles.listContentCompact]}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          profile ? (
            <View style={styles.emptyWrap}>
              {activitiesLoading && profile.is_me && activeActivity === "reposts" ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <BodyText>{emptyMessage}</BodyText>
              )}
              {profile.is_me && (activeActivity === "posts" || activeActivity === "reels") ? (
                <Pressable onPress={() => navigation.navigate("Upload")} style={styles.emptyAction}>
                  <Text style={styles.emptyActionText}>Create</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <ReelCard
            item={item}
            onToggleLike={toggleLike}
            onOpenComments={openComments}
            onOpenProfile={(x) => navigation.push("Profile", { userId: x.user_id })}
            onSharePost={sharePost}
          />
        )}
      />

      <Modal visible={aboutOpen} animationType="slide" transparent onRequestClose={() => setAboutOpen(false)}>
        <Pressable style={styles.aboutOverlay} onPress={() => setAboutOpen(false)}>
          <Pressable style={styles.aboutCard} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.aboutTitle}>About</Text>
            <Text style={styles.aboutSubtitle}>Share a short bio so people know your style.</Text>
            {profile?.is_me ? (
              <>
                <TextInput
                  value={aboutDraft}
                  onChangeText={setAboutDraft}
                  placeholder="Write something about you..."
                  placeholderTextColor={colors.subtext}
                  multiline
                  style={styles.aboutInput}
                />
                <View style={styles.aboutActions}>
                  <Pressable onPress={() => setAboutOpen(false)} style={styles.aboutGhostBtn}>
                    <Text style={styles.aboutGhostText}>Cancel</Text>
                  </Pressable>
                  <Pressable onPress={saveAbout} style={styles.aboutPrimaryBtn}>
                    <Text style={styles.aboutPrimaryText}>{saving ? "Saving..." : "Save"}</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <Text style={styles.aboutText}>{profile?.bio || "No bio yet."}</Text>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
    gap: 12,
  },
  listContentCompact: {
    paddingTop: 8,
    paddingBottom: 18,
    gap: 10,
  },
  loadingWrap: {
    alignItems: "center",
    marginTop: 36,
    marginBottom: 20,
  },
  headerWrap: {
    marginBottom: 8,
    gap: 12,
  },
  headerWrapCompact: {
    gap: 10,
  },
  heroCard: {
    borderRadius: radius.xl,
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#3A3A3A",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  heroCardCompact: {
    padding: 14,
  },
  heroTopRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  avatarColumn: {
    alignItems: "center",
    gap: 6,
  },
  avatarShell: {
    width: 76,
    height: 76,
    borderRadius: 38,
    padding: 2,
    backgroundColor: colors.bgStrong,
  },
  aboutLink: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#FFFFFF",
  },
  aboutLinkText: {
    color: colors.text,
    fontFamily: fonts.body,
    fontWeight: "700",
    fontSize: 11,
  },
  avatar: {
    width: "100%",
    height: "100%",
    borderRadius: 36,
  },
  avatarFallback: {
    width: "100%",
    height: "100%",
    borderRadius: 36,
    backgroundColor: "#F0F0F0",
    alignItems: "center",
    justifyContent: "center",
  },
  heroIdentity: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  heroKicker: {
    color: "#F0F0F0",
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  heroName: {
    color: colors.text,
    fontFamily: fonts.display,
    fontWeight: "800",
    fontSize: 26,
  },
  heroEmail: {
    color: "#F1F1F1",
    marginTop: 2,
  },
  heroIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.9)",
  },
  followMiniBtn: {
    borderRadius: radius.pill,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  followMiniText: {
    color: "#2F2F2F",
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 12,
  },
  statRow: {
    marginTop: 14,
    flexDirection: "row",
    gap: 8,
  },
  tabRow: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tabChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: colors.bgStrong,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabChipActive: {
    backgroundColor: "#606060",
    borderColor: "#606060",
  },
  tabText: {
    color: colors.text,
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 12,
  },
  tabTextActive: {
    color: "#FFFFFF",
  },
  tabCount: {
    color: colors.subtext,
    fontFamily: fonts.mono,
    fontSize: 11,
  },
  tabCountActive: {
    color: "#F6F6F6",
  },
  statBox: {
    flex: 1,
    alignItems: "center",
    borderRadius: 14,
    paddingVertical: 8,
    backgroundColor: colors.bgStrong,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: {
    color: colors.text,
    fontFamily: fonts.display,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 2,
  },
  statLabel: {
    color: colors.subtext,
    fontFamily: fonts.body,
    fontSize: 11,
    marginTop: 1,
  },
  heroBio: {
    color: "#F1F1F1",
    marginTop: 11,
  },
  emptyWrap: {
    alignItems: "center",
    marginTop: 56,
    gap: 10,
  },
  emptyAction: {
    borderRadius: radius.pill,
    backgroundColor: "#757575",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  emptyActionText: {
    color: "#FFFFFF",
    fontFamily: fonts.body,
    fontWeight: "800",
  },
  aboutOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    alignItems: "center",
    justifyContent: "flex-end",
    padding: 16,
  },
  aboutCard: {
    width: "100%",
    borderRadius: radius.lg,
    backgroundColor: "#FFFFFF",
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  aboutTitle: {
    color: colors.text,
    fontFamily: fonts.display,
    fontSize: 18,
    fontWeight: "800",
  },
  aboutSubtitle: {
    color: colors.subtext,
    fontFamily: fonts.body,
    fontSize: 12,
  },
  aboutInput: {
    minHeight: 110,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    color: colors.text,
    fontFamily: fonts.body,
    textAlignVertical: "top",
    backgroundColor: "#FFFFFF",
  },
  aboutText: {
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  aboutActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  aboutGhostBtn: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
  },
  aboutGhostText: {
    color: colors.text,
    fontFamily: fonts.body,
    fontWeight: "700",
  },
  aboutPrimaryBtn: {
    borderRadius: radius.pill,
    backgroundColor: "#606060",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  aboutPrimaryText: {
    color: "#FFFFFF",
    fontFamily: fonts.body,
    fontWeight: "800",
  },
});
