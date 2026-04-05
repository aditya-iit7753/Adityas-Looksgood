import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import API from "./services/api";
import { colors, fonts, radius } from "./theme";
import { Screen } from "./ui";

export default function CreatorChatScreen() {
  const [messages, setMessages] = useState([
    { id: "intro", role: "assistant", content: "Hey creator! Ask me for ideas, hooks, captions, or growth tips." },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const trimmedInput = input.trim();
  const canSend = useMemo(() => trimmedInput.length > 0 && !sending, [trimmedInput, sending]);

  const sendMessage = async () => {
    if (!canSend) return;
    const text = trimmedInput;
    setInput("");
    const nextUser = { id: `${Date.now()}-user`, role: "user", content: text };
    setMessages((prev) => [...prev, nextUser]);
    setSending(true);

    try {
      const history = [...messages, nextUser]
        .slice(-8)
        .map((item) => ({ role: item.role, content: item.content }));
      const res = await API.post("/ai/assistant", {
        prompt: text,
        history,
      });
      const replyText = String(res?.data?.reply || "").trim() || "I could not generate a reply yet.";
      setMessages((prev) => [
        ...prev,
        { id: `${Date.now()}-assistant`, role: "assistant", content: replyText },
      ]);
    } catch (_err) {
      setMessages((prev) => [
        ...prev,
        { id: `${Date.now()}-assistant`, role: "assistant", content: "Sorry, I could not answer that just now." },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Ionicons name="sparkles-outline" size={20} color={colors.primary} />
        <Text style={styles.headerText}>Creator AI Chat</Text>
      </View>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.chatList}
        renderItem={({ item }) => {
          const isUser = item.role === "user";
          return (
            <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
              <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>{item.content}</Text>
            </View>
          );
        }}
      />

      <View style={styles.inputRow}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Ask about captions, hooks, growth, or trends..."
          placeholderTextColor={colors.subtext}
          style={styles.input}
          multiline
        />
        <Pressable onPress={sendMessage} disabled={!canSend} style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}>
          {sending ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="send" size={18} color="#FFFFFF" />}
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  headerText: {
    fontFamily: fonts.display,
    fontWeight: "800",
    fontSize: 20,
    color: colors.text,
  },
  chatList: {
    gap: 10,
    paddingBottom: 12,
  },
  bubble: {
    maxWidth: "80%",
    borderRadius: radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  bubbleAssistant: {
    alignSelf: "flex-start",
    backgroundColor: "#F4F4F4",
    borderWidth: 1,
    borderColor: "#DCDCDC",
  },
  bubbleUser: {
    alignSelf: "flex-end",
    backgroundColor: "#515151",
  },
  bubbleText: {
    fontFamily: fonts.body,
    color: colors.text,
    fontSize: 13,
  },
  bubbleTextUser: {
    color: "#FFFFFF",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginTop: 10,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 13,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  sendBtnDisabled: {
    backgroundColor: "#A2A2A2",
  },
});
