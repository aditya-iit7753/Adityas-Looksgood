import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import API from "./services/api";
import { colors, fonts, radius } from "./theme";
import { BodyText, Card, PrimaryButton, Screen, Title } from "./ui";

export default function VirtualRoomsScreen({ navigation }) {
  const [tab, setTab] = useState("meetups");
  const [meetups, setMeetups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [roomCode, setRoomCode] = useState("");

  const upcomingMeetups = useMemo(() => meetups, [meetups]);

  const loadMeetups = async () => {
    setLoading(true);
    try {
      const res = await API.get("/social/meetups");
      const rows = Array.isArray(res?.data) ? res.data : [];
      setMeetups(rows);
    } catch (err) {
      Alert.alert("Meetups unavailable", err?.message || "Could not load meetups.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMeetups();
  }, []);

  const createMeetup = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      Alert.alert("Title required", "Add a meetup title.");
      return;
    }
    setCreating(true);
    try {
      const res = await API.post("/social/meetups", {
        title: cleanTitle,
        description: description.trim(),
        scheduled_at: scheduledAt.trim() || null,
      });
      const created = res?.data?.meetup;
      if (created) {
        setMeetups((prev) => [created, ...prev]);
        setTitle("");
        setDescription("");
        setScheduledAt("");
        Alert.alert("Meetup created", "Your virtual meetup is ready to join.");
      }
    } catch (err) {
      Alert.alert("Create failed", err?.message || "Could not create meetup.");
    } finally {
      setCreating(false);
    }
  };

  const joinRoom = (code) => {
    const clean = String(code || "").trim();
    if (!clean) {
      Alert.alert("Room code needed", "Enter a room code to join.");
      return;
    }
    navigation.navigate("Call", { mode: "video", roomId: clean });
  };

  const createInstantRoom = () => {
    const code = `lsg-room-${Date.now().toString(36)}`;
    setRoomCode(code);
    navigation.navigate("Call", { mode: "video", roomId: code });
  };

  return (
    <Screen>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Title size={28}>Virtual Rooms</Title>
          <BodyText>Host meetups, launch rooms, and bring your community together.</BodyText>
        </View>
        <Pressable onPress={loadMeetups} style={styles.iconBtn}>
          <Ionicons name="refresh-outline" size={16} color="#404040" />
        </Pressable>
      </View>

      <View style={styles.tabRow}>
        {["meetups", "rooms"].map((key) => {
          const active = tab === key;
          return (
            <Pressable key={key} onPress={() => setTab(key)} style={[styles.tabChip, active && styles.tabChipActive]}>
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {key === "meetups" ? "Virtual Meetups" : "Instant Rooms"}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {tab === "meetups" ? (
        <ScrollView contentContainerStyle={{ gap: 12 }}>
          <Card>
            <Text style={styles.sectionTitle}>Create a Meetup</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Meetup title"
              placeholderTextColor={colors.subtext}
              style={styles.input}
            />
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Description (optional)"
              placeholderTextColor={colors.subtext}
              style={[styles.input, styles.multiline]}
              multiline
            />
            <TextInput
              value={scheduledAt}
              onChangeText={setScheduledAt}
              placeholder="Schedule (e.g., 2026-03-20 18:30)"
              placeholderTextColor={colors.subtext}
              style={styles.input}
            />
            <PrimaryButton title={creating ? "Creating..." : "Create Meetup"} onPress={createMeetup} disabled={creating} />
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>Upcoming Meetups</Text>
            {loading ? <BodyText>Loading meetups...</BodyText> : null}
            {!loading && upcomingMeetups.length === 0 ? <BodyText>No meetups yet. Create one!</BodyText> : null}
            {upcomingMeetups.map((meetup) => (
              <View key={meetup.id} style={styles.meetupCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.meetupTitle}>{meetup.title}</Text>
                  {meetup.description ? <BodyText>{meetup.description}</BodyText> : null}
                  {meetup.scheduled_at ? (
                    <Text style={styles.meetupMeta}>Scheduled: {meetup.scheduled_at}</Text>
                  ) : (
                    <Text style={styles.meetupMeta}>Go live anytime</Text>
                  )}
                  <Text style={styles.meetupMeta}>Host: @{meetup.host_name || "host"}</Text>
                  <Text style={styles.roomCode}>Room: {meetup.room_code}</Text>
                </View>
                <Pressable onPress={() => joinRoom(meetup.room_code)} style={styles.joinBtn}>
                  <Ionicons name="videocam-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.joinBtnText}>Join</Text>
                </Pressable>
              </View>
            ))}
          </Card>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ gap: 12 }}>
          <Card>
            <Text style={styles.sectionTitle}>Create Instant Room</Text>
            <BodyText>Start a live room right now and invite people to join.</BodyText>
            <PrimaryButton title="Start Room" onPress={createInstantRoom} />
            {roomCode ? <Text style={styles.roomCode}>Room code: {roomCode}</Text> : null}
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>Join a Room</Text>
            <TextInput
              value={roomCode}
              onChangeText={setRoomCode}
              placeholder="Enter room code"
              placeholderTextColor={colors.subtext}
              style={styles.input}
            />
            <PrimaryButton title="Join Room" onPress={() => joinRoom(roomCode)} />
          </Card>
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F3F3",
    borderWidth: 1,
    borderColor: "#D9D9D9",
  },
  tabRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  tabChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: "#F5F5F5",
    borderWidth: 1,
    borderColor: "#E2E2E2",
    alignItems: "center",
  },
  tabChipActive: {
    backgroundColor: "#515151",
    borderColor: "#515151",
  },
  tabText: {
    color: "#525252",
    fontFamily: fonts.body,
    fontWeight: "700",
    fontSize: 12,
  },
  tabTextActive: {
    color: "#FFFFFF",
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    backgroundColor: "#FFFFFF",
    fontFamily: fonts.body,
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  meetupCard: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderColor: "#E9E9E9",
  },
  meetupTitle: {
    color: colors.text,
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 14,
  },
  meetupMeta: {
    color: "#707070",
    fontFamily: fonts.body,
    fontSize: 12,
    marginTop: 2,
  },
  roomCode: {
    marginTop: 4,
    color: "#515151",
    fontFamily: fonts.mono,
    fontSize: 11,
  },
  joinBtn: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: "#515151",
  },
  joinBtnText: {
    color: "#FFFFFF",
    fontFamily: fonts.body,
    fontWeight: "700",
    fontSize: 12,
  },
});
