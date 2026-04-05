import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Animated, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import API, { setAuthToken } from "./services/api";
import { loadSettings, saveSettings } from "./services/settingsStorage";
import { clearToken } from "./services/authStorage";
import { colors, fonts, radius } from "./theme";
import { BodyText, Card, PrimaryButton, Screen, Title } from "./ui";
import BrandGlyph from "./BrandGlyph";

export default function SettingsScreen({ navigation }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");

  const [isPrivateAccount, setIsPrivateAccount] = useState(false);
  const [showActivityStatus, setShowActivityStatus] = useState(true);
  const [allowMessageRequests, setAllowMessageRequests] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const introAnim = useRef(new Animated.Value(0)).current;
  const { height } = useWindowDimensions();
  const compact = height < 760;

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [profileResult, settingsResult] = await Promise.allSettled([API.get("/social/profile/me"), loadSettings()]);

      if (profileResult.status === "fulfilled") {
        const profile = profileResult.value?.data?.profile;
        setEmail(profile?.email || "");
        setDisplayName(profile?.username || "");
        setBio(profile?.bio || "");
      }

      if (settingsResult.status === "fulfilled") {
        const localSettings = settingsResult.value || {};
        setIsPrivateAccount(Boolean(localSettings.isPrivateAccount));
        setShowActivityStatus(Boolean(localSettings.showActivityStatus));
        setAllowMessageRequests(Boolean(localSettings.allowMessageRequests));
      }

      if (profileResult.status === "rejected" && settingsResult.status === "rejected") {
        throw new Error("Could not load account settings from server.");
      }
    } catch (err) {
      Alert.alert("Failed", err?.message || "Could not load settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    Animated.timing(introAnim, {
      toValue: 1,
      duration: 520,
      useNativeDriver: true,
    }).start();
  }, [introAnim]);

  const onSave = async () => {
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("display_name", displayName || "");
      formData.append("bio", bio || "");
      await API.post("/social/profile/update", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const persisted = await saveSettings({
        isPrivateAccount,
        showActivityStatus,
        allowMessageRequests,
      });
      Alert.alert("Saved", persisted?._serverSynced ? "Settings updated." : "Saved locally. Server sync will retry next load.");
    } catch (err) {
      Alert.alert("Save failed", err?.message || "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const onLogout = () => {
    if (loggingOut) return;
    Alert.alert("Log out", "Do you want to log out of this account?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: async () => {
          setLoggingOut(true);
          try {
            setAuthToken(null);
            await clearToken();
            navigation.reset({ index: 0, routes: [{ name: "Login" }] });
          } finally {
            setLoggingOut(false);
          }
        },
      },
    ]);
  };

  const heroTranslateY = introAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={[styles.scrollContent, compact && styles.scrollContentCompact]} showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.heroWrap, { opacity: introAnim, transform: [{ translateY: heroTranslateY }] }]}>
          <LinearGradient
            colors={["#2D2D2D", "#6B6B6B", "#888888"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.heroCard, compact && styles.heroCardCompact]}>
            <View style={styles.heroTopRow}>
              <View style={{ flex: 1 }}>
                <BrandGlyph size={compact ? 40 : 46} />
                <Title size={31}>
                  <Text style={styles.heroTitle}>Settings & privacy</Text>
                </Title>
                <BodyText style={styles.heroSubtitle}>Manage account details, privacy, and visibility preferences.</BodyText>
              </View>
              <Pressable onPress={() => navigation.navigate("Profile")} style={styles.profileIconBtn}>
                <Ionicons name="person-circle-outline" size={22} color="#2F2F2F" />
              </Pressable>
            </View>

            <View style={[styles.heroTagRow, compact && styles.heroTagRowCompact]}>
              <HeroTag icon="shield-checkmark-outline" text="Secure" />
              <HeroTag icon="eye-outline" text={isPrivateAccount ? "Private" : "Public"} />
              <HeroTag icon="notifications-outline" text={showActivityStatus ? "Visible" : "Hidden"} />
            </View>
          </LinearGradient>
        </Animated.View>

        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="person-outline" size={16} color={colors.primary} />
            <Text style={styles.sectionTitle}>Account Details</Text>
          </View>
          <LabeledField label="Email" value={email} editable={false} icon="mail-outline" />
          <LabeledField label="Display Name" value={displayName} onChangeText={setDisplayName} icon="person-circle-outline" />
          <LabeledField label="Bio" value={bio} onChangeText={setBio} multiline icon="document-text-outline" />
        </Card>

        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="lock-closed-outline" size={16} color={colors.primary} />
            <Text style={styles.sectionTitle}>Privacy</Text>
          </View>

          <RowToggle
            title="Private Account"
            description="Only approved followers can see your profile and posts."
            value={isPrivateAccount}
            onValueChange={setIsPrivateAccount}
            icon="lock-closed-outline"
          />
          <View style={styles.rule} />
          <RowToggle
            title="Public Account"
            description="Anyone can discover and view your profile."
            value={!isPrivateAccount}
            onValueChange={(value) => setIsPrivateAccount(!value)}
            icon="globe-outline"
          />
          <View style={styles.rule} />
          <RowToggle
            title="Show Activity Status"
            description="Let others see when you are active."
            value={showActivityStatus}
            onValueChange={setShowActivityStatus}
            icon="pulse-outline"
          />
          <View style={styles.rule} />
          <RowToggle
            title="Allow Message Requests"
            description="Allow people who do not follow you to message."
            value={allowMessageRequests}
            onValueChange={setAllowMessageRequests}
            icon="chatbubble-ellipses-outline"
          />
        </Card>

        <PrimaryButton title={saving ? "Saving..." : "Save Settings"} onPress={onSave} loading={saving || loading} />
        <BodyText style={styles.noteText}>
          Privacy settings are saved on this device for now. Profile details save to your account.
        </BodyText>

        <Card style={styles.logoutCard}>
          <Pressable onPress={onLogout} style={({ pressed }) => [styles.logoutBtn, pressed && styles.logoutBtnPressed]}>
            <Ionicons name="log-out-outline" size={18} color={colors.danger} />
            <Text style={styles.logoutText}>{loggingOut ? "Logging out..." : "Log out"}</Text>
          </Pressable>
        </Card>
      </ScrollView>
    </Screen>
  );
}

