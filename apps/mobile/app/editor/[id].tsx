import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  Clapperboard,
  Copy,
  Music2,
  Play,
  Scissors,
  Subtitles,
  Trash2,
  Volume2,
} from "lucide-react-native";

const tracks = [
  {
    name: "VIDEO",
    color: "#d5f36a",
    Icon: Clapperboard,
    clips: ["OPENING SHOT", "THE DISCOVERY", "NIGHT SEQUENCE"],
  },
  {
    name: "VOICE",
    color: "#83d3bd",
    Icon: Volume2,
    clips: ["NARRATION · EN", "DIALOGUE"],
  },
  { name: "MUSIC", color: "#e9a885", Icon: Music2, clips: ["ORIGINAL SCORE"] },
  {
    name: "SFX",
    color: "#b3a6ff",
    Icon: Scissors,
    clips: ["AMBIENCE", "TRANSITION"],
  },
  {
    name: "SUBTITLES",
    color: "#84c5ea",
    Icon: Subtitles,
    clips: ["CAPTIONS · EN"],
  },
];

export default function EditorScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState("OPENING SHOT");
  const [clips, setClips] = useState(tracks);
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <ArrowLeft size={19} color="#edece4" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>CINEFORGE EDIT</Text>
          <Text style={styles.title}>Film timeline</Text>
        </View>
        <Pressable style={styles.export} onPress={() => setPlaying(false)}>
          <Text style={styles.exportText}>Export</Text>
        </Pressable>
      </View>
      <View style={styles.preview}>
        <View style={styles.previewTop}>
          <Text style={styles.previewLabel}>PREVIEW · 00:12 / 01:00</Text>
          <Text style={styles.previewFormat}>16:9</Text>
        </View>
        <View style={styles.previewCenter}>
          <View style={styles.playButton}>
            <Play size={21} color="#151910" fill="#151910" />
          </View>
          <Text style={styles.previewName}>THE LIGHTHOUSE</Text>
          <Text style={styles.previewSub}>DEMO RENDER · 1080P PREVIEW</Text>
        </View>
      </View>
      <View style={styles.controls}>
        <Pressable
          onPress={() => setPlaying(!playing)}
          style={styles.playControl}
        >
          <Play size={14} color="#151910" fill="#151910" />
          <Text style={styles.controlText}>{playing ? "Pause" : "Play"}</Text>
        </Pressable>
        <Text style={styles.time}>00:12:04</Text>
        <View style={styles.toolGroup}>
          <Pressable
            onPress={() => setSelected("THE DISCOVERY")}
            style={styles.tool}
          >
            <Scissors size={15} color="#c3c9bb" />
          </Pressable>
          <Pressable
            onPress={() =>
              setClips((list) =>
                list.map((track) =>
                  track.name === "VIDEO"
                    ? { ...track, clips: [...track.clips, "NEW CLIP"] }
                    : track,
                ),
              )
            }
            style={styles.tool}
          >
            <Copy size={15} color="#c3c9bb" />
          </Pressable>
          <Pressable
            onPress={() =>
              setClips((list) =>
                list.map((track) =>
                  track.name === "VIDEO"
                    ? { ...track, clips: track.clips.slice(0, -1) }
                    : track,
                ),
              )
            }
            style={styles.tool}
          >
            <Trash2 size={15} color="#c3c9bb" />
          </Pressable>
        </View>
      </View>
      <View style={styles.ruler}>
        <Text style={styles.rulerLabel}>00:00</Text>
        <Text style={styles.rulerLabel}>00:15</Text>
        <Text style={styles.rulerLabel}>00:30</Text>
        <Text style={styles.rulerLabel}>00:45</Text>
        <Text style={styles.rulerLabel}>01:00</Text>
      </View>
      {clips.map(({ name, color, Icon, clips: items }) => (
        <View key={name} style={styles.track}>
          <View style={styles.trackLabel}>
            <Icon size={13} color={color} />
            <Text style={styles.trackName}>{name}</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.clipRow}
          >
            {items.map((clip, index) => (
              <Pressable
                key={`${clip}-${index}`}
                onPress={() => setSelected(clip)}
                style={[
                  styles.clip,
                  { borderColor: `${color}55`, backgroundColor: `${color}17` },
                  selected === clip && { borderColor: color },
                ]}
              >
                <View style={[styles.clipStripe, { backgroundColor: color }]} />
                <Text style={[styles.clipName, { color }]}>{clip}</Text>
                <Text style={styles.clipLength}>
                  {index ? "00:08" : "00:12"}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ))}
      <View style={styles.notice}>
        <Text style={styles.noticeText}>
          Autosaved to this device · {id?.slice(0, 12)}
        </Text>
      </View>
      <Pressable style={styles.render} onPress={() => setPlaying(false)}>
        <Clapperboard size={15} color="#151910" />
        <Text style={styles.renderText}>Render film</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#101310" },
  content: { padding: 18, paddingTop: 21, paddingBottom: 35 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 18,
  },
  eyebrow: {
    color: "#d5f36a",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 8,
    letterSpacing: 1,
  },
  title: {
    color: "#f1f0e9",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 20,
    marginTop: 2,
  },
  export: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    backgroundColor: "#d5f36a",
    borderRadius: 4,
  },
  exportText: {
    color: "#151910",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 10,
  },
  preview: {
    aspectRatio: 16 / 9,
    backgroundColor: "#222b25",
    borderRadius: 5,
    padding: 11,
    justifyContent: "space-between",
    overflow: "hidden",
  },
  previewTop: { flexDirection: "row", justifyContent: "space-between" },
  previewLabel: {
    color: "#c1c8ba",
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 8,
    letterSpacing: 0.6,
  },
  previewFormat: {
    color: "#c1c8ba",
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 8,
  },
  previewCenter: { alignItems: "center" },
  playButton: {
    width: 42,
    height: 42,
    borderRadius: 22,
    backgroundColor: "#d5f36a",
    alignItems: "center",
    justifyContent: "center",
  },
  previewName: {
    color: "#e5e9de",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 10,
    letterSpacing: 1.4,
    marginTop: 9,
  },
  previewSub: {
    color: "#9ca597",
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 7,
    letterSpacing: 0.8,
    marginTop: 3,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderColor: "#2c332b",
  },
  playControl: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#d5f36a",
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 3,
  },
  controlText: {
    color: "#151910",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 9,
  },
  time: {
    color: "#c2c7bc",
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 9,
  },
  toolGroup: { flexDirection: "row", gap: 3, marginLeft: "auto" },
  tool: {
    width: 31,
    height: 31,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1b201b",
    borderRadius: 4,
  },
  ruler: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 3,
  },
  rulerLabel: {
    color: "#71796f",
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 7,
  },
  track: {
    borderTopWidth: 1,
    borderColor: "#252c25",
    paddingTop: 7,
    paddingBottom: 5,
  },
  trackLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  trackName: {
    color: "#b9bfb3",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 8,
    letterSpacing: 0.7,
  },
  clipRow: { gap: 7, paddingBottom: 2 },
  clip: {
    width: 115,
    height: 43,
    borderWidth: 1,
    borderRadius: 3,
    paddingLeft: 8,
    paddingTop: 6,
    overflow: "hidden",
  },
  clipStripe: { position: "absolute", top: 0, bottom: 0, left: 0, width: 3 },
  clipName: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 7,
    letterSpacing: 0.3,
  },
  clipLength: {
    color: "#8f978a",
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 7,
    marginTop: 4,
  },
  notice: { marginTop: 14, alignItems: "center" },
  noticeText: {
    color: "#737a70",
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 8,
  },
  render: {
    marginTop: 13,
    height: 42,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#d5f36a",
    borderRadius: 4,
  },
  renderText: {
    color: "#151910",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 11,
  },
});
