import { ActivityIndicator, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { WEB_FRONTEND_URL } from "./services/api";
import { colors } from "./theme";

export default function WebFrontendScreen({ route }) {
  const targetUrl = String(route?.params?.url || WEB_FRONTEND_URL || "").trim();

  if (!targetUrl) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, paddingHorizontal: 24 }}>
        <Text style={{ color: colors.text, textAlign: "center" }}>
          Web frontend URL is not configured for this build.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <WebView
        source={{ uri: targetUrl }}
        startInLoadingState
        renderLoading={() => (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        )}
      />
    </View>
  );
}