function HeroTag({ icon, text }) {
  return (
    <View style={styles.heroTag}>
      <Ionicons name={icon} size={13} color="#F7F7F7" />
      <Text style={styles.heroTagText}>{text}</Text>
    </View>
  );
}

function LabeledField({ label, value, onChangeText, editable = true, multiline = false, icon = "create-outline" }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputShell, !editable && styles.inputShellDisabled, multiline && styles.inputShellMultiline]}>
        <Ionicons name={icon} size={16} color={editable ? colors.subtext : "#8A8A8A"} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          editable={editable}
          multiline={multiline}
          placeholder={label}
          placeholderTextColor={colors.subtext}
          style={[
            styles.input,
            !editable && styles.inputDisabled,
            multiline && { minHeight: 90, textAlignVertical: "top" },
          ]}
        />
      </View>
    </View>
  );
}

function RowToggle({ title, description, value, onValueChange, icon = "options-outline" }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={16} color={colors.primary} />
      </View>
      <View style={{ flex: 1, paddingRight: 10 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <BodyText style={{ fontSize: 13 }}>{description}</BodyText>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        thumbColor={value ? "#FFFFFF" : "#F3F3F3"}
        trackColor={{ false: "#D4D4D4", true: colors.primary }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
    gap: 12,
  },
  scrollContentCompact: {
    paddingTop: 8,
    paddingBottom: 18,
    gap: 10,
  },
  heroWrap: {
    marginBottom: 2,
  },
  heroCard: {
    borderRadius: radius.xl,
    padding: 16,
    shadowColor: "#3C3C3C",
    shadowOpacity: 0.23,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  heroCardCompact: {
    padding: 14,
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontFamily: fonts.display,
    fontWeight: "800",
  },
  heroSubtitle: {
    color: "#EFEFEF",
    marginTop: 6,
    maxWidth: 270,
  },
  profileIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroTagRow: {
    marginTop: 12,
    flexDirection: "row",
    gap: 8,
  },
  heroTagRowCompact: {
    marginTop: 10,
    gap: 6,
  },
  heroTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.35)",
    backgroundColor: "rgba(31, 31, 31, 0.2)",
  },
  heroTagText: {
    color: "#F7F7F7",
    fontFamily: fonts.body,
    fontWeight: "700",
    fontSize: 12,
  },
  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#DDDDDD",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 16,
  },
  label: {
    color: colors.text,
    fontFamily: fonts.body,
    fontWeight: "700",
    fontSize: 13,
  },
  inputShell: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 11,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  inputShellDisabled: {
    backgroundColor: "#F5F5F5",
  },
  inputShellMultiline: {
    alignItems: "flex-start",
    paddingTop: 10,
  },
  input: {
    flex: 1,
    paddingVertical: 10,
    color: colors.text,
    fontFamily: fonts.body,
  },
  inputDisabled: {
    color: "#7D7D7D",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  rowIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F2F2F2",
    marginRight: 8,
  },
  rowTitle: {
    color: colors.text,
    fontFamily: fonts.body,
    fontWeight: "800",
    marginBottom: 2,
  },
  rule: {
    height: 1,
    backgroundColor: colors.border,
  },
  noteText: {
    marginTop: 2,
    fontSize: 12,
  },
  logoutCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D9D9D9",
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#C5C5C5",
    backgroundColor: "#F9F9F9",
  },
  logoutBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  logoutText: {
    color: colors.danger,
    fontFamily: fonts.body,
    fontWeight: "800",
  },
});
