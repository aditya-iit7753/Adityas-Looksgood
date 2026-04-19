import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { colors, fonts } from "../theme";
import { clearToken, loadToken, saveToken } from "../services/authStorage";
import API, { isApiUnavailableError, setAuthToken } from "../services/api";
import { AgentProvider } from "../agent/AgentContext";
import GlobalVoiceAgent from "../GlobalVoiceAgent";

import LoginScreen from "../LoginScreen";
import FeedScreen from "../FeedScreen";
import DiscoverScreen from "../DiscoverScreen";
import ProfileScreen from "../ProfileScreen";
import CommentsScreen from "../CommentsScreen";
import ReelsScreen from "../ReelsScreen";
import StyleDNAScreen from "../StyleDNAScreen";
import NotificationsScreen from "../NotificationsScreen";
import StoryViewerScreen from "../StoryViewerScreen";
import WebFrontendScreen from "../WebFrontendScreen";
import UploadScreen from "../UploadScreen";
import GenerateScreen from "../GenerateScreen";
import VideoPreviewScreen from "../VideoPreviewScreen";
import PaywallScreen from "../screens/PaywallScreen";
import AIAgentScreen from "../AIAgentScreen";
import CreatorChatScreen from "../CreatorChatScreen";
import SettingsScreen from "../SettingsScreen";
import ChatListScreen from "../ChatListScreen";
import ChatRoomScreen from "../ChatRoomScreen";
import CallScreen from "../CallScreen";
import CloseFriendsScreen from "../CloseFriendsScreen";
import ARFiltersScreen from "../ARFiltersScreen";
import Avatar3DScreen from "../Avatar3DScreen";
import TrendsScreen from "../TrendsScreen";
import AppAgentScreen from "../AppAgentScreen";
import ConnectionCenterScreen from "../ConnectionCenterScreen";
import VirtualRoomsScreen from "../VirtualRoomsScreen";

const Stack = createNativeStackNavigator();
const navigationRef = createNavigationContainerRef();
export default function AppNavigator() {
  const [ready, setReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [bootstrapConnectionHint, setBootstrapConnectionHint] = useState("");

  useEffect(() => {
    const bootstrap = async () => {
      const token = await loadToken();
      if (token) {
        setAuthToken(token);
        try {
          const me = await API.get("/auth/me");
          const refreshedToken = me?.data?.token;
          if (refreshedToken) {
            setAuthToken(refreshedToken);
            await saveToken(refreshedToken);
          }
          setBootstrapConnectionHint("");
          setIsAuthenticated(true);
        } catch (err) {
          if (isApiUnavailableError(err)) {
            setBootstrapConnectionHint(err?.message || "Cached session restored, but the API is temporarily unreachable.");
            setIsAuthenticated(true);
          } else {
            setAuthToken(null);
            await clearToken();
            setBootstrapConnectionHint("");
            setIsAuthenticated(false);
          }
        }
      }
      setReady(true);
    };
    bootstrap();
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <AgentProvider>
      <NavigationContainer ref={navigationRef}>
        <StatusBar style="dark" />
        <View style={{ flex: 1 }}>
          <Stack.Navigator
            initialRouteName={isAuthenticated ? "Feed" : "Login"}
            screenOptions={{
              headerShadowVisible: false,
              headerBackTitle: "Back",
              headerStyle: { backgroundColor: colors.bg },
              headerTintColor: colors.text,
              headerTitleStyle: { fontFamily: fonts.body, fontWeight: "800" },
            }}>
            <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
            <Stack.Screen
              name="Feed"
              component={FeedScreen}
              initialParams={bootstrapConnectionHint ? { connectionHint: bootstrapConnectionHint } : undefined}
              options={{ title: "" }}
            />
            <Stack.Screen name="Discover" component={DiscoverScreen} options={{ title: "People" }} />
            <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: "Profile" }} />
            <Stack.Screen name="Comments" component={CommentsScreen} options={{ title: "Comments" }} />
            <Stack.Screen name="Reels" component={ReelsScreen} options={{ title: "Reels" }} />
            <Stack.Screen name="StyleDNA" component={StyleDNAScreen} options={{ title: "Style DNA" }} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: "Notifications" }} />
            <Stack.Screen name="StoryViewer" component={StoryViewerScreen} options={{ title: "Story" }} />
            <Stack.Screen
              name="WebFrontend"
              component={WebFrontendScreen}
              options={({ route }) => ({ title: route?.params?.title || "Web UI" })}
            />
            <Stack.Screen name="Upload" component={UploadScreen} options={{ title: "New Look" }} />
            <Stack.Screen name="Generate" component={GenerateScreen} options={{ title: "AI Generate" }} />
            <Stack.Screen name="AIAgent" component={AIAgentScreen} options={{ title: "Creative Studio" }} />
            <Stack.Screen name="CreatorChat" component={CreatorChatScreen} options={{ title: "Creator Chat" }} />
            <Stack.Screen name="Chat" component={ChatListScreen} options={{ headerShown: false }} />
            <Stack.Screen name="ChatRoom" component={ChatRoomScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Call" component={CallScreen} options={{ headerShown: false }} />
            <Stack.Screen name="CloseFriends" component={CloseFriendsScreen} options={{ title: "Close Friends" }} />
            <Stack.Screen name="ARFilters" component={ARFiltersScreen} options={{ title: "AR Filters" }} />
            <Stack.Screen name="Avatar3D" component={Avatar3DScreen} options={{ title: "3D Avatars" }} />
            <Stack.Screen name="VirtualRooms" component={VirtualRoomsScreen} options={{ title: "Virtual Rooms" }} />
            <Stack.Screen name="ConnectionCenter" component={ConnectionCenterScreen} options={{ title: "Connection Center" }} />
            <Stack.Screen name="Trends" component={TrendsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="AppAgent" component={AppAgentScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: "Settings" }} />
            <Stack.Screen name="Preview" component={VideoPreviewScreen} options={{ title: "Preview" }} />
            <Stack.Screen name="Paywall" component={PaywallScreen} options={{ title: "Upgrade" }} />
          </Stack.Navigator>
          <GlobalVoiceAgent navigationRef={navigationRef} enabled={isAuthenticated} />
        </View>
      </NavigationContainer>
    </AgentProvider>
  );
}
