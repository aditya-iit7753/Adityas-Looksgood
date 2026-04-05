import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import API from "../services/api";
import { colors, fonts } from "../theme";
import { BodyText, Card, PrimaryButton, Screen, Title } from "../ui";

export default function PaywallScreen({ navigation }) {
  const upgrade = async (plan) => {
    try {
      await API.post("/subscription/upgrade", null, { params: { plan } });
      Alert.alert("Plan updated", `You are now on ${plan}.`);
      navigation.replace("Feed");
    } catch (error) {
      Alert.alert("Upgrade failed", error?.message || "Please try again.");
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 24, gap: 10 }} showsVerticalScrollIndicator={false}>
        <Title size={30}>Go Pro</Title>
        <BodyText style={{ marginBottom: 10 }}>Unlock unlimited AI styling and faster publishing.</BodyText>

        <PlanCard
          title="Pro"
          price="$9/month"
          details="For regular creators who post daily."
          onPress={() => upgrade("pro")}
        />
        <PlanCard
          title="Creator"
          price="$19/month"
          details="For power users with high volume output."
          onPress={() => upgrade("creator")}
        />

        <Pressable onPress={() => navigation.goBack()} style={{ alignItems: "center", marginTop: 4 }}>
          <Text style={{ color: colors.subtext, fontWeight: "700", fontFamily: fonts.body }}>Continue on Free</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

function PlanCard({ title, price, details, onPress }) {
  return (
    <Card>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontSize: 20, color: colors.text, fontWeight: "800", fontFamily: fonts.display }}>{title}</Text>
        <Text style={{ color: colors.primary, fontWeight: "800", fontFamily: fonts.body }}>{price}</Text>
      </View>
      <BodyText>{details}</BodyText>
      <PrimaryButton title={`Choose ${title}`} onPress={onPress} />
    </Card>
  );
}
