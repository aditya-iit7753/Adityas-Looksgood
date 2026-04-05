import { useMemo, useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import API from "./services/api";
import { colors, fonts, radius } from "./theme";
import { BodyText, Card, PrimaryButton, Screen, Title } from "./ui";

const FILTERS = [
  { key: "glow", label: "Glow" },
  { key: "warm", label: "Warm" },
  { key: "cool", label: "Cool" },
  { key: "noir", label: "Noir" },
  { key: "vivid", label: "Vivid" },
];

export default function ARFiltersScreen({ navigation }) {
  const [source, setSource] = useState(null);
  const [selectedFilter, setSelectedFilter] = useState(FILTERS[0].key);
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
      aspect: [4, 5],
    });
    if (res.canceled || !res.assets?.[0]) return;
    setSource(res.assets[0]);
    setResult(null);
  };

  const applyFilter = async () => {
    if (!source?.uri || busy) {
      Alert.alert("Pick a photo", "Select a photo first.");
      return;
    }
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("filter_name", selectedFilter);
      formData.append("image", {
        uri: source.uri,
        name: source.fileName || `ar-filter-${Date.now()}.jpg`,
        type: source.mimeType || "image/jpeg",
      });
      const res = await API.post("/ai/face-filter", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(res?.data || null);
    } catch (err) {
      Alert.alert("Filter failed", err?.message || "Could not apply AR filter.");
    } finally {
      setBusy(false);
    }
  };

  const publishToFeed = async () => {
    const mediaUrl = result?.publish_media_url || result?.asset_url || "";
    if (!mediaUrl) {
      Alert.alert("Nothing to publish", "Apply a filter first.");
      return;
    }
    setBusy(true);
    try {
      await API.post("/ai/studio/publish", {
        media_url: mediaUrl,
        caption: `AR Filter: ${selectedFilter}`,
      });
      Alert.alert("Published", "Your AR-filtered photo is live.");
      navigation.navigate("Feed");
    } catch (err) {
      Alert.alert("Publish failed", err?.message || "Could not publish this photo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Title size={28}>AR Filters</Title>
          <BodyText>Apply immersive AR-style filters to your photos.</BodyText>
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
              <Ionicons name="sparkles-outline" size={24} color="#7E7E7E" />
              <BodyText>Pick a photo to preview AR filters.</BodyText>
            </View>
          )}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {FILTERS.map((filter) => {
              const active = selectedFilter === filter.key;
              return (
                <Pressable
                  key={filter.key}
                  onPress={() => setSelectedFilter(filter.key)}
                  style={[styles.filterChip, active && styles.filterChipActive]}>
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>{filter.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <PrimaryButton title={busy ? "Applying..." : "Apply Filter"} onPress={applyFilter} disabled={busy} />
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
  filterRow: {
    gap: 8,
  },
  filterChip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "#DFDFDF",
    backgroundColor: "#F4F4F4",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  filterChipActive: {
    backgroundColor: "#515151",
    borderColor: "#515151",
  },
  filterText: {
    color: "#404040",
    fontFamily: fonts.body,
    fontWeight: "700",
    fontSize: 12,
  },
  filterTextActive: {
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
