import { ScrollView, StyleSheet, Text, View } from "react-native";
import {
  AudioLines,
  Image as ImageIcon,
  MapPin,
  Mic2,
  UsersRound,
} from "lucide-react-native";

const collections = [
  {
    name: "Characters",
    detail: "Character bibles & portraits",
    count: "02",
    Icon: UsersRound,
    tint: "#d5f36a",
  },
  {
    name: "Locations",
    detail: "Sets, worlds & environments",
    count: "04",
    Icon: MapPin,
    tint: "#84d4bf",
  },
  {
    name: "Images",
    detail: "Frames, posters & references",
    count: "12",
    Icon: ImageIcon,
    tint: "#e9a885",
  },
  {
    name: "Voices & audio",
    detail: "Dialogue, music & sound",
    count: "06",
    Icon: AudioLines,
    tint: "#b3a6ff",
  },
  {
    name: "Voice studio",
    detail: "Narrators & character voices",
    count: "—",
    Icon: Mic2,
    tint: "#83c5ea",
  },
];

export default function AssetsScreen() {
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>CREATIVE LIBRARY</Text>
      <Text style={styles.title}>Assets</Text>
      <Text style={styles.subtitle}>
        A consistent visual world, assembled across your films.
      </Text>
      <View style={styles.banner}>
        <Text style={styles.bannerOverline}>YOUR CREATIVE DNA</Text>
        <Text style={styles.bannerTitle}>One world.{"\n"}Every frame.</Text>
        <View style={styles.swatches}>
          <View style={[styles.swatch, { backgroundColor: "#d5f36a" }]} />
          <View style={[styles.swatch, { backgroundColor: "#84d4bf" }]} />
          <View style={[styles.swatch, { backgroundColor: "#e9a885" }]} />
          <View style={[styles.swatch, { backgroundColor: "#b3a6ff" }]} />
        </View>
      </View>
      <Text style={styles.section}>LIBRARY</Text>
      {collections.map(({ name, detail, count, Icon, tint }) => (
        <View key={name} style={styles.row}>
          <View style={[styles.icon, { backgroundColor: `${tint}18` }]}>
            <Icon color={tint} size={18} />
          </View>
          <View style={styles.text}>
            <Text style={styles.name}>{name}</Text>
            <Text style={styles.detail}>{detail}</Text>
          </View>
          <Text style={styles.count}>{count}</Text>
        </View>
      ))}
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
  subtitle: {
    color: "#9b9f97",
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    marginTop: 5,
  },
  banner: {
    height: 180,
    marginTop: 22,
    padding: 18,
    backgroundColor: "#242e27",
    borderRadius: 6,
    overflow: "hidden",
    justifyContent: "space-between",
  },
  bannerOverline: {
    color: "#b6c0b1",
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 8,
    letterSpacing: 1.2,
  },
  bannerTitle: {
    color: "#f2f0e7",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 25,
    lineHeight: 27,
  },
  swatches: { flexDirection: "row", gap: 6 },
  swatch: { width: 19, height: 19, borderRadius: 10 },
  section: {
    color: "#777f75",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 8,
    letterSpacing: 1.2,
    marginTop: 27,
    marginBottom: 8,
  },
  row: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#2b312b",
  },
  icon: {
    width: 37,
    height: 37,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 5,
  },
  text: { flex: 1 },
  name: {
    color: "#f0efe8",
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 12,
  },
  detail: {
    color: "#989e94",
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 10,
    marginTop: 3,
  },
  count: {
    color: "#b2b8ac",
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 11,
  },
});
