import { Alert, Linking, Pressable, ScrollView, Text, View } from "react-native";
import API from "../services/api";
import { PRIVACY_POLICY_URL } from "../services/links";
import { usesPlaySafeAndroidPaywall } from "../services/monetization";
import { colors, fonts } from "../theme";
import { BodyText, Card, PrimaryButton, Screen, SecondaryButton, Title } from "../ui";

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

  const openPrivacyPolicy = () => {
    if (!PRIVACY_POLICY_URL) {
      Alert.alert("Privacy policy unavailable", "Add a public web frontend URL to open the privacy policy.");
      return;
    }
    navigation.navigate("WebFrontend", { title: "Privacy Policy", url: PRIVACY_POLICY_URL });
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 24, gap: 10 }} showsVerticalScrollIndicator={false}>
        <Title size={30}>{usesPlaySafeAndroidPaywall ? "Premium Access" : "Go Pro"}</Title>
        <BodyText style={{ marginBottom: 10 }}>
          {usesPlaySafeAndroidPaywall
            ? "This Android build keeps premium sign-in access, but it does not sell digital subscriptions in-app yet."
            : "Unlock AI features, higher limits, and remove ads."}
        </BodyText>

        {usesPlaySafeAndroidPaywall ? (
          <>
            <Card>
              <Text style={{ fontSize: 20, color: colors.text, fontWeight: "800", fontFamily: fonts.display }}>Play-safe Android build</Text>
              <BodyText>
                Existing members keep their access after signing in. New in-app subscription sales stay disabled here until Google Play Billing is
                wired up.
              </BodyText>
              <BodyText>Premium plans still include ad-free viewing, higher AI limits, and creator tools once billing is ready.</BodyText>
            </Card>

            {typeof __DEV__ === "boolean" && __DEV__ ? (
              <>
                <PlanCard title="Dev unlock Pro" details="Testing shortcut for local Android builds." onPress={() => upgradeDevOnly("pro")} />
                <PlanCard
                  title="Dev unlock Creator"
                  details="Testing shortcut for higher quota local Android builds."
                  onPress={() => upgradeDevOnly("creator")}
                />
              </>
            ) : null}

            <PrimaryButton title="Continue on Free" onPress={() => navigation.goBack()} />
            <SecondaryButton title="Privacy Policy" onPress={openPrivacyPolicy} disabled={!PRIVACY_POLICY_URL} />
          </>
        ) : (
          <>
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
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function PlanCard({ title, price, details, onPress }) {
  const actionEnabled = typeof onPress === "function";
  return (
    <Card>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontSize: 20, color: colors.text, fontWeight: "800", fontFamily: fonts.display }}>{title}</Text>
        {price ? <Text style={{ color: colors.primary, fontWeight: "800", fontFamily: fonts.body }}>{price}</Text> : null}
      </View>
      <BodyText>{details}</BodyText>
      {actionEnabled ? <PrimaryButton title={`Choose ${title}`} onPress={onPress} /> : null}
    </Card>
  );
}
