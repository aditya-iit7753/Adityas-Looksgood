import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import API from "./services/api";
import { colors, fonts, radius } from "./theme";
import { BodyText, Card, Screen, Title } from "./ui";

export default function CloseFriendsScreen({ navigation }) {
  const [users, setUsers] = useState([]);
  const [closeFriendIds, setCloseFriendIds] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [savingUserId, setSavingUserId] = useState(null);
  const [requestingUserId, setRequestingUserId] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, closeRes] = await Promise.all([API.get("/social/users"), API.get("/stories/close-friends")]);
      const allUsers = Array.isArray(usersRes.data) ? usersRes.data : [];
      const closeFriends = Array.isArray(closeRes.data) ? closeRes.data : [];
      const nextCloseSet = new Set(closeFriends.map((item) => Number(item.user_id)));
      setCloseFriendIds(nextCloseSet);
      setUsers(allUsers.filter((item) => !item.is_me));
    } catch (err) {
      Alert.alert("Failed", err?.message || "Could not load close friends.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleCloseFriend = async (userId) => {
    setSavingUserId(userId);
    try {
      if (closeFriendIds.has(userId)) {
        await API.delete(`/stories/close-friends/${userId}`);
        setCloseFriendIds((prev) => {
          const next = new Set(prev);
          next.delete(userId);
          return next;
        });
      } else {
        await API.post(`/stories/close-friends/${userId}`);
        setCloseFriendIds((prev) => {
          const next = new Set(prev);
          next.add(userId);
          return next;
        });
      }
    } catch (err) {
      Alert.alert("Failed", err?.message || "Could not update close friends.");
    } finally {
      setSavingUserId(null);
    }
  };

  const toggleRequest = async (user) => {
    if (!user?.id) return;
    setRequestingUserId(user.id);
    try {
      if (user.is_following) {
        await API.delete(`/social/follow/${user.id}`);
      } else {
        await API.post(`/social/follow/${user.id}`);
      }
      setUsers((prev) =>
        prev.map((entry) =>
          entry.id === user.id ? { ...entry, is_following: !entry.is_following } : entry
        )
      );
    } catch (err) {
      Alert.alert("Failed", err?.message || "Could not update request.");
    } finally {
      setRequestingUserId(null);
    }
  };

  return (
    <Screen>
      <Title size={30}>Close Friends</Title>
      <BodyText style={{ marginTop: 4 }}>
        Only people in this list can see stories shared with the close friends audience.
      </BodyText>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => String(item.id)}
          style={{ marginTop: 12 }}
          contentContainerStyle={{ gap: 10, paddingBottom: 20 }}
          renderItem={({ item }) => {
            const active = closeFriendIds.has(item.id);
            return (
              <Card style={styles.userCard}>
                <View style={styles.userRow}>
                  <Pressable
                    onPress={() => navigation.navigate("Profile", { userId: item.id })}
                    style={styles.profileLink}>
                    <View style={styles.avatarCircle}>
                      <Text style={styles.avatarText}>{String(item.username || item.email || "U").slice(0, 1).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.username}>@{item.username || item.email?.split("@")[0] || "creator"}</Text>
                      <BodyText numberOfLines={1}>{item.email || ""}</BodyText>
                    </View>
                  </Pressable>
                  <View style={styles.actionGroup}>
                    <Pressable
                      onPress={() => toggleCloseFriend(item.id)}
                      disabled={savingUserId === item.id}
                      style={[styles.actionBtn, active ? styles.actionBtnActive : styles.actionBtnInactive]}>
                      {savingUserId === item.id ? (
                        <ActivityIndicator size="small" color={active ? "#FFFFFF" : "#2F2F2F"} />
                      ) : (
                        <>
                          <Ionicons name={active ? "checkmark-circle" : "add-circle-outline"} size={16} color={active ? "#FFFFFF" : "#2F2F2F"} />
                          <Text style={[styles.actionText, active && styles.actionTextActive]}>
                            {active ? "Added" : "Add"}
                          </Text>
                        </>
                      )}
                    </Pressable>
                    <Pressable
                      onPress={() => toggleRequest(item)}
                      disabled={requestingUserId === item.id}
                      style={[styles.requestBtn, item.is_following && styles.requestBtnActive]}>
                      {requestingUserId === item.id ? (
                        <ActivityIndicator size="small" color={item.is_following ? "#5D5D5D" : "#2F2F2F"} />
                      ) : (
                        <>
                          <Ionicons
                            name={item.is_following ? "checkmark-circle-outline" : "person-add-outline"}
                            size={15}
                            color={item.is_following ? "#5D5D5D" : "#2F2F2F"}
                          />
                          <Text style={[styles.requestText, item.is_following && styles.requestTextActive]}>
                            {item.is_following ? "Requested" : "Request"}
                          </Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                </View>
              </Card>
            );
          }}
          ListEmptyComponent={
            <Card>
              <BodyText>No users found yet. Follow someone first, then add them here.</BodyText>
            </Card>
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  userCard: {
    borderColor: "#DDDDDD",
    backgroundColor: "#FFFFFF",
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  profileLink: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  actionGroup: {
    alignItems: "flex-end",
    gap: 7,
  },
  avatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#EFEFEF",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#373737",
    fontFamily: fonts.display,
    fontWeight: "800",
    fontSize: 16,
  },
  username: {
    color: colors.text,
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 14,
    marginBottom: 2,
  },
  actionBtn: {
    minWidth: 86,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
  },
  actionBtnInactive: {
    borderColor: "#CACACA",
    backgroundColor: "#F3F3F3",
  },
  actionBtnActive: {
    borderColor: "#757575",
    backgroundColor: "#757575",
  },
  actionText: {
    color: "#2F2F2F",
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 12,
  },
  actionTextActive: {
    color: "#FFFFFF",
  },
  requestBtn: {
    minWidth: 98,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#CACACA",
    backgroundColor: "#F3F3F3",
  },
  requestBtnActive: {
    backgroundColor: "#F3F3F3",
    borderColor: "#D6D6D6",
  },
  requestText: {
    color: "#2F2F2F",
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 12,
  },
  requestTextActive: {
    color: "#5D5D5D",
  },
});
