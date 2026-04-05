import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { colors, fonts, radius } from "./theme";
import { BodyText, Card, Screen, Title } from "./ui";

export default function StoryViewerScreen({ route }) {
  const story = route.params?.story || {};
  const visibility = story.visibility || "public";
  const hasMedia = Boolean(story.media_url);

  const visibilityLabel =
    visibility === "private" ? "Private" : visibility === "close_friends" ? "Close Friends" : "Public";
  const visibilityIcon =
    visibility === "private" ? "lock-closed-outline" : visibility === "close_friends" ? "people-outline" : "globe-outline";

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 24, gap: 10 }} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Title size={28}>{story.story_type === "status" ? "Status" : "Story"}</Title>
          <View style={styles.visibilityChip}>
            <Ionicons name={visibilityIcon} size={13} color="#2F2F2F" />
            <Text style={styles.visibilityText}>{visibilityLabel}</Text>
          </View>
        </View>

        <Card style={styles.mediaCard}>
          {hasMedia ? (
            <Image source={{ uri: story.media_url }} style={styles.image} resizeMode="cover" />
          ) : (
            <LinearGradient colors={["#313131", "#606060", "#7F7F7F"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.statusCard}>
              <Ionicons name="chatbubble-ellipses-outline" size={26} color="#F5F5F5" />
              <Text style={styles.statusText}>{story.status_text || story.caption || "No status text."}</Text>
            </LinearGradient>
          )}
        </Card>
        <BodyText style={styles.userText}>@{story.user || "creator"}</BodyText>
        {hasMedia && story.status_text ? <BodyText>{story.status_text}</BodyText> : null}
        {story.caption ? <BodyText>{story.caption}</BodyText> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  visibilityChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radius.pill,
    backgroundColor: "#F0F0F0",
    borderWidth: 1,
    borderColor: "#D1D1D1",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  visibilityText: {
    color: "#2F2F2F",
    fontFamily: fonts.body,
    fontWeight: "700",
    fontSize: 12,
  },
  mediaCard: {
    padding: 0,
    overflow: "hidden",
    marginTop: 8,
  },
  image: {
    width: "100%",
    height: 440,
  },
  statusCard: {
    minHeight: 320,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    gap: 10,
  },
  statusText: {
    color: "#FFFFFF",
    fontFamily: fonts.display,
    fontWeight: "800",
    fontSize: 24,
    textAlign: "center",
    lineHeight: 30,
  },
  userText: {
    marginTop: 10,
    color: colors.text,
    fontFamily: fonts.body,
    fontWeight: "800",
  },
});
