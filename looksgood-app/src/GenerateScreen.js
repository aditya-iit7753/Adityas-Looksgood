import { useState } from "react";
import { ActivityIndicator, Alert, Image, ScrollView, View } from "react-native";
import API from "./services/api";
import { colors } from "./theme";
import { BodyText, Card, Chip, PrimaryButton, Screen, Title } from "./ui";

export default function GenerateScreen({ route, navigation }) {
  const [loading, setLoading] = useState(false);
  const image = route.params?.image;

  const buildFallbackGeneration = () => ({
    detected_style: "casual outfit",
    outfit_suggestion: "Top: Oversized T-shirt | Bottom: Denim jeans | Shoes: Sneakers",
    confidence: 0.62,
    provider: "fallback",
  });

  const generate = async () => {
    if (!image?.uri) {
      Alert.alert("Missing image", "Upload an image first.");
      return;
    }

    setLoading(true);
    let remaining = 0;
    try {
      const status = await API.get("/subscription/status");
      remaining = status.data?.limits?.ai_generations_remaining ?? 0;
      if (remaining <= 0) {
        navigation.navigate("Paywall");
        return;
      }

      const formData = new FormData();
      formData.append("image", {
        uri: image.uri,
        name: "upload.jpg",
        type: "image/jpeg",
      });

      const res = await API.post("/ai/generate-look", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      navigation.navigate("Preview", {
        image,
        result: res.data,
        remaining: remaining - 1,
      });
    } catch (error) {
      const message = String(error?.message || "").toLowerCase();
      const status = Number(error?.response?.status);
      if (status === 402) {
        navigation.navigate("Paywall");
        return;
      }
      const isModelDependencyFailure =
        status === 503 || message.includes("ai features unavailable") || message.includes("ultralytics");
      if (isModelDependencyFailure) {
        navigation.navigate("Preview", {
          image,
          result: buildFallbackGeneration(),
          remaining: Math.max(0, remaining - 1),
        });
        return;
      }
      Alert.alert("Generation failed", error?.message ?? "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 24, gap: 10 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <Title size={28}>AI Generate</Title>
          <Chip>Style Engine</Chip>
        </View>

        <Card style={{ padding: 0, overflow: "hidden" }}>
          {image?.uri ? (
            <Image source={{ uri: image.uri }} style={{ width: "100%", height: 360 }} resizeMode="cover" />
          ) : (
            <View style={{ height: 220, justifyContent: "center", alignItems: "center" }}>
              <BodyText>No image selected</BodyText>
            </View>
          )}
        </Card>

        <BodyText>We analyze visual style, fit type, and vibe to generate a smart outfit recommendation.</BodyText>

        <PrimaryButton title={loading ? "Generating..." : "Generate Look"} onPress={generate} loading={loading} />
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
      </ScrollView>
    </Screen>
  );
}
