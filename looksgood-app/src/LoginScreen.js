import { useEffect, useRef, useState } from "react";
import { Alert, Animated, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import API, { setAuthToken } from "./services/api";
import { getOrCreateDeviceId, saveToken } from "./services/authStorage";
import { colors, fonts, radius } from "./theme";
import { PrimaryButton, Screen, Title } from "./ui";

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mode, setMode] = useState("login");
  const [showForgot, setShowForgot] = useState(false);
  const [showPhoneVerify, setShowPhoneVerify] = useState(false);
  const [phonePassword, setPhonePassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState(false);
  const introAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(introAnim, {
      toValue: 1,
      duration: 520,
      useNativeDriver: true,
    }).start();
  }, [introAnim]);

  const headerTranslateY = introAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });

  const handleSocialAuth = async (provider) => {
    if (socialLoading) return;
    setSocialLoading(true);
    try {
      const deviceId = await getOrCreateDeviceId();
      const res = await API.post("auth/social", { provider, device_id: deviceId });
      setAuthToken(res.data?.token);
      await saveToken(res.data?.token);
      navigation.replace("Feed");
    } catch (error) {
      const attemptedUrl = error?.config ? `${error.config.baseURL || ""}${error.config.url || ""}` : "";
      const detail = [error?.message, attemptedUrl && `URL: ${attemptedUrl}`].filter(Boolean).join("\n");
      Alert.alert("Social login failed", detail || "Please try again.");
    } finally {
      setSocialLoading(false);
    }
  };

  const submit = async () => {
    if (!email || !password) {
      Alert.alert("Missing details", "Please enter both email and password.");
      return;
    }
    if (mode === "signup" && password !== confirmPassword) {
      Alert.alert("Passwords don't match", "Please confirm your password.");
      return;
    }

    setLoading(true);
    try {
      const endpoint = mode === "signup" ? "auth/signup" : "auth/login";
      const res = await API.post(endpoint, { email, password });
      setAuthToken(res.data?.token);
      await saveToken(res.data?.token);
      navigation.replace("Feed");
    } catch (error) {
      const attemptedUrl = error?.config ? `${error.config.baseURL || ""}${error.config.url || ""}` : "";
      const detail = [error?.message, attemptedUrl && `URL: ${attemptedUrl}`].filter(Boolean).join("\n");
      Alert.alert(mode === "signup" ? "Sign up failed" : "Login failed", detail || "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    if (!email || !password) {
      Alert.alert("Missing details", "Enter your email and new password.");
      return;
    }
    setLoading(true);
    try {
      await API.post("auth/forgot-password", { email, password });
      Alert.alert("Done", "Password updated. You can now login.");
      setShowForgot(false);
      setMode("login");
    } catch (error) {
      Alert.alert("Reset failed", error?.message || "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const openForgot = () => {
    setShowPhoneVerify(true);
  };

  const closePhoneVerify = () => {
    setShowPhoneVerify(false);
    setPhonePassword("");
  };

  const verifyPhonePassword = () => {
    if (phonePassword.trim().length < 4) {
      Alert.alert("Phone password required", "Enter your phone password to continue.");
      return;
    }
    setShowPhoneVerify(false);
    setPhonePassword("");
    setShowForgot(true);
    setMode("login");
  };

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={styles.root}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        <Animated.View style={[styles.brandWrap, { opacity: introAnim, transform: [{ translateY: headerTranslateY }] }]}>
          <Title size={40}>
            <Text style={styles.brandTitle}>LooksGood</Text>
          </Title>
        </Animated.View>

        <Text style={styles.connectLabel}>Connect with</Text>

        <View style={styles.socialRow}>
          <SocialButton icon="logo-instagram" label="Instagram" color="#656565" onPress={handleSocialAuth} disabled={socialLoading || loading} />
          <SocialButton icon="logo-snapchat" label="Snapchat" color="#EAEAEA" onPress={handleSocialAuth} disabled={socialLoading || loading} />
          <SocialButton icon="logo-facebook" label="Facebook" color="#6C6C6C" onPress={handleSocialAuth} disabled={socialLoading || loading} />
          <SocialButton icon="logo-whatsapp" label="WhatsApp" color="#A6A6A6" onPress={handleSocialAuth} disabled={socialLoading || loading} />
        </View>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.modeRow}>
          <TabButton active={mode === "login"} onPress={() => setMode("login")} label="Login" />
          <TabButton active={mode === "signup"} onPress={() => setMode("signup")} label="Sign Up" />
        </View>

        <View style={styles.formStack}>
          <FieldInput
            icon="mail-outline"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            placeholder="Email address"
          />
          <FieldInput
            icon="lock-closed-outline"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder={showForgot ? "New password" : "Password"}
          />
          {mode === "signup" && !showForgot ? (
            <FieldInput
              icon="checkmark-circle-outline"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              placeholder="Confirm password"
            />
          ) : null}

          <PrimaryButton
            title={showForgot ? "Reset Password" : mode === "signup" ? "Create account" : "Login"}
            onPress={showForgot ? resetPassword : submit}
            loading={loading}
          />

          <Pressable onPress={showForgot ? () => setShowForgot(false) : openForgot} style={styles.forgotBtn}>
            <Text style={styles.forgotBtnText}>
              {showForgot ? "Back to login" : "Forgot password?"}
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      <Modal transparent animationType="fade" visible={showPhoneVerify} onRequestClose={closePhoneVerify}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Verify phone password</Text>
            <Text style={styles.modalSubtitle}>Enter your phone password to continue.</Text>
            <TextInput
              value={phonePassword}
              onChangeText={setPhonePassword}
              placeholder="Phone password"
              placeholderTextColor={colors.subtext}
              secureTextEntry
              keyboardType="number-pad"
              style={styles.modalInput}
            />
            <View style={styles.modalActions}>
              <Pressable onPress={closePhoneVerify} style={styles.modalGhost}>
                <Text style={styles.modalGhostText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={verifyPhonePassword} style={styles.modalPrimary}>
                <Text style={styles.modalPrimaryText}>Verify</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function SocialButton({ icon, label, color, onPress, disabled = false }) {
  return (
    <Pressable
      onPress={() => onPress(label)}
      disabled={disabled}
      style={({ pressed }) => [
        styles.socialButton,
        pressed && !disabled && styles.socialButtonPressed,
        disabled && styles.socialButtonDisabled,
      ]}>
      <Ionicons name={icon} size={30} color={color} />
      <Text style={styles.socialLabel}>{label}</Text>
    </Pressable>
  );
}

function FieldInput({ icon, value, onChangeText, placeholder, secureTextEntry = false, keyboardType = "default" }) {
  return (
    <View style={styles.fieldShell}>
      <Ionicons name={icon} size={16} color={colors.subtext} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor={colors.subtext}
        secureTextEntry={secureTextEntry}
        autoCapitalize="none"
        style={styles.fieldInput}
      />
    </View>
  );
}

function TabButton({ active, onPress, label }) {
  return (
    <Pressable onPress={onPress} style={[styles.tabButton, active && styles.tabButtonActive]}>
      <Text style={styles.tabButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 24,
    backgroundColor: "#F7F7F7",
    gap: 16,
  },
  brandWrap: {
    alignItems: "center",
  },
  brandTitle: {
    color: "#242424",
    fontFamily: fonts.display,
    fontWeight: "800",
    textAlign: "center",
  },
  connectLabel: {
    color: colors.subtext,
    fontWeight: "700",
    fontFamily: fonts.body,
    letterSpacing: 0.4,
  },
  socialRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 12,
  },
  socialButton: {
    width: 150,
    borderRadius: radius.lg,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E7E7E7",
    alignItems: "center",
    gap: 6,
    shadowColor: "#171717",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  socialButtonPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.95,
  },
  socialButtonDisabled: {
    opacity: 0.55,
  },
  socialLabel: {
    color: "#282828",
    fontFamily: fonts.body,
    fontWeight: "700",
    fontSize: 12,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
    maxWidth: 360,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#DDDDDD",
  },
  dividerText: {
    color: colors.subtext,
    fontFamily: fonts.body,
    fontWeight: "700",
    fontSize: 12,
  },
  modeRow: {
    flexDirection: "row",
    backgroundColor: "#EEEEEE",
    borderRadius: radius.md,
    padding: 4,
    width: "100%",
    maxWidth: 360,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    borderRadius: radius.sm,
    paddingVertical: 8,
    backgroundColor: "transparent",
  },
  tabButtonActive: {
    backgroundColor: "#FFFFFF",
  },
  tabButtonText: {
    color: colors.text,
    fontWeight: "700",
    fontFamily: fonts.body,
  },
  formStack: {
    width: "100%",
    maxWidth: 360,
    gap: 10,
  },
  fieldShell: {
    borderWidth: 1,
    borderColor: "#E2E2E2",
    borderRadius: radius.md,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
  },
  fieldInput: {
    flex: 1,
    paddingVertical: 10,
    color: colors.text,
    fontFamily: fonts.body,
  },
  forgotBtn: {
    alignSelf: "flex-start",
  },
  forgotBtnText: {
    color: colors.primary,
    fontWeight: "700",
    fontFamily: fonts.body,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(23, 23, 23, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: radius.lg,
    backgroundColor: "#FFFFFF",
    padding: 18,
    gap: 12,
  },
  modalTitle: {
    fontFamily: fonts.display,
    fontWeight: "800",
    fontSize: 18,
    color: colors.text,
  },
  modalSubtitle: {
    fontFamily: fonts.body,
    color: colors.subtext,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#E2E2E2",
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.body,
    color: colors.text,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  modalGhost: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modalGhostText: {
    color: colors.subtext,
    fontFamily: fonts.body,
    fontWeight: "700",
  },
  modalPrimary: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  modalPrimaryText: {
    color: "#FFFFFF",
    fontFamily: fonts.body,
    fontWeight: "700",
  },
});
