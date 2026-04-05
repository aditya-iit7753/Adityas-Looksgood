import { ActivityIndicator, Pressable, SafeAreaView, Text, TextInput, useWindowDimensions, View } from "react-native";
import { colors, fonts, radius } from "./theme";

function useCompactLayout() {
  const { height, width } = useWindowDimensions();
  return height < 740 || width < 360;
}

export function Screen({ children, padded = true }) {
  const compact = useCompactLayout();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, padding: padded ? (compact ? 14 : 18) : 0 }}>{children}</View>
    </SafeAreaView>
  );
}

export function Card({ children, style }) {
  const compact = useCompactLayout();
  return (
    <View
      style={[
        {
          backgroundColor: colors.card,
          borderRadius: compact ? radius.md : radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          padding: compact ? 12 : 14,
          gap: compact ? 8 : 10,
          shadowColor: "#000000",
          shadowOpacity: 0.06,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 1,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

export function Title({ children, size = 32 }) {
  const compact = useCompactLayout();
  const resolvedSize = compact ? Math.max(20, size - 4) : size;
  return <Text style={{ fontSize: resolvedSize, color: colors.text, fontFamily: fonts.display, fontWeight: "800" }}>{children}</Text>;
}

export function BodyText({ children, style }) {
  const compact = useCompactLayout();
  return (
    <Text style={[{ color: colors.subtext, fontFamily: fonts.body, fontSize: compact ? 13 : 14, lineHeight: compact ? 18 : 20 }, style]}>
      {children}
    </Text>
  );
}

export function Input({ value, onChangeText, placeholder, secureTextEntry, keyboardType, autoCapitalize = "none" }) {
  const compact = useCompactLayout();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      autoCapitalize={autoCapitalize}
      keyboardType={keyboardType}
      placeholder={placeholder}
      placeholderTextColor={colors.subtext}
      secureTextEntry={secureTextEntry}
      style={{
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        paddingHorizontal: 12,
        paddingVertical: compact ? 10 : 11,
        color: colors.text,
        backgroundColor: colors.card,
        fontFamily: fonts.body,
      }}
    />
  );
}

export function PrimaryButton({ title, onPress, disabled, loading }) {
  const compact = useCompactLayout();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={{
        backgroundColor: disabled || loading ? "#BDBDBD" : colors.primary,
        borderRadius: radius.md,
        paddingVertical: compact ? 11 : 12,
        alignItems: "center",
      }}>
      {loading ? <ActivityIndicator color={colors.bg} /> : <Text style={{ color: colors.bg, fontWeight: "800", fontFamily: fonts.body }}>{title}</Text>}
    </Pressable>
  );
}

export function SecondaryButton({ title, onPress, disabled }) {
  const compact = useCompactLayout();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        backgroundColor: disabled ? "#BDBDBD" : colors.text,
        borderRadius: radius.md,
        paddingVertical: compact ? 11 : 12,
        alignItems: "center",
      }}>
      <Text style={{ color: colors.bg, fontWeight: "800", fontFamily: fonts.body }}>{title}</Text>
    </Pressable>
  );
}

export function Chip({ children, color = colors.primary, bg = colors.chip }) {
  const compact = useCompactLayout();
  return (
    <View style={{ alignSelf: "flex-start", backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: compact ? 10 : 12, paddingVertical: compact ? 5 : 6 }}>
      <Text style={{ color, fontWeight: "700", fontFamily: fonts.body, fontSize: compact ? 11 : 12 }}>{children}</Text>
    </View>
  );
}
