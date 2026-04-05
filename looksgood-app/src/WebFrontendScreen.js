import { ActivityIndicator, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { WEB_FRONTEND_URL } from "./services/api";
import { colors } from "./theme";

export default function WebFrontendScreen() {
  if (!WEB_FRONTEND_URL) {
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
        source={{ uri: WEB_FRONTEND_URL }}
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
