import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";

export default function ResetPasswordScreen() {
  const colors = useColors();
  const { resetPassword } = useAuth();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!token) { setError("This reset link is invalid. Request a new one from the sign-in screen."); return; }
    if (password.length < 6) { setError("Your new password must be at least 6 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }

    setSaving(true);
    setError("");
    try {
      await resetPassword(token, password);
      Alert.alert("Password updated", "Your password has been changed. Please sign in with your new password.", [
        { text: "Sign in", onPress: () => router.replace("/") },
      ]);
    } catch (e: any) {
      setError(e?.message || "Could not reset password. Request a new link and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={[styles.root, { backgroundColor: colors.background }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.foreground }]}>Choose a new password</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Use at least 6 characters. For your security, this signs out any other sessions on your account.</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
          placeholder="New password"
          placeholderTextColor={colors.mutedForeground}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoFocus
        />
        <TextInput
          style={[styles.input, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
          placeholder="Confirm new password"
          placeholderTextColor={colors.mutedForeground}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          onSubmitEditing={submit}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <TouchableOpacity style={[styles.button, { backgroundColor: colors.primary }, saving && styles.disabled]} onPress={submit} disabled={saving}>
          <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>{saving ? "Updating…" : "Update password"}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.replace("/")} style={styles.cancel}>
          <Text style={[styles.cancelText, { color: colors.primary }]}>Back to sign in</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "center", padding: 24 },
  content: { gap: 14 },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  subtitle: { fontSize: 15, lineHeight: 22, marginBottom: 12, fontFamily: "Inter_400Regular" },
  input: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, fontFamily: "Inter_400Regular" },
  error: { color: "#C0392B", fontSize: 14, lineHeight: 20, fontFamily: "Inter_400Regular" },
  button: { borderRadius: 14, paddingVertical: 15, alignItems: "center", marginTop: 8 },
  buttonText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  disabled: { opacity: 0.6 },
  cancel: { alignItems: "center", paddingVertical: 10 },
  cancelText: { fontSize: 14, fontFamily: "Inter_500Medium" },
});
