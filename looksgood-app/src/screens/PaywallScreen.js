import { Alert, Linking, Pressable, ScrollView, Text, View } from "react-native";
import API from "../services/api";
import { colors, fonts } from "../theme";
import { BodyText, Card, PrimaryButton, Screen, Title } from "../ui";

export default function PaywallScreen({ navigation }) {
  const upgradeDevOnly = async (plan) => {
    try {
      await API.post("/subscription/upgrade", null, { params: { plan } });
      Alert.alert("Plan updated", `You are now on ${plan}.`);
      navigation.replace("Feed");
    } catch (error) {
      Alert.alert("Upgrade failed", error?.message || "Please try again.");
    }
  };

  const checkout = async (plan) => {
    try {
      const res = await API.post("/subscription/checkout", null, { params: { plan } });
      const url = res?.data?.url;
      if (!url) throw new Error("Checkout link missing.");
      await Linking.openURL(String(url));
      Alert.alert("Complete payment", "Finish checkout in your browser, then return to the app and refresh.");
    } catch (error) {
      if (typeof __DEV__ === "boolean" && __DEV__) {
        await upgradeDevOnly(plan);
        return;
      }
      Alert.alert("Checkout unavailable", error?.message || "Subscription payments are not configured yet.");
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 24, gap: 10 }} showsVerticalScrollIndicator={false}>
        <Title size={30}>Go Pro</Title>
        <BodyText style={{ marginBottom: 10 }}>Unlock AI features, higher limits, and remove ads.</BodyText>

        <PlanCard
          title="Pro"
          price="$9/month"
          details="For regular creators who post daily."
          onPress={() => checkout("pro")}
        />
        <PlanCard
          title="Creator"
          price="$19/month"
          details="For power users with high volume output."
          onPress={() => checkout("creator")}
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
