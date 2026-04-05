import * as ImagePicker from "expo-image-picker";
import { Video } from "expo-av";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Modal, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import API from "./services/api";
import { colors, fonts, radius } from "./theme";
import { Screen } from "./ui";

const FILTER_PRESETS = [
  { key: "original", label: "Original", tint: "transparent", opacity: 0 },
  { key: "warm", label: "Warm", tint: "#9D9D9D", opacity: 0.14 },
  { key: "cool", label: "Cool", tint: "#989898", opacity: 0.13 },
  { key: "noir", label: "Noir", tint: "#181818", opacity: 0.24 },
  { key: "vivid", label: "Vivid", tint: "#6D6D6D", opacity: 0.11 },
  { key: "forest", label: "Forest", tint: "#727272", opacity: 0.13 },
];

const SONG_PRESETS = [
  { key: "none", label: "No Song" },
  { key: "runway", label: "Runway Pulse" },
  { key: "retro", label: "Retro Glow" },
  { key: "drift", label: "Midnight Drift" },
  { key: "sunrise", label: "Sunrise Pop" },
];

const SPEED_PRESETS = [
  { key: "slow", label: "0.75x", value: 0.75 },
  { key: "normal", label: "1.0x", value: 1.0 },
  { key: "fast", label: "1.25x", value: 1.25 },
];
const REEL_TYPE_PRESETS = [
  { key: "original", label: "Original" },
  { key: "remix", label: "Remix" },
  { key: "duet", label: "Duet" },
  { key: "collab", label: "Collab" },
];
const MIN_REEL_SECONDS = 15;
const MAX_REEL_SECONDS = 60;
const DEFAULT_AI_EDIT_PROMPT = "Auto edit this video with smooth cuts, cinematic color, and a stylish vibe";

