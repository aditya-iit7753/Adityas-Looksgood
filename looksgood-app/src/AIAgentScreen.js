import * as ImagePicker from "expo-image-picker";
import { Video } from "expo-av";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import API from "./services/api";
import { colors, fonts, radius } from "./theme";
import { BodyText, Card, Screen, Title } from "./ui";

const VIDEO_PATTERN = /\.(mp4|mov|m4v|webm|avi|mkv)(\?|$)/i;

const modes = [
  { key: "image", icon: "image-outline" },
  { key: "video", icon: "videocam-outline" },
  { key: "audio", icon: "musical-notes-outline" },
  { key: "content", icon: "sparkles-outline" },
  { key: "text", icon: "document-text-outline" },
];

const faceFilters = [
  { key: "glow", label: "Glow" },
  { key: "warm", label: "Warm" },
  { key: "cool", label: "Cool" },
  { key: "noir", label: "Noir" },
  { key: "vivid", label: "Vivid" },
];

const starterPrompts = [
  "Luxury streetwear reveal with bold transitions",
  "Romantic date-night vibe with soft glow",
  "Short voiceover script for styling tips",
  "Create a high-retention reel concept for this week",
];

const goalOptions = [
  { label: "Viral Reel", directive: "Generate a viral reel idea with hook, shot plan, and CTA." },
  { label: "Post Caption", directive: "Generate a premium social post caption with hashtags." },
  { label: "Voiceover", directive: "Generate short voiceover script and audio-ready wording." },
  { label: "Image Concept", directive: "Generate image concept, styling direction, and mood." },
  { label: "Brand Ad", directive: "Generate product-focused creator ad concept for conversion." },
];

function isVideoUrl(uri) {
  const value = String(uri || "").toLowerCase();
  if (!value) return false;
  return VIDEO_PATTERN.test(value) || value.includes("/video/upload/");
}

