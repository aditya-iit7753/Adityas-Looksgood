import { useMemo, useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import API from "./services/api";
import { colors, fonts, radius } from "./theme";
import { BodyText, Card, PrimaryButton, Screen, Title } from "./ui";

const STYLES = [
  { key: "toon", label: "Toon" },
  { key: "glossy", label: "Glossy" },
  { key: "neon", label: "Neon" },
  { key: "soft", label: "Soft" },
];

export default function Avatar3DScreen({ navigation }) {
  const [source, setSource] = useState(null);
  const [selectedStyle, setSelectedStyle] = useState(STYLES[0].key);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const previewUri = useMemo(() => result?.preview_image_url || result?.asset_url || source?.uri || "", [result, source]);

  const pickImage = async (fromCamera = false) => {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow photo access to continue.");
      return;
    }

    const picker = fromCamera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    const res = await picker({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.9,
      aspect: [1, 1],
    });
    if (res.canceled || !res.assets?.[0]) return;
    setSource(res.assets[0]);
    setResult(null);
  };

  const generateAvatar = async () => {
    if (!source?.uri || busy) {
      Alert.alert("Pick a photo", "Select a face photo to generate your avatar.");
      return;
    }
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("style", selectedStyle);
      formData.append("image", {
        uri: source.uri,
        name: source.fileName || `avatar-3d-${Date.now()}.jpg`,
        type: source.mimeType || "image/jpeg",
      });
      const res = await API.post("/ai/avatar-3d", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(res?.data || null);
    } catch (err) {
      Alert.alert("Avatar failed", err?.message || "Could not generate 3D avatar.");
    } finally {
      setBusy(false);
    }
  };

  const publishToFeed = async () => {
    const mediaUrl = result?.publish_media_url || result?.asset_url || "";
    if (!mediaUrl) {
      Alert.alert("Nothing to publish", "Generate an avatar first.");
      return;
    }
    setBusy(true);
    try {
      await API.post("/ai/studio/publish", {
        media_url: mediaUrl,
        caption: `3D Avatar • ${selectedStyle}`,
      });
      Alert.alert("Published", "Your 3D avatar is live in the feed.");
      navigation.navigate("Feed");
    } catch (err) {
      Alert.alert("Publish failed", err?.message || "Could not publish avatar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Title size={28}>3D Avatar Studio</Title>
          <BodyText>Create a stylized 3D avatar from your photo.</BodyText>
        </View>

        <Card>
          <View style={styles.actionRow}>
            <Pressable onPress={() => pickImage(true)} style={styles.actionBtn}>
              <Ionicons name="camera-outline" size={18} color="#404040" />
              <Text style={styles.actionText}>Camera</Text>
            </Pressable>
            <Pressable onPress={() => pickImage(false)} style={styles.actionBtn}>
              <Ionicons name="image-outline" size={18} color="#404040" />
              <Text style={styles.actionText}>Gallery</Text>
            </Pressable>
          </View>

          {previewUri ? (
            <Image source={{ uri: previewUri }} style={styles.preview} resizeMode="cover" />
          ) : (
            <View style={styles.placeholder}>
              <Ionicons name="person-circle-outline" size={28} color="#7E7E7E" />
              <BodyText>Pick a clear selfie for best results.</BodyText>
            </View>
          )}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.styleRow}>
            {STYLES.map((style) => {
              const active = selectedStyle === style.key;
              return (
                <Pressable
                  key={style.key}
                  onPress={() => setSelectedStyle(style.key)}
                  style={[styles.styleChip, active && styles.styleChipActive]}>
                  <Text style={[styles.styleText, active && styles.styleTextActive]}>{style.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <PrimaryButton title={busy ? "Generating..." : "Generate Avatar"} onPress={generateAvatar} disabled={busy} />
          <Pressable onPress={publishToFeed} disabled={busy || !result} style={[styles.publishBtn, (!result || busy) && styles.disabledBtn]}>
            <Text style={styles.publishText}>{busy ? "Publishing..." : "Publish to Feed"}</Text>
          </Pressable>
        </Card>
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
    gap: 4,
    marginBottom: 8,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "#DFDFDF",
    backgroundColor: "#F4F4F4",
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: "center",
  },
  actionText: {
    color: "#404040",
    fontFamily: fonts.body,
    fontWeight: "700",
    fontSize: 12,
  },
  preview: {
    width: "100%",
    height: 220,
    borderRadius: radius.md,
    backgroundColor: "#E8E8E8",
  },
  placeholder: {
    height: 200,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#E4E4E4",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#FAFAFA",
  },
  styleRow: {
    gap: 8,
  },
  styleChip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "#DFDFDF",
    backgroundColor: "#F4F4F4",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  styleChipActive: {
    backgroundColor: "#515151",
    borderColor: "#515151",
  },
  styleText: {
    color: "#404040",
    fontFamily: fonts.body,
    fontWeight: "700",
    fontSize: 12,
  },
  styleTextActive: {
    color: "#FFFFFF",
  },
  publishBtn: {
    borderRadius: radius.md,
    backgroundColor: "#757575",
    alignItems: "center",
    paddingVertical: 11,
  },
  publishText: {
    color: "#FFFFFF",
    fontFamily: fonts.body,
    fontWeight: "800",
  },
  disabledBtn: {
    opacity: 0.6,
  },
});