export default function UploadScreen({ navigation, route }) {
  const [videoAsset, setVideoAsset] = useState(null);
  const [editedMediaUrl, setEditedMediaUrl] = useState("");
  const [aiCaption, setAiCaption] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [selectedFilter, setSelectedFilter] = useState(FILTER_PRESETS[0].key);
  const [selectedSong, setSelectedSong] = useState(SONG_PRESETS[0].key);
  const [selectedSpeed, setSelectedSpeed] = useState(SPEED_PRESETS[1].value);
  const [videoDurationSec, setVideoDurationSec] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [trimStart, setTrimStart] = useState("0");
  const [trimEnd, setTrimEnd] = useState("");
  const [videoType, setVideoType] = useState(REEL_TYPE_PRESETS[0].key);
  const [remixSource, setRemixSource] = useState("");
  const [duetSource, setDuetSource] = useState("");
  const [collabHandle, setCollabHandle] = useState("");
  const [pollEnabled, setPollEnabled] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [products, setProducts] = useState([]);
  const [productQuery, setProductQuery] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [productLoading, setProductLoading] = useState(false);
  const [productSaving, setProductSaving] = useState(false);
  const [productError, setProductError] = useState("");
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [newProductName, setNewProductName] = useState("");
  const [newProductPrice, setNewProductPrice] = useState("");
  const [newProductInventory, setNewProductInventory] = useState("");
  const [newProductDescription, setNewProductDescription] = useState("");
  const [uploadingMode, setUploadingMode] = useState("");
  const introAnim = useRef(new Animated.Value(0)).current;
  const presetCaption = String(route?.params?.prefillCaption || "").trim();

  const busy = useMemo(() => Boolean(uploadingMode), [uploadingMode]);
  const activeFilter = useMemo(() => FILTER_PRESETS.find((item) => item.key === selectedFilter) || FILTER_PRESETS[0], [selectedFilter]);
  const activeSong = useMemo(() => SONG_PRESETS.find((item) => item.key === selectedSong) || SONG_PRESETS[0], [selectedSong]);
  const activeSpeed = useMemo(
    () => SPEED_PRESETS.find((item) => Math.abs(item.value - selectedSpeed) < 0.001) || SPEED_PRESETS[1],
    [selectedSpeed]
  );
  const previewUri = editedMediaUrl || videoAsset?.uri || "";

  const filteredProducts = useMemo(() => {
    const query = String(productQuery || "").trim().toLowerCase();
    const items = Array.isArray(products) ? products : [];
    if (!query) return items;
    return items.filter((product) => {
      const name = String(product?.name || "").toLowerCase();
      const description = String(product?.description || "").toLowerCase();
      return name.includes(query) || description.includes(query);
    });
  }, [products, productQuery]);

  const selectedProducts = useMemo(() => {
    if (!selectedProductIds.length) return [];
    const map = new Map((Array.isArray(products) ? products : []).map((product) => [product.id, product]));
    return selectedProductIds.map((id) => map.get(id)).filter(Boolean);
  }, [products, selectedProductIds]);

  useEffect(() => {
    Animated.timing(introAnim, {
      toValue: 1,
      duration: 520,
      useNativeDriver: true,
    }).start();
  }, [introAnim]);

  const askPermission = async (type) => {
    if (type === "camera") {
      const p = await ImagePicker.requestCameraPermissionsAsync();
      return p.granted;
    }
    const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
    return p.granted;
  };

  const formatPrice = (product) => {
    const cents = Number(product?.price_cents);
    const currency = String(product?.currency || "USD").toUpperCase();
    if (Number.isFinite(cents)) {
      return `${currency} ${(cents / 100).toFixed(2)}`;
    }
    const raw = Number(product?.price);
    if (Number.isFinite(raw)) {
      return `${currency} ${raw.toFixed(2)}`;
    }
    return currency;
  };

  const loadProducts = async () => {
    setProductLoading(true);
    setProductError("");
    try {
      const response = await API.get("/commerce/products");
      const items = Array.isArray(response?.data) ? response.data : response?.data?.products;
      setProducts(Array.isArray(items) ? items : []);
    } catch (err) {
      setProductError(err?.message || "Unable to load products.");
    } finally {
      setProductLoading(false);
    }
  };

  const toggleProductSelection = (product) => {
    if (!product || product.is_active === false || Number(product.inventory_count) <= 0) {
      return;
    }
    setSelectedProductIds((prev) => {
      if (prev.includes(product.id)) {
        return prev.filter((id) => id !== product.id);
      }
      return [...prev, product.id];
    });
  };

  const createProduct = async () => {
    if (productSaving) return;
    const name = String(newProductName || "").trim();
    if (!name) {
      Alert.alert("Missing name", "Enter a product name.");
      return;
    }
    const priceValue = Number(String(newProductPrice || "").replace(",", "."));
    if (!Number.isFinite(priceValue) || priceValue < 0) {
      Alert.alert("Invalid price", "Enter a valid price for the product.");
      return;
    }
    let inventoryValue = 0;
    if (String(newProductInventory || "").trim()) {
      const parsed = Number(String(newProductInventory).replace(/[^0-9]/g, ""));
      if (!Number.isFinite(parsed) || parsed < 0) {
        Alert.alert("Invalid inventory", "Inventory must be a number.");
        return;
      }
      inventoryValue = Math.floor(parsed);
    }
    setProductSaving(true);
    try {
      const response = await API.post("/commerce/products", {
        name,
        description: String(newProductDescription || "").trim(),
        price: priceValue,
        inventory_count: inventoryValue,
      });
      const created = response?.data?.product || response?.data;
      if (created && created.id) {
        setProducts((prev) => [created, ...prev]);
        setSelectedProductIds((prev) => (prev.includes(created.id) ? prev : [...prev, created.id]));
      }
      setNewProductName("");
      setNewProductPrice("");
      setNewProductInventory("");
      setNewProductDescription("");
      setProductModalOpen(false);
    } catch (err) {
      Alert.alert("Create failed", err?.message || "Unable to create product.");
    } finally {
      setProductSaving(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);
  const buildAiCaption = async (baseCaption, promptOverride = "") => {
    const fallback = String(baseCaption || "").trim() || "Uploaded with LooksGood AI.";
    const promptText = String(promptOverride || "").trim();
    const stylePrompt = promptText || "Create a short, catchy reel caption for this uploaded video.";
    try {
      const res = await API.post("/ai/enhance-creation", {
        prompt: stylePrompt,
        caption: fallback,
        vibe: `${activeFilter.label} / ${activeSong.label}`,
        platform: "looksbook",
      });
      const improved = String(res?.data?.improved_caption || "").trim();
      const tags = Array.isArray(res?.data?.hashtags) ? res.data.hashtags.slice(0, 4).join(" ") : "";
      return `${improved || fallback} ${tags}`.trim().slice(0, 500);
    } catch (_err) {
      return fallback.slice(0, 500);
    }
  };

  const composeCaption = (baseText, includePrompt = false) => {
    const blocks = [];
    const cleanBase = String(baseText || "").trim();
    if (cleanBase) blocks.push(cleanBase);
    if (activeFilter.key !== "original") blocks.push(`Filter: ${activeFilter.label}.`);
    if (activeSong.key !== "none") blocks.push(`Song: ${activeSong.label}.`);
    if (includePrompt && aiPrompt.trim()) blocks.push(`AI: ${aiPrompt.trim()}.`);
    return blocks.join(" ").trim().slice(0, 500);
  };

  const getDurationSeconds = (asset) => {
    const rawMs = Number(asset?.duration);
    if (!Number.isFinite(rawMs) || rawMs <= 0) return null;
    return rawMs / 1000;
  };

  const validateDuration = (asset) => {
    const rawSeconds = getDurationSeconds(asset);
    if (rawSeconds == null) return true;
    if (rawSeconds < MIN_REEL_SECONDS) {
      Alert.alert("Video too short", `Reels must be at least ${MIN_REEL_SECONDS} seconds.`);
      return false;
    }
    return true;
  };

  const setAssetWithDuration = (asset) => {
    if (!validateDuration(asset)) return false;
    const rawSeconds = getDurationSeconds(asset);
    setVideoDurationSec(rawSeconds ? Math.round(rawSeconds) : null);
    setVideoAsset(asset);
    setEditedMediaUrl("");
    setAiCaption("");
    setEditMode(false);
    setTrimStart("0");
    setTrimEnd(rawSeconds ? String(Math.round(rawSeconds)) : "");
    return true;
  };

  const promptUploadChoice = (asset) => {
    const rawSeconds = getDurationSeconds(asset);
    const tooLong = rawSeconds != null && rawSeconds > MAX_REEL_SECONDS;
    const message = tooLong
      ? `This video is ${Math.round(rawSeconds)}s. Please trim it to ${MIN_REEL_SECONDS}-${MAX_REEL_SECONDS}s before uploading.`
      : "Do you want to upload the video as-is or edit it first?";
    const actions = [
      {
        text: "Edit",
        onPress: () => {
          setEditMode(true);
          setTrimStart("0");
          setTrimEnd(rawSeconds ? String(Math.round(rawSeconds)) : "");
        },
      },
    ];
    if (!tooLong) {
      actions.unshift({
        text: "Upload as is",
        onPress: () => {
          setEditMode(false);
          setTrimStart("0");
          setTrimEnd(rawSeconds ? String(Math.round(rawSeconds)) : "");
        },
      });
    }
    actions.push({ text: "Cancel", style: "cancel" });
    Alert.alert("Upload video", message, actions);
  };

  const parseSourceId = (value) => {
    const text = String(value || "").trim();
    if (!text) return null;
    const match = text.match(/(\d+)/g);
    if (!match) return null;
    const last = match[match.length - 1];
    const parsed = Number(last);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const sanitizePollOptions = (options) => {
    const cleaned = [];
    const seen = new Set();
    for (const opt of options) {
      const value = String(opt || "").trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      cleaned.push(value.slice(0, 80));
      if (cleaned.length >= 4) break;
    }
    return cleaned;
  };

  const buildMetaPayload = (overrideDuration = null) => {
    const payload = { video_type: videoType };

    const durationValue =
      overrideDuration != null ? Number(overrideDuration) : videoDurationSec != null ? Number(videoDurationSec) : null;

    if (durationValue) {
      if (durationValue < MIN_REEL_SECONDS || durationValue > MAX_REEL_SECONDS) {
        Alert.alert("Invalid duration", `Reels must be ${MIN_REEL_SECONDS}-${MAX_REEL_SECONDS} seconds.`);
        return null;
      }
      payload.duration_seconds = String(Math.round(durationValue));
    }

    if (videoType === "remix") {
      const remixId = parseSourceId(remixSource);
      if (!remixId) {
        Alert.alert("Missing remix source", "Enter the source post ID or URL for the remix.");
        return null;
      }
      payload.remix_post_id = String(remixId);
    }

    if (videoType === "duet") {
      const duetId = parseSourceId(duetSource);
      if (!duetId) {
        Alert.alert("Missing duet source", "Enter the source post ID or URL for the duet.");
        return null;
      }
      payload.duet_post_id = String(duetId);
    }

    if (videoType === "collab") {
      const handle = String(collabHandle || "").trim();
      if (!handle) {
        Alert.alert("Missing collaborator", "Add the collaborator handle for collab reels.");
        return null;
      }
      payload.collab_handle = handle;
    }

    if (pollEnabled) {
      const question = String(pollQuestion || "").trim();
      const options = sanitizePollOptions(pollOptions);
      if (!question) {
        Alert.alert("Poll question missing", "Add a poll question before posting.");
        return null;
      }
      if (options.length < 2) {
        Alert.alert("Poll options missing", "Add at least 2 poll options.");
        return null;
      }
      payload.poll_question = question;
      payload.poll_options = JSON.stringify(options);
    }

    if (selectedProductIds.length) {
      payload.product_ids = selectedProductIds.join(",");
    }
    return payload;
  };

  const parseTrimNumber = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return null;
    const normalized = raw.replace(",", ".");
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) return null;
    return Math.max(0, parsed);
  };

  const computeTrimSpec = () => {
    if (!editMode) return null;
    const start = parseTrimNumber(trimStart) ?? 0;
    let end = parseTrimNumber(trimEnd);
    if (end == null && videoDurationSec != null) {
      end = Number(videoDurationSec);
    }
    if (end == null) {
      Alert.alert("Trim end required", "Enter the end time in seconds.");
      return null;
    }
    if (end <= start) {
      Alert.alert("Invalid trim range", "Trim end must be greater than start.");
      return null;
    }
    const duration = end - start;
    if (duration < MIN_REEL_SECONDS || duration > MAX_REEL_SECONDS) {
      Alert.alert("Trim length", `Trimmed clip must be ${MIN_REEL_SECONDS}-${MAX_REEL_SECONDS} seconds.`);
      return null;
    }
    return { start, end, duration };
  };

  const applyTrimPreset = (seconds) => {
    const target = Math.min(seconds, MAX_REEL_SECONDS);
    setEditMode(true);
    setTrimStart("0");
    setTrimEnd(String(target));
  };

  const togglePoll = () => {
    setPollEnabled((prev) => {
      const next = !prev;
      if (next && pollOptions.length < 2) {
        setPollOptions(["", ""]);
      }
      return next;
    });
  };

  const updatePollOption = (index, value) => {
    setPollOptions((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const addPollOption = () => {
    setPollOptions((prev) => (prev.length >= 4 ? prev : [...prev, ""]));
  };

  const removePollOption = (index) => {
    setPollOptions((prev) => (prev.length <= 2 ? prev : prev.filter((_, idx) => idx !== index)));
  };

  const uploadVideo = async (asset, mode = "normal", captionOverride = "", metaOverride = null) => {
    if (!asset?.uri || busy) return;
    const meta = metaOverride || buildMetaPayload();
    if (!meta) return;
    setUploadingMode(mode);
    try {
      const uri = String(asset.uri || "");
      const uriPath = uri.split("?")[0];
      const ext = uriPath.includes(".") ? uriPath.split(".").pop().toLowerCase() : "mp4";
      const safeExt = ["mp4", "mov", "m4v", "webm", "avi", "mkv"].includes(ext) ? ext : "mp4";
      const mimeMap = {
        mp4: "video/mp4",
        mov: "video/quicktime",
        m4v: "video/x-m4v",
        webm: "video/webm",
        avi: "video/x-msvideo",
        mkv: "video/x-matroska",
      };

      const fallbackCaption = composeCaption(presetCaption || (mode === "ai" ? "Created with AI flow." : "New reel upload."), mode !== "normal");
      const captionBase = String(captionOverride || fallbackCaption || "New reel upload.").slice(0, 500);
      const caption = mode === "ai" ? await buildAiCaption(captionBase, aiPrompt) : captionBase;

      const formData = new FormData();
      formData.append("video", {
        uri: asset.uri,
        name: asset.fileName || `create-${Date.now()}.${safeExt}`,
        type: asset.mimeType || mimeMap[safeExt] || "video/mp4",
      });
      formData.append("caption", caption);
      Object.entries(meta).forEach(([key, value]) => {
        if (value === null || value === undefined || value === "") return;
        formData.append(key, value);
      });

      await API.post("/video/publish", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      Alert.alert("Uploaded", mode === "ai" ? "Video uploaded with AI caption." : "Video uploaded.");
      navigation.navigate("Reels");
    } catch (err) {
      Alert.alert("Upload failed", err?.message || "Could not upload video.");
    } finally {
      setUploadingMode("");
    }
  };

  const publishFromUrl = async (mediaUrl, caption, meta = {}) => {
    await API.post("/video/publish-from-url", {
      media_url: mediaUrl,
      caption,
      ...meta,
    });
  };

  const mixSongIntoVideo = async () => {
    if (activeSong.key === "none") {
      return String(editedMediaUrl || "").trim();
    }

    const formData = new FormData();
    formData.append("song_key", activeSong.key);
    formData.append("song_volume", "0.7");
    formData.append("original_volume", "0.85");

    const sourceUrl = String(editedMediaUrl || "").trim();
    if (sourceUrl) {
      formData.append("source_url", sourceUrl);
    } else if (videoAsset?.uri) {
      formData.append("video", {
        uri: videoAsset.uri,
        name: videoAsset.fileName || `song-mix-${Date.now()}.mp4`,
        type: videoAsset.mimeType || "video/mp4",
      });
    } else {
      throw new Error("Select a video before adding a song.");
    }

    const response = await API.post("/video/mix-audio", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return String(response?.data?.video_url || "").trim();
  };

  const captureVideo = async () => {
    if (busy) return;
    const granted = await askPermission("camera");
    if (!granted) {
      Alert.alert("Permission needed", "Please allow camera access.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["videos"],
      allowsEditing: false,
      quality: 0.9,
      videoMaxDuration: MAX_REEL_SECONDS,
    });
    if (result.canceled || !result.assets?.[0]) return;
    if (setAssetWithDuration(result.assets[0])) {
      promptUploadChoice(result.assets[0]);
    }
  };

  const pickVideo = async () => {
    if (busy) return;
    const granted = await askPermission("library");
    if (!granted) {
      Alert.alert("Permission needed", "Please allow gallery access.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      allowsEditing: false,
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.[0]) return;
    if (setAssetWithDuration(result.assets[0])) {
      promptUploadChoice(result.assets[0]);
    }
  };

  const runAiEdit = async () => {
    if (!videoAsset?.uri || busy) return;
    const cleanPrompt = aiPrompt.trim();
    const promptToUse = cleanPrompt || DEFAULT_AI_EDIT_PROMPT;
    if (!cleanPrompt) {
      setAiPrompt(DEFAULT_AI_EDIT_PROMPT);
    }

    setUploadingMode("ai-edit");
    try {
      const formData = new FormData();
      formData.append("prompt", `${promptToUse}. Use ${activeFilter.label} filter vibe and ${activeSong.label} music mood.`);
      formData.append("kind", "video");
      formData.append("style", `${activeFilter.label}, ${activeSong.label}, ${activeSpeed.label}`);
      formData.append("file", {
        uri: videoAsset.uri,
        name: videoAsset.fileName || `edit-${Date.now()}.mp4`,
        type: videoAsset.mimeType || "video/mp4",
      });
      const res = await API.post("/ai/studio/generate-with-upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const mediaUrl = String(
        res?.data?.publish_media_url || res?.data?.video_url || res?.data?.asset_url || videoAsset.uri || ""
      ).trim();
      const tags = Array.isArray(res?.data?.hashtags) ? res.data.hashtags.join(" ") : "";
      const candidateCaption = `${String(res?.data?.caption || "").trim()} ${tags}`.trim();

      if (mediaUrl) setEditedMediaUrl(mediaUrl);
      if (candidateCaption) setAiCaption(composeCaption(candidateCaption, true));

      Alert.alert("AI edit ready", "Your reel draft is ready. Save it or post directly to Reels.");
    } catch (err) {
      Alert.alert("AI edit failed", err?.message || "Could not apply AI edit.");
    } finally {
      setUploadingMode("");
    }
  };

  const saveDraftToGallery = async () => {
    if (busy) return;
    const source = String(previewUri || "").trim();
    if (!source) {
      Alert.alert("No draft yet", "Pick or record a video first.");
      return;
    }
    setUploadingMode("saving");
    try {
      const message = source.startsWith("http")
        ? `Save this reel to gallery: ${source}`
        : "Save this local reel draft to your gallery.";
      await Share.share({ message, url: source });
    } catch (err) {
      Alert.alert("Save failed", err?.message || "Could not open save options.");
    } finally {
      setUploadingMode("");
    }
  };

  const postToReels = async () => {
    if (busy) return;
    if (!previewUri && !videoAsset?.uri) {
      Alert.alert("No video selected", "Pick or record a video first.");
      return;
    }

    const trimSpec = computeTrimSpec();
    if (editMode && !trimSpec) return;
    if (editMode && (editedMediaUrl || activeSong.key !== "none")) {
      Alert.alert("Trim edit note", "Trim edits apply only to direct uploads. Turn off Edit to use AI edits or song mix.");
      return;
    }

    const effectiveDuration = trimSpec?.duration ?? (videoDurationSec != null ? Number(videoDurationSec) : null);
    const meta = buildMetaPayload(effectiveDuration);
    if (!meta) return;
    if (trimSpec) {
      meta.trim_start_seconds = String(trimSpec.start);
      meta.trim_end_seconds = String(trimSpec.end);
    }

    const base = aiCaption || presetCaption || "New reel upload.";
    const finalCaption = composeCaption(base, Boolean(aiCaption) || Boolean(aiPrompt.trim()));
    const needsSongMix = activeSong.key !== "none";

    if (needsSongMix) {
      setUploadingMode("mixing");
      try {
        const mixedUrl = await mixSongIntoVideo();
        if (!mixedUrl) {
          throw new Error("Song mix result was empty.");
        }
        await publishFromUrl(mixedUrl, finalCaption, meta);
        Alert.alert("Posted", "Reel posted with song mix.");
        navigation.navigate("Reels");
      } catch (err) {
        if (videoAsset?.uri) {
          await uploadVideo(videoAsset, aiCaption ? "ai" : "normal", finalCaption, meta);
          Alert.alert("Song mix unavailable", "Posted reel without song mix. Backend update/restart is needed for full mix feature.");
        } else {
          Alert.alert("Post failed", err?.message || "Could not mix and post reel.");
        }
      } finally {
        setUploadingMode("");
      }
      return;
    }

    if (!editedMediaUrl && videoAsset?.uri) {
      await uploadVideo(videoAsset, aiCaption ? "ai" : "normal", finalCaption, meta);
      return;
    }

    setUploadingMode("posting");
    try {
      await publishFromUrl(editedMediaUrl, finalCaption, meta);
      Alert.alert("Posted", "AI-edited reel posted successfully.");
      navigation.navigate("Reels");
    } catch (err) {
      Alert.alert("Post failed", err?.message || "Could not post to Reels.");
    } finally {
      setUploadingMode("");
    }
  };

  const heroTranslateY = introAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  const statusLabel =
    uploadingMode === "ai-edit"
      ? "Applying AI edit..."
      : uploadingMode === "posting"
      ? "Posting to Reels..."
      : uploadingMode === "mixing"
      ? "Mixing song with video..."
      : uploadingMode === "saving"
      ? "Opening save options..."
      : uploadingMode === "ai"
      ? "Uploading with AI..."
      : uploadingMode
      ? "Uploading..."
      : "";

  return (
    <Screen padded={false}>
      <View style={styles.cameraRoot}>
        {previewUri ? (
          <View style={styles.cameraPreviewWrap}>
            <Video
              source={{ uri: previewUri }}
              style={styles.cameraPreview}
              resizeMode="cover"
              rate={selectedSpeed}
              shouldCorrectPitch
              isLooping
              shouldPlay
              isMuted
            />
            {activeFilter.opacity > 0 ? (
              <View pointerEvents="none" style={[styles.filterOverlay, { backgroundColor: activeFilter.tint, opacity: activeFilter.opacity }]} />
            ) : null}
          </View>
        ) : (
          <LinearGradient colors={["#101010", "#2A2A2A", "#232323"]} style={styles.cameraBackdrop} />
        )}

        {!previewUri ? (
          <View style={styles.cameraHint}>
            <Text style={styles.cameraHintTitle}>New Look</Text>
            <Text style={styles.cameraHintSub}>Full screen camera mode. Capture or upload to start.</Text>
          </View>
        ) : null}

        <Animated.View style={[styles.cameraDock, { opacity: introAnim, transform: [{ translateY: heroTranslateY }] }]}>
          <View style={styles.cameraActionRow}>
            <IconOnlyAction icon="camera-outline" onPress={captureVideo} disabled={busy} />
            <IconOnlyAction icon="cloud-upload-outline" onPress={pickVideo} disabled={busy} />
            <IconOnlyAction icon="sparkles-outline" active={uploadingMode === "ai-edit"} onPress={runAiEdit} disabled={busy || !videoAsset?.uri} />
          </View>

          {previewUri ? (
            <ScrollView
              style={styles.cameraOptionsScroll}
              contentContainerStyle={styles.cameraOptionsContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled">
              <View style={styles.cameraOptionSection}>
                <Text style={styles.cameraOptionTitle}>Filters</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                  {FILTER_PRESETS.map((item) => (
                    <SelectablePill
                      key={item.key}
                      label={item.label}
                      active={item.key === selectedFilter}
                      onPress={() => setSelectedFilter(item.key)}
                    />
                  ))}
                </ScrollView>
              </View>

              <View style={styles.cameraOptionSection}>
                <Text style={styles.cameraOptionTitle}>Edit Speed</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                  {SPEED_PRESETS.map((item) => (
                    <SelectablePill
                      key={item.key}
                      label={item.label}
                      active={Math.abs(item.value - selectedSpeed) < 0.001}
                      onPress={() => setSelectedSpeed(item.value)}
                    />
                  ))}
                </ScrollView>
              </View>

              <View style={styles.cameraOptionSection}>
                <Text style={styles.cameraOptionTitle}>Song</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                  {SONG_PRESETS.map((item) => (
                    <SelectablePill key={item.key} label={item.label} active={item.key === selectedSong} onPress={() => setSelectedSong(item.key)} />
                  ))}
                </ScrollView>
              </View>

              <View style={styles.cameraOptionSection}>
                <View style={styles.trimHeaderRow}>
                  <Text style={styles.cameraOptionTitle}>Edit & Trim</Text>
                  <Pressable onPress={() => setEditMode((prev) => !prev)} style={styles.trimToggleBtn}>
                    <Ionicons name={editMode ? "checkmark-circle" : "ellipse-outline"} size={16} color={editMode ? "#CBCBCB" : "rgba(255, 255, 255, 0.6)"} />
                    <Text style={styles.trimToggleText}>{editMode ? "On" : "Off"}</Text>
                  </Pressable>
                </View>
                {editMode ? (
                  <View style={styles.trimBody}>
                    <View style={styles.trimRow}>
                      <TextInput
                        value={trimStart}
                        onChangeText={setTrimStart}
                        placeholder="Start (sec)"
                        placeholderTextColor="rgba(255, 255, 255, 0.6)"
                        keyboardType="numeric"
                        style={[styles.cameraMetaInput, styles.trimInput]}
                      />
                      <TextInput
                        value={trimEnd}
                        onChangeText={setTrimEnd}
                        placeholder="End (sec)"
                        placeholderTextColor="rgba(255, 255, 255, 0.6)"
                        keyboardType="numeric"
                        style={[styles.cameraMetaInput, styles.trimInput]}
                      />
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trimPresetRow}>
                      {[15, 30, 45, 60].map((seconds) => (
                        <Pressable key={`trim-${seconds}`} onPress={() => applyTrimPreset(seconds)} style={styles.trimPresetBtn}>
                          <Text style={styles.trimPresetText}>{seconds}s</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                    <Text style={styles.trimHintText}>Trim to keep reels between 15-60 seconds.</Text>
                  </View>
                ) : (
                  <Text style={styles.trimHintText}>Upload the full video as-is.</Text>
                )}
              </View>

              <View style={styles.cameraOptionSection}>
                <Text style={styles.cameraOptionTitle}>Reel Type</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                  {REEL_TYPE_PRESETS.map((item) => (
                    <SelectablePill key={item.key} label={item.label} active={item.key === videoType} onPress={() => setVideoType(item.key)} />
                  ))}
                </ScrollView>
                {videoDurationSec ? <Text style={styles.cameraMetaText}>Duration: {videoDurationSec}s</Text> : null}
                {videoType === "remix" ? (
                  <TextInput
                    value={remixSource}
                    onChangeText={setRemixSource}
                    placeholder="Remix source post ID or URL"
                    placeholderTextColor="rgba(255, 255, 255, 0.6)"
                    style={styles.cameraMetaInput}
                  />
                ) : null}
                {videoType === "duet" ? (
                  <TextInput
                    value={duetSource}
                    onChangeText={setDuetSource}
                    placeholder="Duet source post ID or URL"
                    placeholderTextColor="rgba(255, 255, 255, 0.6)"
                    style={styles.cameraMetaInput}
                  />
                ) : null}
                {videoType === "collab" ? (
                  <TextInput
                    value={collabHandle}
                    onChangeText={setCollabHandle}
                    placeholder="Collaborator handle (e.g. @stylebuddy)"
                    placeholderTextColor="rgba(255, 255, 255, 0.6)"
                    style={styles.cameraMetaInput}
                  />
                ) : null}
              </View>

              <View style={styles.cameraOptionSection}>
                <View style={styles.pollToggleRow}>
                  <Text style={styles.cameraOptionTitle}>Poll</Text>
                  <Pressable onPress={togglePoll} style={styles.pollToggleBtn}>
                    <Ionicons name={pollEnabled ? "checkmark-circle" : "ellipse-outline"} size={16} color={pollEnabled ? "#CBCBCB" : "rgba(255, 255, 255, 0.6)"} />
                    <Text style={styles.pollToggleText}>{pollEnabled ? "On" : "Off"}</Text>
                  </Pressable>
                </View>
                {pollEnabled ? (
                  <View style={styles.pollBody}>
                    <TextInput
                      value={pollQuestion}
                      onChangeText={setPollQuestion}
                      placeholder="Ask a question..."
                      placeholderTextColor="rgba(255, 255, 255, 0.6)"
                      style={styles.cameraMetaInput}
                    />
                    {pollOptions.map((option, index) => (
                      <View key={`poll-${index}`} style={styles.pollOptionRow}>
                        <TextInput
                          value={option}
                          onChangeText={(value) => updatePollOption(index, value)}
                          placeholder={`Option ${index + 1}`}
                          placeholderTextColor="rgba(255, 255, 255, 0.6)"
                          style={[styles.cameraMetaInput, styles.pollOptionInput]}
                        />
                        {pollOptions.length > 2 ? (
                          <Pressable onPress={() => removePollOption(index)} style={styles.pollRemoveBtn}>
                            <Ionicons name="close-circle" size={18} color="rgba(255, 255, 255, 0.7)" />
                          </Pressable>
                        ) : null}
                      </View>
                    ))}
                    {pollOptions.length < 4 ? (
                      <Pressable onPress={addPollOption} style={styles.pollAddBtn}>
                        <Ionicons name="add-circle-outline" size={16} color="#CBCBCB" />
                        <Text style={styles.pollAddText}>Add option</Text>
                      </Pressable>
                    ) : null}
                    <Text style={styles.pollHintText}>2-4 options recommended.</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.cameraOptionSection}>
                <View style={styles.productHeaderRow}>
                  <Text style={styles.cameraOptionTitle}>Product Tags</Text>
                  <Pressable onPress={() => setProductModalOpen(true)} style={styles.productAddBtn}>
                    <Ionicons name="add" size={14} color="#F2F2F2" />
                    <Text style={styles.productAddText}>New</Text>
                  </Pressable>
                </View>
                <TextInput
                  value={productQuery}
                  onChangeText={setProductQuery}
                  placeholder="Search products..."
                  placeholderTextColor="rgba(255, 255, 255, 0.6)"
                  style={styles.productSearchInput}
                />
                {productLoading ? (
                  <View style={styles.productLoadingRow}>
                    <ActivityIndicator color="#DADADA" size="small" />
                    <Text style={styles.productHintText}>Loading products...</Text>
                  </View>
                ) : filteredProducts.length ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.productChipsRow}>
                    {filteredProducts.map((product) => {
                      const outOfStock = Number(product?.inventory_count || 0) <= 0 || product?.is_active === false;
                      const selected = selectedProductIds.includes(product.id);
                      return (
                        <Pressable
                          key={`product-${product.id}`}
                          onPress={() => toggleProductSelection(product)}
                          disabled={outOfStock}
                          style={[
                            styles.productChip,
                            selected && styles.productChipActive,
                            outOfStock && styles.productChipDisabled,
                          ]}>
                          <Text style={styles.productChipText} numberOfLines={1}>
                            {product?.name || "Product"}
                          </Text>
                          <Text style={styles.productChipMeta}>
                            {outOfStock
                              ? "Sold out"
                              : `${formatPrice(product)} · ${Number(product?.inventory_count || 0)} left`}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                ) : (
                  <Text style={styles.productHintText}>No products yet. Add one to start tagging.</Text>
                )}
                {selectedProducts.length ? (
                  <Text style={styles.productSelectedText} numberOfLines={2}>
                    Tagged: {selectedProducts.map((product) => product.name).join(", ")}
                  </Text>
                ) : null}
                {productError ? <Text style={styles.productErrorText}>{productError}</Text> : null}
              </View>
              <View style={styles.cameraOptionSection}>
                <Text style={styles.cameraOptionTitle}>AI Edit Prompt</Text>
                <TextInput
                  value={aiPrompt}
                  onChangeText={setAiPrompt}
                  placeholder="Example: make this cinematic, smooth transitions, stylish mood"
                  placeholderTextColor="rgba(255, 255, 255, 0.6)"
                  style={styles.cameraPromptInput}
                  multiline
                  textAlignVertical="top"
                />
                <Text style={styles.cameraHintText}>Tap sparkles after entering prompt to generate AI edited version.</Text>
              </View>

              <View style={styles.cameraCtaRow}>
                <Pressable onPress={saveDraftToGallery} disabled={busy || !previewUri} style={[styles.ctaSecondary, (busy || !previewUri) && styles.disabledBtn]}>
                  <Ionicons name="download-outline" size={17} color="#393939" />
                  <Text style={styles.ctaSecondaryText}>Save</Text>
                </Pressable>
                <Pressable onPress={postToReels} disabled={busy || !previewUri} style={[styles.ctaPrimary, (busy || !previewUri) && styles.disabledBtn]}>
                  <Ionicons name="paper-plane-outline" size={17} color="#FFFFFF" />
                  <Text style={styles.ctaPrimaryText}>Post to Reels</Text>
                </Pressable>
              </View>

              {busy ? (
                <View style={styles.loaderRow}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={styles.loaderText}>{statusLabel}</Text>
                </View>
              ) : null}
            </ScrollView>
          ) : null}
        </Animated.View>

        <Modal transparent animationType="fade" visible={productModalOpen} onRequestClose={() => setProductModalOpen(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>New product</Text>
              <Text style={styles.modalSubtitle}>Add an item creators can tag on posts.</Text>
              <TextInput
                value={newProductName}
                onChangeText={setNewProductName}
                placeholder="Product name"
                placeholderTextColor="rgba(255, 255, 255, 0.55)"
                style={styles.modalInput}
              />
              <TextInput
                value={newProductPrice}
                onChangeText={setNewProductPrice}
                placeholder="Price (USD)"
                placeholderTextColor="rgba(255, 255, 255, 0.55)"
                keyboardType="numeric"
                style={styles.modalInput}
              />
              <TextInput
                value={newProductInventory}
                onChangeText={setNewProductInventory}
                placeholder="Inventory (optional)"
                placeholderTextColor="rgba(255, 255, 255, 0.55)"
                keyboardType="numeric"
                style={styles.modalInput}
              />
              <TextInput
                value={newProductDescription}
                onChangeText={setNewProductDescription}
                placeholder="Description (optional)"
                placeholderTextColor="rgba(255, 255, 255, 0.55)"
                style={[styles.modalInput, styles.modalInputMultiline]}
                multiline
              />
              <View style={styles.modalActions}>
                <Pressable onPress={() => setProductModalOpen(false)} style={styles.modalGhost}>
                  <Text style={styles.modalGhostText}>Cancel</Text>
                </Pressable>
                <Pressable onPress={createProduct} disabled={productSaving} style={[styles.modalPrimary, productSaving && styles.disabledBtn]}>
                  <Text style={styles.modalPrimaryText}>{productSaving ? "Saving..." : "Create"}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </Screen>
  );
}

function IconOnlyAction({ icon, onPress, disabled = false, active = false }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.iconActionWrap, disabled && styles.iconActionDisabled]}>
      <View style={[styles.iconActionCircle, active && styles.iconActionCircleActive]}>
        <Ionicons name={icon} size={24} color="#FFFFFF" />
      </View>
    </Pressable>
  );
}

function SelectablePill({ label, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.optionPill, active && styles.optionPillActive]}>
      <Text style={[styles.optionPillText, active && styles.optionPillTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cameraRoot: {
    flex: 1,
    backgroundColor: "#101010",
  },
  cameraBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  cameraPreviewWrap: {
    flex: 1,
    backgroundColor: "#101010",
  },
  cameraPreview: {
    width: "100%",
    height: "100%",
    backgroundColor: "#101010",
  },
  cameraHint: {
    position: "absolute",
    top: 72,
    left: 0,
    right: 0,
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 26,
  },
  cameraHintTitle: {
    color: "#F2F2F2",
    fontFamily: fonts.display,
    fontWeight: "800",
    fontSize: 22,
    letterSpacing: 0.4,
  },
  cameraHintSub: {
    color: "rgba(242, 242, 242, 0.75)",
    fontFamily: fonts.body,
    fontSize: 12,
    textAlign: "center",
  },
  cameraDock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
    gap: 8,
    backgroundColor: "rgba(13, 13, 13, 0.82)",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  cameraActionRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  cameraOptionsScroll: {
    maxHeight: 380,
  },
  cameraOptionsContent: {
    gap: 10,
    paddingBottom: 4,
  },
  cameraOptionSection: {
    gap: 6,
  },
  cameraOptionTitle: {
    color: "#F2F2F2",
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 12,
  },
  cameraPromptInput: {
    minHeight: 72,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.18)",
    backgroundColor: "rgba(11, 11, 11, 0.85)",
    color: "#F2F2F2",
    fontFamily: fonts.body,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
  },
  cameraMetaText: {
    color: "rgba(255, 255, 255, 0.7)",
    fontFamily: fonts.body,
    fontSize: 11,
  },
  cameraMetaInput: {
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.18)",
    backgroundColor: "rgba(11, 11, 11, 0.85)",
    color: "#F2F2F2",
    fontFamily: fonts.body,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
  },
  pollToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  trimHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  trimToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  trimToggleText: {
    color: "rgba(255, 255, 255, 0.7)",
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: "700",
  },
  trimBody: {
    gap: 8,
  },
  trimRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  trimInput: {
    flex: 1,
  },
  trimPresetRow: {
    gap: 8,
    paddingVertical: 2,
  },
  trimPresetBtn: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    backgroundColor: "rgba(17, 17, 17, 0.6)",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  trimPresetText: {
    color: "#CBCBCB",
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 11,
  },
  trimHintText: {
    color: "rgba(255, 255, 255, 0.6)",
    fontFamily: fonts.body,
    fontSize: 11,
  },
  pollToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pollToggleText: {
    color: "rgba(255, 255, 255, 0.7)",
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: "700",
  },
  pollBody: {
    gap: 8,
  },
  pollOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pollOptionInput: {
    flex: 1,
  },
  pollRemoveBtn: {
    padding: 4,
  },
  pollAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    backgroundColor: "rgba(17, 17, 17, 0.6)",
  },
  pollAddText: {
    color: "#CBCBCB",
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 11,
  },
  pollHintText: {
    color: "rgba(255, 255, 255, 0.6)",
    fontFamily: fonts.body,
    fontSize: 11,
  },
  productHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  productAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.25)",
    backgroundColor: "rgba(20, 20, 20, 0.6)",
  },
  productAddText: {
    color: "#F2F2F2",
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: "700",
  },
  productSearchInput: {
    minHeight: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.18)",
    backgroundColor: "rgba(11, 11, 11, 0.85)",
    color: "#F2F2F2",
    fontFamily: fonts.body,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
  },
  productLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  productChipsRow: {
    gap: 8,
    paddingVertical: 2,
  },
  productChip: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    backgroundColor: "rgba(18, 18, 18, 0.7)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 140,
  },
  productChipActive: {
    borderColor: "#F2F2F2",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  productChipDisabled: {
    opacity: 0.55,
  },
  productChipText: {
    color: "#F2F2F2",
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 12,
  },
  productChipMeta: {
    color: "rgba(255, 255, 255, 0.65)",
    fontFamily: fonts.body,
    fontSize: 10,
    marginTop: 2,
  },
  productHintText: {
    color: "rgba(255, 255, 255, 0.6)",
    fontFamily: fonts.body,
    fontSize: 11,
  },
  productSelectedText: {
    color: "#F2F2F2",
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: "700",
  },
  productErrorText: {
    color: "#FFB4B4",
    fontFamily: fonts.body,
    fontSize: 11,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: radius.lg,
    padding: 16,
    gap: 10,
    backgroundColor: "#161616",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  modalTitle: {
    color: "#F2F2F2",
    fontFamily: fonts.display,
    fontWeight: "800",
    fontSize: 18,
  },
  modalSubtitle: {
    color: "rgba(255, 255, 255, 0.65)",
    fontFamily: fonts.body,
    fontSize: 12,
  },
  modalInput: {
    minHeight: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.16)",
    backgroundColor: "rgba(12, 12, 12, 0.9)",
    color: "#F2F2F2",
    fontFamily: fonts.body,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
  },
  modalInputMultiline: {
    minHeight: 70,
    textAlignVertical: "top",
  },
  modalActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  modalGhost: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    paddingVertical: 10,
    alignItems: "center",
  },
  modalGhostText: {
    color: "#F2F2F2",
    fontFamily: fonts.body,
    fontWeight: "700",
  },
  modalPrimary: {
    flex: 1,
    borderRadius: radius.md,
    backgroundColor: "#F2F2F2",
    paddingVertical: 10,
    alignItems: "center",
  },
  modalPrimaryText: {
    color: "#101010",
    fontFamily: fonts.body,
    fontWeight: "800",
  },
  cameraHintText: {
    color: "rgba(255, 255, 255, 0.7)",
    fontFamily: fonts.body,
    fontSize: 11,
  },
  cameraCtaRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    gap: 10,
  },
  heroCard: {
    borderRadius: radius.xl,
    padding: 14,
    shadowColor: "#3B3B3B",
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  heroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontFamily: fonts.display,
    fontWeight: "800",
  },
  heroSub: {
    color: "#ECECEC",
    marginTop: 2,
  },
  heroIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.9)",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 28,
    gap: 10,
  },
  previewCard: {
    padding: 0,
    overflow: "hidden",
    minHeight: 260,
    justifyContent: "center",
    alignItems: "center",
    borderColor: "#DDDDDD",
  },
  previewVideo: {
    width: "100%",
    height: 300,
    backgroundColor: "#1C1C1C",
  },
  previewWrap: {
    width: "100%",
    position: "relative",
  },
  filterOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  previewMeta: {
    position: "absolute",
    right: 10,
    top: 10,
    gap: 6,
  },
  metaChip: {
    backgroundColor: "rgba(20, 20, 20, 0.72)",
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  metaChipText: {
    color: "#FFFFFF",
    fontFamily: fonts.body,
    fontWeight: "700",
    fontSize: 11,
  },
  emptyPreview: {
    minHeight: 230,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F1F1",
    gap: 8,
  },
  emptyPreviewText: {
    color: "#5F5F5F",
    fontFamily: fonts.body,
    fontWeight: "700",
    fontSize: 12,
  },
  iconRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingHorizontal: 8,
    marginTop: 1,
  },
  iconActionWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  iconActionDisabled: {
    opacity: 0.6,
  },
  iconActionCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#6A6A6A",
    borderWidth: 1,
    borderColor: "#525252",
  },
  iconActionCircleActive: {
    backgroundColor: "#757575",
    borderColor: "#5F5F5F",
  },
  panelCard: {
    gap: 8,
  },
  panelTitle: {
    color: colors.text,
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 13,
    marginBottom: 1,
  },
  chipsRow: {
    gap: 8,
    paddingBottom: 2,
  },
  optionPill: {
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 7,
    backgroundColor: "#F2F2F2",
    borderWidth: 1,
    borderColor: "#DBDBDB",
  },
  optionPillActive: {
    backgroundColor: "#6C6C6C",
    borderColor: "#545454",
  },
  optionPillText: {
    color: "#404040",
    fontFamily: fonts.body,
    fontWeight: "700",
    fontSize: 12,
  },
  optionPillTextActive: {
    color: "#FFFFFF",
  },
  promptInput: {
    minHeight: 82,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#FFFFFF",
    color: colors.text,
    fontFamily: fonts.body,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
  },
  hintText: {
    color: "#545454",
    fontSize: 12,
  },
  ctaRow: {
    flexDirection: "row",
    gap: 8,
  },
  ctaPrimary: {
    flex: 1,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  ctaPrimaryText: {
    color: "#FFFFFF",
    fontFamily: fonts.body,
    fontWeight: "800",
  },
  ctaSecondary: {
    flex: 1,
    borderRadius: radius.md,
    backgroundColor: "#F0F0F0",
    borderWidth: 1,
    borderColor: "#D4D4D4",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  ctaSecondaryText: {
    color: "#393939",
    fontFamily: fonts.body,
    fontWeight: "800",
  },
  disabledBtn: {
    opacity: 0.58,
  },
  loaderRow: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loaderText: {
    color: colors.text,
    fontFamily: fonts.body,
    fontWeight: "700",
    fontSize: 12,
  },
});



