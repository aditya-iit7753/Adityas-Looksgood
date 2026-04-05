import { useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import API from "./services/api";
import { colors } from "./theme";
import { BodyText, Card, Chip, PrimaryButton, Screen, Title } from "./ui";

export default function VideoPreviewScreen({ route, navigation }) {
  const image = route.params?.image;
  const result = route.params?.result;
  const remaining = route.params?.remaining;
  const [publishing, setPublishing] = useState(false);
  const [caption, setCaption] = useState("");
  const [captionLoading, setCaptionLoading] = useState(false);

  const generateCaption = async () => {
    if (captionLoading) return;
    setCaptionLoading(true);
    try {
      const baseCaption = caption.trim() || "New look on LooksGood.";
      const vibe = result?.detected_style || result?.outfit_suggestion || "fashion";
      const res = await API.post("/ai/enhance-creation", {
        prompt: "Write a short, catchy caption for this look with a few hashtags.",
        caption: baseCaption,
        vibe,
        platform: "looksbook",
      });
      const improved = String(res?.data?.improved_caption || "").trim();
      const tags = Array.isArray(res?.data?.hashtags) ? res.data.hashtags.slice(0, 4).join(" ") : "";
      const nextCaption = `${improved || baseCaption} ${tags}`.trim().slice(0, 500);
      setCaption(nextCaption);
    } catch (error) {
      Alert.alert("AI caption failed", error?.message ?? "Please try again.");
    } finally {
      setCaptionLoading(false);
    }
  };

  const publish = async () => {
    if (!image?.uri) {
      Alert.alert("Missing image", "Upload an image first.");
      return;
    }

    try {
      setPublishing(true);
      const formData = new FormData();
      formData.append("image", {
        uri: image.uri,
        name: "publish.jpg",
        type: "image/jpeg",
      });
      formData.append("caption", caption);

      const res = await API.post("/video/publish", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const videoUrl = res.data?.video_url;
      Alert.alert("Published", videoUrl ? `Video URL: ${videoUrl}` : "Your look was published.");
      navigation.replace("Feed");
    } catch (error) {
      Alert.alert("Publish failed", error?.message ?? "Please try again.");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 24, gap: 10 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Title size={28}>Preview</Title>
        <BodyText style={{ marginBottom: 8 }}>Review result and publish it to your feed.</BodyText>

        <Card style={{ padding: 0, overflow: "hidden" }}>
          {image?.uri ? <Image source={{ uri: image.uri }} style={{ width: "100%", height: 300 }} resizeMode="cover" /> : null}
        </Card>

        <Card>
          {result?.detected_style ? <Chip>Style: {result.detected_style}</Chip> : null}
          {result?.outfit_suggestion ? <BodyText style={{ color: colors.text }}>Outfit: {result.outfit_suggestion}</BodyText> : null}
          {typeof result?.confidence === "number" ? (
            <BodyText>Confidence: {Math.round(result.confidence * 100)}%</BodyText>
          ) : null}
          {typeof remaining === "number" ? <BodyText>Generations left: {Math.max(remaining, 0)}</BodyText> : null}
          <TextInput
            value={caption}
            onChangeText={setCaption}
            placeholder="Write a caption for your post"
            placeholderTextColor={colors.subtext}
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 14,
              paddingHorizontal: 12,
              paddingVertical: 10,
              backgroundColor: "#FFFFFF",
              color: colors.text,
            }}
          />
          <Pressable onPress={generateCaption} disabled={captionLoading} style={[styles.aiCaptionBtn, captionLoading && styles.aiCaptionBtnDisabled]}>
            {captionLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <View style={styles.aiCaptionRow}>
                <Ionicons name="sparkles-outline" size={16} color="#FFFFFF" />
                <Text style={styles.aiCaptionText}>Generate AI Caption</Text>
              </View>
            )}
          </Pressable>
        </Card>

        <PrimaryButton title="Post Reel" onPress={publish} loading={publishing} />
        {publishing ? <ActivityIndicator color={colors.primary} /> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  aiCaptionBtn: {
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: colors.primary,
    paddingVertical: 10,
    alignItems: "center",
  },
  aiCaptionBtnDisabled: {
    opacity: 0.7,
  },
  aiCaptionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  aiCaptionText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
});