export default function AIAgentScreen({ navigation, route }) {
  const [mode, setMode] = useState("content");
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("");
  const [selectedGoal, setSelectedGoal] = useState("");
  const [sourceMedia, setSourceMedia] = useState(null);
  const [oldContentOpen, setOldContentOpen] = useState(false);
  const [oldContentLoading, setOldContentLoading] = useState(false);
  const [oldContentItems, setOldContentItems] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [toolBusy, setToolBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState(null);

  const isBusy = useMemo(() => generating || toolBusy || publishing, [generating, toolBusy, publishing]);
  const canGenerate = useMemo(() => prompt.trim().length > 0 && !isBusy, [prompt, isBusy]);
  const canUploadCreation = useMemo(() => Boolean(result) && !publishing, [result, publishing]);

  useEffect(() => {
    const presetPrompt = route?.params?.presetPrompt;
    const presetMode = route?.params?.presetMode;

    const nextPrompt = typeof presetPrompt === "string" ? presetPrompt.trim() : "";
    const nextMode = typeof presetMode === "string" ? presetMode.trim() : "";

    if (nextPrompt) setPrompt(nextPrompt);
    if (nextMode && modes.some((m) => m.key === nextMode)) setMode(nextMode);

    if (presetPrompt != null || presetMode != null) {
      navigation.setParams({ presetPrompt: undefined, presetMode: undefined });
    }
  }, [navigation, route?.params?.presetMode, route?.params?.presetPrompt]);

  const pickSourceFromLibrary = async (kind) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Please allow media library access.");
      return;
    }

    const resultPicker = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: kind === "video" ? ["videos"] : ["images"],
      allowsEditing: kind !== "video",
      quality: 0.9,
      aspect: [4, 5],
    });

    if (resultPicker.canceled || !resultPicker.assets?.[0]?.uri) return;

    const asset = resultPicker.assets[0];
    const sourceKind = kind === "video" ? "video" : "image";
    setSourceMedia({
      local: true,
      kind: sourceKind,
      uri: asset.uri,
      name: asset.fileName || `studio-source-${Date.now()}.${sourceKind === "video" ? "mp4" : "jpg"}`,
      mimeType: asset.mimeType || (sourceKind === "video" ? "video/mp4" : "image/jpeg"),
      source: sourceKind === "video" ? "library_video" : "library_image",
    });
    setOldContentOpen(false);
  };

  const pickToolImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Please allow photo access.");
      return null;
    }

    const resultPicker = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.9,
      aspect: [4, 5],
    });
    if (resultPicker.canceled || !resultPicker.assets?.[0]?.uri) return null;
    return resultPicker.assets[0];
  };

  const runTextToImage = () => {
    setMode("image");
    if (!prompt.trim()) {
      setPrompt("Create a cinematic fashion portrait with soft studio lighting.");
    }
    Alert.alert("Text → Image", "Add your prompt and tap Generate.");
  };

  const runTextToVideo = () => {
    setMode("video");
    if (!prompt.trim()) {
      setPrompt("Create a 6-second fashion reel concept with cinematic lighting.");
    }
    Alert.alert("Text → Video", "Add your prompt and tap Generate.");
  };

  const openARFilters = () => {
    navigation.navigate("ARFilters");
  };

  const openAvatar3D = () => {
    navigation.navigate("Avatar3D");
  };

  const applyFaceFilter = async (asset, filterKey) => {
    if (!asset?.uri || isBusy) return;
    setToolBusy(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("filter_name", filterKey);
      formData.append("image", {
        uri: asset.uri,
        name: asset.fileName || `face-filter-${Date.now()}.jpg`,
        type: asset.mimeType || "image/jpeg",
      });
      const res = await API.post("/ai/face-filter", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(res?.data || null);
      setMode("image");
    } catch (err) {
      Alert.alert("Face filter failed", err?.message || "Could not apply face filter.");
    } finally {
      setToolBusy(false);
    }
  };

  const openFaceFilter = async () => {
    if (isBusy) return;
    const asset = await pickToolImage();
    if (!asset) return;

    Alert.alert(
      "Choose Face Filter",
      "Pick a filter style",
      [
        ...faceFilters.map((filter) => ({
          text: filter.label,
          onPress: () => applyFaceFilter(asset, filter.key),
        })),
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

  const runBackgroundChange = async () => {
    if (isBusy) return;
    const asset = await pickToolImage();
    if (!asset) return;

    setToolBusy(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("prompt", prompt.trim() || style.trim());
      formData.append("style", style.trim());
      formData.append("image", {
        uri: asset.uri,
        name: asset.fileName || `background-change-${Date.now()}.jpg`,
        type: asset.mimeType || "image/jpeg",
      });
      const res = await API.post("/ai/background-change", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(res?.data || null);
      setMode("image");
    } catch (err) {
      Alert.alert("Background change failed", err?.message || "Could not update background.");
    } finally {
      setToolBusy(false);
    }
  };

  const loadOldContent = async () => {
    setOldContentLoading(true);
    try {
      const res = await API.get("/social/profile/me");
      const posts = Array.isArray(res?.data?.posts) ? res.data.posts : [];
      const mapped = posts
        .filter((post) => String(post?.media_url || "").trim())
        .slice(0, 18)
        .map((post) => {
          const mediaUrl = String(post.media_url).trim();
          return {
            id: String(post.id),
            uri: mediaUrl,
            local: false,
            kind: isVideoUrl(mediaUrl) ? "video" : "image",
            caption: String(post.caption || "").trim(),
            source: "old_content",
          };
        });
      setOldContentItems(mapped);
    } catch (err) {
      Alert.alert("Could not load content", err?.message || "Please try again.");
      setOldContentItems([]);
    } finally {
      setOldContentLoading(false);
    }
  };

  const toggleOldContent = async () => {
    if (!oldContentOpen && oldContentItems.length === 0 && !oldContentLoading) {
      await loadOldContent();
    }
    setOldContentOpen((prev) => !prev);
  };

  const applyGoalToPrompt = (goal) => {
    const directive = String(goal?.directive || "").trim();
    const label = String(goal?.label || "").trim();
    if (!directive) return;

    setSelectedGoal(label);
    setPrompt((prev) => {
      const current = String(prev || "").trim();
      if (!current) return directive;
      if (current.toLowerCase().includes(directive.toLowerCase())) return current;
      return `${current}\n\nGoal: ${directive}`;
    });
  };

  const openGoalPicker = () => {
    Alert.alert(
      "Define Creation Goal",
      "Choose what you want this prompt to generate",
      [
        ...goalOptions.map((goal) => ({
          text: goal.label,
          onPress: () => applyGoalToPrompt(goal),
        })),
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

  const generateWithStudio = async () => {
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt) {
      Alert.alert("Prompt required", "Enter a prompt first.");
      return;
    }

    setGenerating(true);
    setResult(null);
    try {
      let res;
      if (sourceMedia?.local && sourceMedia.uri) {
        const formData = new FormData();
        formData.append("prompt", cleanPrompt);
        formData.append("kind", mode);
        formData.append("style", style.trim());
        formData.append("file", {
          uri: sourceMedia.uri,
          name: sourceMedia.name || `studio-${Date.now()}.bin`,
          type: sourceMedia.mimeType || "application/octet-stream",
        });
        res = await API.post("/ai/studio/generate-with-upload", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      } else {
        res = await API.post("/ai/studio/generate", {
          prompt: cleanPrompt,
          kind: mode,
          style: style.trim() || null,
          source_url: sourceMedia?.uri || null,
        });
      }
      setResult(res?.data || null);
    } catch (err) {
      Alert.alert("Generation failed", err?.message || "Could not generate content.");
    } finally {
      setGenerating(false);
    }
  };

  const publishResultTo = async (target = "Feed") => {
    if (!result || publishing) return;
    const mediaUrl =
      result.publish_media_url ||
      result.video_url ||
      result.preview_image_url ||
      result.asset_url ||
      null;
    if (!mediaUrl) {
      Alert.alert("Nothing to publish", "Generate an asset first.");
      return;
    }

    setPublishing(true);
    try {
      const hashtags = Array.isArray(result?.hashtags) ? result.hashtags.join(" ") : "";
      const caption = `${result?.caption || prompt} ${hashtags}`.trim().slice(0, 500);
      await API.post("/ai/studio/publish", {
        media_url: mediaUrl,
        caption,
      });
      Alert.alert("Published", "Your generated creation is now live.");
      navigation.navigate(target);
    } catch (err) {
      Alert.alert("Publish failed", err?.message || "Could not publish this creation.");
    } finally {
      setPublishing(false);
    }
  };

  const openUploadCreationMenu = () => {
    if (!result) {
      Alert.alert("Generate first", "Create content first, then upload it.");
      return;
    }
    if (publishing) return;

    Alert.alert("Upload Creation", "Choose destination", [
      {
        text: "Upload to Reels",
        onPress: () => {
          publishResultTo("Reels");
        },
      },
      {
        text: "Post to Feed",
        onPress: () => {
          publishResultTo("Feed");
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Title size={28}>Creative Studio</Title>
          <BodyText>Generate image, video, audio, and creator content from one prompt.</BodyText>
        </View>
        <View style={styles.headerActions}>
          <Pressable onPress={() => navigation.navigate("Chat")} style={styles.headerBtn}>
            <Ionicons name="chatbubble-ellipses-outline" size={16} color="#2F2F2F" />
          </Pressable>
          <Pressable onPress={() => navigation.navigate("Feed")} style={styles.headerBtn}>
            <Ionicons name="home-outline" size={16} color="#2F2F2F" />
          </Pressable>
        </View>
      </View>

      <Pressable onPress={() => navigation.navigate("CreatorChat")} style={styles.creatorChatCard}>
        <View style={styles.creatorChatIcon}>
          <Ionicons name="chatbubble-ellipses-outline" size={18} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.creatorChatTitle}>Creator AI Chatbot</Text>
          <BodyText style={styles.creatorChatSub}>Ask for hooks, captions, growth tips, or content strategy.</BodyText>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#A0A0A0" />
      </Pressable>

      <Card style={styles.quickCard}>
        <Text style={styles.quickTitle}>AI Visual Tools</Text>
        <View style={styles.quickRow}>
          <Pressable onPress={runTextToImage} disabled={isBusy} style={[styles.quickAction, isBusy && styles.disabledBtn]}>
            <Ionicons name="image-outline" size={18} color="#404040" />
            <Text style={styles.quickActionText}>Text → Image</Text>
          </Pressable>
          <Pressable onPress={runTextToVideo} disabled={isBusy} style={[styles.quickAction, isBusy && styles.disabledBtn]}>
            <Ionicons name="film-outline" size={18} color="#404040" />
            <Text style={styles.quickActionText}>Text → Video</Text>
          </Pressable>
        </View>
        <View style={styles.quickRow}>
          <Pressable onPress={openFaceFilter} disabled={isBusy} style={[styles.quickAction, isBusy && styles.disabledBtn]}>
            <Ionicons name="sparkles-outline" size={18} color="#404040" />
            <Text style={styles.quickActionText}>AI Face Filters</Text>
          </Pressable>
          <Pressable onPress={runBackgroundChange} disabled={isBusy} style={[styles.quickAction, isBusy && styles.disabledBtn]}>
            <Ionicons name="color-wand-outline" size={18} color="#404040" />
            <Text style={styles.quickActionText}>Auto Background</Text>
          </Pressable>
        </View>
        <View style={styles.quickRow}>
          <Pressable onPress={openARFilters} disabled={isBusy} style={[styles.quickAction, isBusy && styles.disabledBtn]}>
            <Ionicons name="aperture-outline" size={18} color="#404040" />
            <Text style={styles.quickActionText}>AR Filters</Text>
          </Pressable>
          <Pressable onPress={openAvatar3D} disabled={isBusy} style={[styles.quickAction, isBusy && styles.disabledBtn]}>
            <Ionicons name="person-circle-outline" size={18} color="#404040" />
            <Text style={styles.quickActionText}>3D Avatars</Text>
          </Pressable>
        </View>
      </Card>

      <Card>
        <View style={styles.modeRow}>
          {modes.map((item) => {
            const active = item.key === mode;
            return (
              <Pressable key={item.key} onPress={() => setMode(item.key)} style={[styles.modeChip, active && styles.modeChipActive]}>
                <Ionicons name={item.icon} size={16} color={active ? "#FFFFFF" : "#404040"} />
              </Pressable>
            );
          })}
        </View>

        <View style={styles.sourceActionsRow}>
          <Pressable onPress={() => pickSourceFromLibrary("image")} style={styles.sourceActionBtn}>
            <Ionicons name="image-outline" size={16} color="#404040" />
            <Text style={styles.sourceActionText}>Image</Text>
          </Pressable>
          <Pressable onPress={() => pickSourceFromLibrary("video")} style={styles.sourceActionBtn}>
            <Ionicons name="videocam-outline" size={16} color="#404040" />
            <Text style={styles.sourceActionText}>Video</Text>
          </Pressable>
          <Pressable onPress={toggleOldContent} style={styles.sourceActionBtn}>
            <Ionicons name="albums-outline" size={16} color="#404040" />
            <Text style={styles.sourceActionText}>Old</Text>
          </Pressable>
        </View>

        {sourceMedia ? (
          <View style={styles.sourcePreview}>
            {sourceMedia.kind === "image" ? (
              <Image source={{ uri: sourceMedia.uri }} style={styles.sourcePreviewImage} resizeMode="cover" />
            ) : (
              <Video source={{ uri: sourceMedia.uri }} style={styles.sourcePreviewImage} resizeMode="cover" isLooping isMuted shouldPlay />
            )}
            <View style={styles.sourceInfoRow}>
              <Text style={styles.sourceInfoText}>{sourceMedia.source === "old_content" ? "Using old content" : "Using selected source"}</Text>
              <Pressable onPress={() => setSourceMedia(null)} style={styles.clearBtn}>
                <Text style={styles.clearBtnText}>Clear</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {oldContentOpen ? (
          <View style={styles.oldWrap}>
            {oldContentLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : oldContentItems.length === 0 ? (
              <BodyText>No old posts found.</BodyText>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.oldRow}>
                {oldContentItems.map((item) => (
                  <Pressable key={item.id} onPress={() => setSourceMedia(item)} style={styles.oldItem}>
                    {item.kind === "image" ? (
                      <Image source={{ uri: item.uri }} style={styles.oldThumb} resizeMode="cover" />
                    ) : (
                      <View style={styles.oldVideo}>
                        <Ionicons name="play-circle-outline" size={20} color="#404040" />
                      </View>
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        ) : null}

        <View style={styles.promptInputWrap}>
          <TextInput
            value={prompt}
            onChangeText={setPrompt}
            placeholder="Describe what you want to create..."
            placeholderTextColor={colors.subtext}
            multiline
            textAlignVertical="top"
            style={[styles.input, styles.promptInput, styles.promptInputWithPlus]}
          />
          <Pressable onPress={openGoalPicker} style={styles.promptPlusBtn}>
            <Ionicons name="add" size={18} color="#FFFFFF" />
          </Pressable>
        </View>
        {selectedGoal ? <BodyText style={styles.goalTag}>Goal: {selectedGoal}</BodyText> : null}
        <TextInput
          value={style}
          onChangeText={setStyle}
          placeholder="Style hint (optional): cinematic, minimal, bold"
          placeholderTextColor={colors.subtext}
          style={styles.input}
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.promptChipRow}>
          {starterPrompts.map((sample) => (
            <Pressable key={sample} onPress={() => setPrompt(sample)} style={styles.promptChip}>
              <Text numberOfLines={1} style={styles.promptChipText}>
                {sample}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <Pressable onPress={generateWithStudio} disabled={!canGenerate} style={[styles.generateBtn, !canGenerate && styles.disabledBtn]}>
          <Text style={styles.generateBtnText}>{generating ? "Generating..." : "Generate"}</Text>
        </Pressable>
        <Pressable
          onPress={openUploadCreationMenu}
          disabled={!canUploadCreation}
          style={[styles.uploadCreationBtn, !canUploadCreation && styles.disabledBtn]}>
          <Text style={styles.uploadCreationBtnText}>{publishing ? "Uploading..." : "Upload Creation"}</Text>
        </Pressable>
      </Card>

        {result ? (
          <Card style={styles.resultCard}>
          <View style={styles.resultHeader}>
            <Text style={styles.resultTitle}>{result.title || "Result"}</Text>
            <Text style={styles.resultMeta}>{`${result.provider || "fallback"} / ${result.model || "studio-v1"}`}</Text>
          </View>

          {result.video_url ? (
            <Video source={{ uri: result.video_url }} style={styles.resultPreview} resizeMode="cover" useNativeControls />
          ) : result.preview_image_url ? (
            <Image source={{ uri: result.preview_image_url }} style={styles.resultPreview} resizeMode="cover" />
          ) : null}

          {result.audio_url ? (
            <Video source={{ uri: result.audio_url }} style={styles.audioPreview} useNativeControls resizeMode="contain" />
          ) : null}

          <BodyText style={styles.resultText}>{result.caption}</BodyText>
          <BodyText style={styles.resultText}>{result.content_text}</BodyText>
          <BodyText style={styles.hashText}>{Array.isArray(result.hashtags) ? result.hashtags.join(" ") : ""}</BodyText>

          <Pressable onPress={() => publishResultTo("Feed")} disabled={publishing} style={[styles.publishBtn, publishing && styles.disabledBtn]}>
            <Text style={styles.publishBtnText}>{publishing ? "Publishing..." : "Publish"}</Text>
          </Pressable>
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 24,
    gap: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  headerBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F3F3",
    borderWidth: 1,
    borderColor: "#D9D9D9",
  },
  creatorChatCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: radius.lg,
    backgroundColor: "#515151",
    borderWidth: 1,
    borderColor: "#434343",
    marginBottom: 8,
  },
  creatorChatIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.18)",
  },
  creatorChatTitle: {
    color: "#FFFFFF",
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 14,
  },
  creatorChatSub: {
    color: "rgba(255, 255, 255, 0.78)",
    fontSize: 12,
  },
  quickCard: {
    backgroundColor: "#FAFAFA",
    borderColor: "#DDDDDD",
    gap: 10,
  },
  quickTitle: {
    color: "#404040",
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 14,
  },
  quickRow: {
    flexDirection: "row",
    gap: 10,
  },
  quickAction: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#DFDFDF",
    backgroundColor: "#F4F4F4",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  quickActionWide: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#DFDFDF",
    backgroundColor: "#F4F4F4",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  quickActionText: {
    color: "#404040",
    fontFamily: fonts.body,
    fontWeight: "700",
    fontSize: 12,
  },
  modeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  modeChip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F4F4F4",
    borderWidth: 1,
    borderColor: "#DFDFDF",
  },
  modeChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  sourceActionsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
    marginBottom: 2,
  },
  sourceActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "#DFDFDF",
    backgroundColor: "#F4F4F4",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  sourceActionText: {
    color: "#404040",
    fontFamily: fonts.body,
    fontWeight: "700",
    fontSize: 12,
  },
  sourcePreview: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#DDDDDD",
    backgroundColor: "#FAFAFA",
    overflow: "hidden",
    marginTop: 2,
  },
  sourcePreviewImage: {
    width: "100%",
    height: 170,
  },
  sourceInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  sourceInfoText: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: "700",
  },
  clearBtn: {
    borderRadius: radius.pill,
    backgroundColor: "#EEEEEE",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  clearBtnText: {
    color: "#424242",
    fontFamily: fonts.body,
    fontWeight: "700",
    fontSize: 12,
  },
  oldWrap: {
    marginTop: 2,
  },
  oldRow: {
    gap: 8,
  },
  oldItem: {
    width: 88,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#DDDDDD",
  },
  oldThumb: {
    width: "100%",
    height: 78,
  },
  oldVideo: {
    width: "100%",
    height: 78,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ECECEC",
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    backgroundColor: "#FFFFFF",
    fontFamily: fonts.body,
  },
  promptInputWrap: {
    position: "relative",
  },
  promptInput: {
    minHeight: 100,
    marginTop: 2,
    textAlignVertical: "top",
  },
  promptInputWithPlus: {
    paddingRight: 48,
  },
  promptPlusBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#757575",
  },
  goalTag: {
    color: "#4E4E4E",
    fontFamily: fonts.body,
    fontWeight: "700",
    fontSize: 12,
  },
  promptChipRow: {
    gap: 8,
  },
  promptChip: {
    maxWidth: 260,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "#DCDCDC",
    backgroundColor: "#F3F3F3",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  promptChipText: {
    color: colors.primaryDark,
    fontFamily: fonts.body,
    fontWeight: "700",
    fontSize: 12,
  },
  generateBtn: {
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    paddingVertical: 11,
  },
  generateBtnText: {
    color: "#FFFFFF",
    fontFamily: fonts.body,
    fontWeight: "800",
  },
  disabledBtn: {
    opacity: 0.65,
  },
  resultCard: {
    marginTop: 10,
    gap: 8,
  },
  resultHeader: {
    gap: 3,
  },
  resultTitle: {
    color: colors.text,
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 16,
  },
  resultMeta: {
    color: colors.subtext,
    fontFamily: fonts.mono,
    fontSize: 11,
  },
  resultPreview: {
    width: "100%",
    height: 210,
    borderRadius: radius.md,
    backgroundColor: "#E8E8E8",
  },
  audioPreview: {
    width: "100%",
    height: 68,
    borderRadius: radius.md,
    backgroundColor: "#F0F0F0",
  },
  resultText: {
    color: colors.text,
  },
  hashText: {
    color: "#555555",
    fontFamily: fonts.body,
    fontWeight: "700",
    fontSize: 12,
  },
  publishBtn: {
    borderRadius: radius.md,
    backgroundColor: "#5D5D5D",
    alignItems: "center",
    paddingVertical: 11,
  },
  publishBtnText: {
    color: "#FFFFFF",
    fontFamily: fonts.body,
    fontWeight: "800",
  },
  uploadCreationBtn: {
    borderRadius: radius.md,
    backgroundColor: "#757575",
    alignItems: "center",
    paddingVertical: 11,
  },
  uploadCreationBtnText: {
    color: "#FFFFFF",
    fontFamily: fonts.body,
    fontWeight: "800",
  },
});
