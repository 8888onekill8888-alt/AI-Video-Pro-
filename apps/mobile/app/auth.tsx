import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import {
  ArrowLeft,
  Clapperboard,
  KeyRound,
  Mail,
  ShieldCheck,
  UserRound,
} from "lucide-react-native";
import { apiRequest } from "@/lib/api";

WebBrowser.maybeCompleteAuthSession();

type AuthMode = "login" | "register" | "forgot" | "reset";
interface AuthResponse {
  access_token?: string;
  refresh_token?: string;
  user?: { id: string; email?: string };
}

export default function AuthScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [oauthBusy, setOauthBusy] = useState("");
  const isReset = mode === "reset";
  const title =
    mode === "login"
      ? "Welcome back."
      : mode === "register"
        ? "Make something unforgettable."
        : mode === "forgot"
          ? "A fresh start."
          : "Set a new password.";

  async function submit() {
    setBusy(true);
    try {
      if (mode === "forgot") {
        await apiRequest("/v1/auth/forgot-password", {
          method: "POST",
          body: JSON.stringify({ email }),
        });
        Alert.alert(
          "Check your inbox",
          "If the email belongs to an account, a reset link has been sent.",
        );
      } else if (mode === "reset") {
        await apiRequest("/v1/auth/reset-password", {
          method: "POST",
          body: JSON.stringify({ accessToken, password }),
        });
        Alert.alert("Password updated", "Sign in with your new password.");
        setMode("login");
        setPassword("");
      } else {
        const result = await apiRequest<AuthResponse>(`/v1/auth/${mode}`, {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
        if (result.access_token) {
          await SecureStore.setItemAsync(
            "storyflix.access-token",
            result.access_token,
          );
          if (result.refresh_token)
            await SecureStore.setItemAsync(
              "storyflix.refresh-token",
              result.refresh_token,
            );
          router.replace("/(tabs)/profile");
        } else
          Alert.alert(
            "Check your inbox",
            "Confirm your email address to finish creating your account.",
          );
      }
    } catch (error) {
      Alert.alert(
        "Could not continue",
        error instanceof Error
          ? error.message
          : "Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function signInWithOAuth(provider: "google" | "github" | "facebook" | "apple" | "tiktok") {
    setOauthBusy(provider);
    try {
      const result = await apiRequest<{ authorizationUrl: string }>(`/v1/auth/oauth/${provider}`);
      const session = await WebBrowser.openAuthSessionAsync(result.authorizationUrl, "cineforge://auth/callback");
      if (session.type !== "success" || !session.url) return;
      const callback = new URL(session.url);
      const parameters = new URLSearchParams(callback.hash.startsWith("#") ? callback.hash.slice(1) : callback.search.slice(1));
      const accessToken = parameters.get("access_token");
      const refreshToken = parameters.get("refresh_token");
      if (!accessToken) throw new Error(parameters.get("error_description") ?? "The identity provider did not return an access token.");
      await SecureStore.setItemAsync("storyflix.access-token", accessToken);
      if (refreshToken) await SecureStore.setItemAsync("storyflix.refresh-token", refreshToken);
      router.replace("/(tabs)/profile");
    } catch (error) {
      Alert.alert("OAuth sign-in unavailable", error instanceof Error ? error.message : "Configure this provider in Supabase Auth first.");
    } finally {
      setOauthBusy("");
    }
  }

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Pressable style={styles.back} onPress={() => router.back()}>
        <ArrowLeft size={18} color="#e6e5dc" />
        <Text style={styles.backLabel}>BACK TO STUDIO</Text>
      </Pressable>
      <View style={styles.brand}>
        <View style={styles.brandIcon}>
          <Clapperboard size={19} color="#d5f36a" />
        </View>
        <Text style={styles.wordmark}>
          CINEFORGE <Text style={{ color: "#d5f36a" }}>AI</Text>
        </Text>
      </View>
      <Text style={styles.eyebrow}>YOUR FILM STUDIO</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>
        {mode === "register"
          ? "Create a secure account and keep your films in sync."
          : mode === "forgot"
            ? "We’ll send a secure password reset link if the account exists."
            : mode === "reset"
              ? "Your password is sent directly to the configured auth provider."
              : "Sign in to access your stories, projects and creative library."}
      </Text>
      {!isReset && (
        <View style={styles.field}>
          <Text style={styles.label}>EMAIL ADDRESS</Text>
          <View style={styles.inputWrap}>
            <Mail size={15} color="#92998e" />
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor="#737b70"
            />
          </View>
        </View>
      )}
      {mode === "reset" && (
        <View style={styles.field}>
          <Text style={styles.label}>PASSWORD RESET TOKEN</Text>
          <View style={styles.inputWrap}>
            <KeyRound size={15} color="#92998e" />
            <TextInput
              value={accessToken}
              onChangeText={setAccessToken}
              autoCapitalize="none"
              style={styles.input}
              placeholder="Paste the secure link token"
              placeholderTextColor="#737b70"
            />
          </View>
        </View>
      )}
      {mode !== "forgot" && (
        <View style={styles.field}>
          <Text style={styles.label}>
            {isReset ? "NEW PASSWORD" : "PASSWORD"}
          </Text>
          <View style={styles.inputWrap}>
            <ShieldCheck size={15} color="#92998e" />
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete={isReset ? "new-password" : "password"}
              style={styles.input}
              placeholder={
                isReset || mode === "register"
                  ? "At least 8 characters"
                  : "Your password"
              }
              placeholderTextColor="#737b70"
            />
          </View>
        </View>
      )}
      <Pressable
        onPress={() => void submit()}
        disabled={busy}
        style={[styles.submit, busy && { opacity: 0.65 }]}
      >
        {busy ? (
          <ActivityIndicator color="#151910" />
        ) : (
          <>
            <UserRound size={15} color="#151910" />
            <Text style={styles.submitText}>
              {mode === "login"
                ? "Sign in"
                : mode === "register"
                  ? "Create account"
                  : mode === "forgot"
                    ? "Send reset link"
                    : "Update password"}
            </Text>
          </>
        )}
      </Pressable>
      {(mode === "login" || mode === "register") && (
        <>
          <Text style={styles.orLabel}>OR CONTINUE WITH</Text>
          <View style={styles.oauthGrid}>
            {(["google", "github", "apple", "facebook", "tiktok"] as const).map((provider) => (
              <Pressable key={provider} style={styles.oauthButton} onPress={() => void signInWithOAuth(provider)} disabled={Boolean(oauthBusy || busy)}>
                {oauthBusy === provider ? <ActivityIndicator size="small" color="#d5f36a" /> : <Text style={styles.oauthText}>{provider[0]?.toUpperCase()}{provider.slice(1)}</Text>}
              </Pressable>
            ))}
          </View>
          <Text style={styles.oauthNote}>Only providers enabled and approved in your Supabase project can complete sign-in.</Text>
        </>
      )}
      {mode === "login" && (
        <Pressable style={styles.textButton} onPress={() => setMode("forgot")}>
          <Text style={styles.textButtonLabel}>Forgot password?</Text>
        </Pressable>
      )}
      {mode === "forgot" && (
        <Pressable style={styles.textButton} onPress={() => setMode("reset")}>
          <Text style={styles.textButtonLabel}>
            Have a reset token? Set a new password
          </Text>
        </Pressable>
      )}
      {mode === "login" && (
        <Pressable style={styles.switch} onPress={() => setMode("register")}>
          <Text style={styles.switchText}>
            New to the studio?{" "}
            <Text style={styles.switchStrong}>Create an account</Text>
          </Text>
        </Pressable>
      )}
      {mode !== "login" && mode !== "reset" && (
        <Pressable style={styles.switch} onPress={() => setMode("login")}>
          <Text style={styles.switchText}>
            Already have an account?{" "}
            <Text style={styles.switchStrong}>Sign in</Text>
          </Text>
        </Pressable>
      )}
      <Text style={styles.secure}>
        Authentication is handled by your configured Supabase Auth project.
        Passwords are handled only by the configured authentication provider.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#101310" },
  content: { padding: 24, paddingTop: 20, paddingBottom: 44 },
  back: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    marginBottom: 35,
  },
  backLabel: {
    color: "#a5ab9f",
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 8,
    letterSpacing: 1,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 27,
  },
  brandIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#20271a",
    borderRadius: 5,
  },
  wordmark: {
    color: "#f3f2ea",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 14,
    letterSpacing: 0.5,
  },
  eyebrow: {
    color: "#d5f36a",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 8,
    letterSpacing: 1.3,
  },
  title: {
    maxWidth: 310,
    color: "#f3f2ea",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 31,
    lineHeight: 34,
    marginTop: 8,
  },
  subtitle: {
    color: "#a1a69d",
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 9,
    marginBottom: 25,
  },
  field: { marginBottom: 15 },
  label: {
    color: "#c2c7bb",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 8,
    letterSpacing: 0.9,
    marginBottom: 6,
  },
  inputWrap: {
    height: 45,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 11,
    backgroundColor: "#191e19",
    borderWidth: 1,
    borderColor: "#2b312b",
    borderRadius: 4,
  },
  input: {
    flex: 1,
    color: "#f0efe7",
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
  },
  submit: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: "#d5f36a",
    borderRadius: 4,
    marginTop: 5,
  },
  submitText: {
    color: "#151910",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 10,
  },
  textButton: { alignSelf: "center", paddingVertical: 13 },
  orLabel: { color: "#838b7e", fontFamily: "SpaceGrotesk_700Bold", fontSize: 7, letterSpacing: 1, textAlign: "center", marginTop: 18, marginBottom: 8 },
  oauthGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  oauthButton: { width: "31%", minHeight: 37, alignItems: "center", justifyContent: "center", backgroundColor: "#191e19", borderWidth: 1, borderColor: "#343b32", borderRadius: 4 },
  oauthText: { color: "#d8dbd1", fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 9 },
  oauthNote: { color: "#777f75", fontFamily: "SpaceGrotesk_400Regular", fontSize: 8, lineHeight: 12, textAlign: "center", marginTop: 8 },
  textButtonLabel: {
    color: "#d5f36a",
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 9,
  },
  switch: {
    alignItems: "center",
    paddingVertical: 14,
    borderTopWidth: 1,
    borderColor: "#2a3029",
    marginTop: 9,
  },
  switchText: {
    color: "#a2a89e",
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 9,
  },
  switchStrong: { color: "#d5f36a", fontFamily: "SpaceGrotesk_600SemiBold" },
  secure: {
    color: "#7e867a",
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 8,
    lineHeight: 13,
    textAlign: "center",
    marginTop: 17,
  },
});
