import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

export default function BrandGlyph({ size = 46, flat = false }) {
  const inner = size * 0.66;
  const dot = size * 0.18;
  const strokeW = Math.max(4, Math.round(size * 0.11));

  const innerBackground = flat ? "transparent" : "rgba(255,255,255,0.96)";
  const strokeAColor = flat ? "rgba(255,255,255,0.92)" : "#1C66F2";
  const strokeBColor = flat ? "rgba(255,255,255,0.78)" : "#17C7A3";
  const dotColor = flat ? "rgba(255,255,255,0.9)" : "#F45BA5";

  return (
    <LinearGradient
      colors={["#6E56F8", "#1C66F2", "#17C7A3"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.shell, { width: size, height: size, borderRadius: size / 2 }]}>
      <View style={[styles.inner, { width: inner, height: inner, borderRadius: inner / 2, backgroundColor: innerBackground }]}>
        <View style={[styles.strokeA, { width: inner * 0.72, height: strokeW, borderRadius: strokeW / 2, backgroundColor: strokeAColor }]} />
        <View style={[styles.strokeB, { width: inner * 0.5, height: strokeW, borderRadius: strokeW / 2, backgroundColor: strokeBColor }]} />
        <View style={[styles.dot, { width: dot, height: dot, borderRadius: dot / 2, backgroundColor: dotColor }]} />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  shell: {
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#153B86",
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  inner: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  strokeA: {
    position: "absolute",
    top: "39%",
    transform: [{ rotate: "-18deg" }],
  },
  strokeB: {
    position: "absolute",
    top: "58%",
    left: "30%",
    transform: [{ rotate: "-18deg" }],
  },
  dot: {
    position: "absolute",
    right: "23%",
    top: "24%",
  },
});