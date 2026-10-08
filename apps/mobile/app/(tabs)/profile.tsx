import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import {
  ArrowUpRight,
  BadgeCheck,
  CreditCard,
  Globe2,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react-native";
import { apiRequest } from "@/lib/api";

interface CreditAccount {
  balance: number;
  plan: "FREE" | "PRO";
  limits: { creditsMonthly: number; projects: number; maxResolution: string; watermark: boolean };
}

const items = [
  {
    title: "Studio preferences",
    sub: "Language, style & notifications",
    Icon: Settings2,
  },
  {
    title: "Connected accounts",
    sub: "Publishing permissions & OAuth",
    Icon: Globe2,
  },
  {
    title: "Privacy & security",
    sub: "Sign-in and data controls",
    Icon: ShieldCheck,
  },
  {
    title: "Billing & credits",
    sub: "Plan, invoices & usage history",
    Icon: CreditCard,
  },
];

export default function ProfileScreen() {
  const router = useRouter();
  const [account, setAccount] = useState<CreditAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useFocusEffect(useCallback(() => {
    setLoading(true);
    void apiRequest<CreditAccount>("/v1/credits")
      .then((result) => { setAccount(result); setError(""); })
      .catch((cause: unknown) => { setAccount(null); setError(cause instanceof Error ? cause.message : "Connect the Cineforge API to load account usage."); })
      .finally(() => setLoading(false));
  }, []));
  const limit = account?.limits.creditsMonthly ?? 0;
  const creditPercent = limit ? Math.min(100, Math.max(0, (account?.balance ?? 0) / limit * 100)) : 0;
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>YOUR STUDIO</Text>
      <Text style={styles.title}>Profile</Text>
      <View style={styles.identity}>
        <View style={styles.avatar}>
          <UserRound color="#d5f36a" size={24} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>Filmmaker account</Text>
          <Text style={styles.email}>{account ? `${account.plan} plan · server account` : "Working locally · account API unavailable"}</Text>
        </View>
        <BadgeCheck size={18} color="#d5f36a" />
      </View>
      <View style={styles.plan}>
        <View style={styles.planTop}>
          <View>
            <Text style={styles.planLabel}>CURRENT PLAN</Text>
            <Text style={styles.planName}>
              {account?.plan ?? "Free"} <Text style={styles.planNote}>{account ? `· ${account.limits.maxResolution}` : "· connect API for usage"}</Text>
            </Text>
          </View>
          <Sparkles size={20} color="#d5f36a" />
        </View>
        <View style={styles.creditsRow}>
          <Text style={styles.creditsText}>Studio credits</Text>
          <Text style={styles.creditsValue}>
            {loading ? "…" : account?.balance ?? "—"} <Text style={styles.creditsTotal}>{account ? `/ ${limit}` : "credits unavailable"}</Text>
          </Text>
        </View>
        <View style={styles.progress}>
          <View style={[styles.progressFill, { width: `${creditPercent}%` }]} />
        </View>
        <Pressable style={styles.upgrade} onPress={() => router.push("/(tabs)/settings")}>
          <Text style={styles.upgradeText}>Explore Pro</Text>
          <ArrowUpRight size={14} color="#151910" />
        </Pressable>
      </View>
      {loading ? <ActivityIndicator style={{ marginTop: 9 }} size="small" color="#d5f36a" /> : error ? <Text style={styles.accountError}>{error}</Text> : null}
      <Text style={styles.section}>ACCOUNT</Text>
      {items.map(({ title, sub, Icon }) => (
        <Pressable key={title} style={styles.row} onPress={() => router.push(title === "Privacy & security" ? "/auth" : "/(tabs)/settings")}>
          <Icon color="#b3b9ac" size={17} />
          <View style={{ flex: 1 }}>
            <Text style={styles.itemTitle}>{title}</Text>
            <Text style={styles.itemSub}>{sub}</Text>
          </View>
          <ArrowUpRight size={14} color="#737a70" />
        </Pressable>
      ))}
      <Text style={styles.version}>
        CINEFORGE AI · VERSION 1.0.0{"\n"}{account ? "ACCOUNT CONNECTED" : "LOCAL MODE"}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#101310" },
  content: { padding: 22, paddingTop: 28, paddingBottom: 35 },
  eyebrow: {
    color: "#d5f36a",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 9,
    letterSpacing: 1.2,
  },
  title: {
    color: "#f3f2eb",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 32,
    marginTop: 5,
  },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 24,
    paddingVertical: 15,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#2b312b",
  },
  avatar: {
    width: 43,
    height: 43,
    borderRadius: 22,
    backgroundColor: "#293023",
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    color: "#f1f0e9",
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 13,
  },
  email: {
    color: "#959c91",
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 10,
    marginTop: 4,
  },
  plan: {
    marginTop: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#3b4433",
    borderRadius: 6,
    backgroundColor: "#191e19",
  },
  planTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  planLabel: {
    color: "#969d8f",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 8,
    letterSpacing: 1,
  },
  planName: {
    color: "#f3f2eb",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 21,
    marginTop: 5,
  },
  planNote: {
    color: "#9a9f96",
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 10,
  },
  accountError: { color: "#aa9984", fontFamily: "SpaceGrotesk_400Regular", fontSize: 8, lineHeight: 13, marginTop: 8 },
  creditsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 17,
  },
  creditsText: {
    color: "#b9beb3",
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 10,
  },
  creditsValue: {
    color: "#f1f0e9",
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 10,
  },
  creditsTotal: { color: "#8d9489", fontFamily: "SpaceGrotesk_400Regular" },
  progress: {
    height: 4,
    backgroundColor: "#343a31",
    borderRadius: 2,
    marginTop: 8,
  },
  progressFill: {
    width: "60%",
    height: 4,
    backgroundColor: "#d5f36a",
    borderRadius: 2,
  },
  upgrade: {
    height: 36,
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#d5f36a",
    borderRadius: 4,
  },
  upgradeText: {
    color: "#151910",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 10,
  },
  section: {
    color: "#777f75",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 8,
    letterSpacing: 1.2,
    marginTop: 27,
    marginBottom: 8,
  },
  row: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#2b312b",
  },
  itemTitle: {
    color: "#e9e8e1",
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 11,
  },
  itemSub: {
    color: "#92988e",
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 9,
    marginTop: 3,
  },
  version: {
    textAlign: "center",
    color: "#646b62",
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 8,
    lineHeight: 15,
    letterSpacing: 0.8,
    marginTop: 24,
  },
});
