import { useCallback, useEffect, useState } from "react";
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
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  AudioLines,
  Check,
  Mic2,
  Play,
  Sparkles,
} from "lucide-react-native";
import { apiRequest } from "@/lib/api";
import { completeLocalDemoStep } from "@/lib/demo";
import {
  getLocalProjects,
  saveLocalProject,
  type LocalProject,
} from "@/lib/storage";

const languages = [
  "Vietnamese",
  "English",
  "Chinese",
  "Japanese",
  "Korean",
  "Spanish",
  "French",
  "German",
  "Portuguese",
  "Thai",
  "Indonesian",
  "Hindi",
  "Arabic",
];
const accents = [
  "Neutral",
  "Northern",
  "Southern",
  "British",
  "American",
  "Australian",
  "Latin American",
];
const emotions = ["Neutral", "Warm", "Hopeful", "Tense", "Sad", "Excited"];

export default function VoiceStudioScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<LocalProject | null>(null);
  const [voice, setVoice] = useState("Narrator");
  const [language, setLanguage] = useState("English");
  const [accent, setAccent] = useState("Neutral");
  const [emotion, setEmotion] = useState("Warm");
  const [speed, setSpeed] = useState(1);
  const [text, setText] = useState("Tomorrow could still be written.");
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    async () =>
      setProject(
        (await getLocalProjects()).find((item) => item.id === id) ?? null,
      ),
    [id],
  );
  useEffect(() => {
    void load();
  }, [load]);

  async function generate(kind: "dialogue" | "narration") {
    if (!text.trim()) {
      Alert.alert(
        "Add a line first",
        "Enter the dialogue or narration to turn into a voice clip.",
      );
      return;
    }
    Alert.alert(
      "Generation estimate",
      "This request uses about 3 credits per 1,000 characters. Continue?",
      [
        { text: "Not now", style: "cancel" },
        {
          text: "Generate",
          onPress: () => {
            void runGeneration(kind);
          },
        },
      ],
    );
  }

  async function runGeneration(kind: "dialogue" | "narration") {
    setBusy(true);
    try {
      if (id.startsWith("demo-")) {
        const updated = await completeLocalDemoStep(id, "voice");
        if (updated) {
          const next = {
            ...updated,
            voiceAssets: [
              {
                id: `voice-${Date.now()}`,
                name: `${voice} · ${kind} · ${language}`,
                provider: "Storyflix Demo Voice",
                demo: true as const,
              },
            ],
          };
          await saveLocalProject(next);
          setProject(next);
        }
        Alert.alert(
          "Demo voice ready",
          "This demo uses a clearly labeled silent audio placeholder; it is not a generated voice recording.",
        );
      } else {
        const result = await apiRequest<{
          job: { id: string };
          estimatedCredits: number;
          balance: number;
        }>(`/v1/projects/${id}/voice`, {
          method: "POST",
          body: JSON.stringify({
            voice,
            language,
            accent,
            emotion: emotion.toLowerCase(),
            speed,
            text,
            kind,
          }),
        });
        Alert.alert(
          "Voice job queued",
          `Job ${result.job.id} is running in the background. ${result.estimatedCredits} credits reserved; ${result.balance} remain.`,
        );
      }
    } catch (error) {
      Alert.alert(
        "Voice generation failed",
        error instanceof Error ? error.message : "Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function assignVoice(characterId: string, name: string) {
    if (!project?.characters) return;
    const characters = project.characters.map((character) =>
      character.id === characterId
        ? { ...character, voice: name, accent }
        : character,
    );
    const next = { ...project, characters };
    setProject(next);
    await saveLocalProject(next);
    if (!id.startsWith("demo-"))
      await apiRequest(`/v1/projects/${id}/characters/${characterId}`, {
        method: "PATCH",
        body: JSON.stringify({ voice: name, accent }),
      }).catch(() => undefined);
  }

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <ArrowLeft size={19} color="#ecebe3" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>VOICE & PERFORMANCE</Text>
          <Text style={styles.title}>Voice studio</Text>
        </View>
        <View style={styles.mode}>
          <View style={styles.dot} />
          <Text style={styles.modeText}>DEMO</Text>
        </View>
      </View>
      <Text style={styles.project}>{project?.title ?? "Loading project"}</Text>
      <View style={styles.voiceCard}>
        <View style={styles.voiceIcon}>
          <Mic2 color="#d5f36a" size={19} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.voiceName}>{voice}</Text>
          <Text style={styles.voiceMeta}>
            {language} · {accent} · {emotion}
          </Text>
        </View>
        <Pressable style={styles.play}>
          <Play size={13} color="#151910" fill="#151910" />
        </Pressable>
      </View>
      <Text style={styles.label}>VOICE TYPE</Text>
      <View style={styles.chips}>
        {["Narrator", "Character", "Male", "Female"].map((item) => (
          <Pressable
            key={item}
            onPress={() => setVoice(item)}
            style={[styles.chip, voice === item && styles.activeChip]}
          >
            <Text
              style={[styles.chipText, voice === item && styles.activeText]}
            >
              {item}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>LANGUAGE</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {languages.map((item) => (
          <Pressable
            key={item}
            onPress={() => setLanguage(item)}
            style={[styles.chip, language === item && styles.activeChip]}
          >
            <Text
              style={[styles.chipText, language === item && styles.activeText]}
            >
              {item}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <Text style={styles.label}>ACCENT</Text>
      <View style={styles.chips}>
        {accents.map((item) => (
          <Pressable
            key={item}
            onPress={() => setAccent(item)}
            style={[styles.chip, accent === item && styles.activeChip]}
          >
            <Text
              style={[styles.chipText, accent === item && styles.activeText]}
            >
              {item}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>EMOTION</Text>
      <View style={styles.chips}>
        {emotions.map((item) => (
          <Pressable
            key={item}
            onPress={() => setEmotion(item)}
            style={[styles.chip, emotion === item && styles.activeChip]}
          >
            <Text
              style={[styles.chipText, emotion === item && styles.activeText]}
            >
              {item}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.speedHeader}>
        <Text style={styles.label}>SPEAKING SPEED</Text>
        <Text style={styles.speed}>{speed.toFixed(1)}×</Text>
      </View>
      <View style={styles.speedRow}>
        <Pressable
          onPress={() => setSpeed((current) => Math.max(0.5, current - 0.1))}
          style={styles.speedButton}
        >
          <Text style={styles.speedSymbol}>−</Text>
        </Pressable>
        <View style={styles.speedRail}>
          <View
            style={[
              styles.speedFill,
              { width: `${((speed - 0.5) / 1.5) * 100}%` },
            ]}
          />
        </View>
        <Pressable
          onPress={() => setSpeed((current) => Math.min(2, current + 0.1))}
          style={styles.speedButton}
        >
          <Text style={styles.speedSymbol}>+</Text>
        </Pressable>
      </View>
      <Text style={[styles.label, { marginTop: 20 }]}>
        DIALOGUE OR NARRATION
      </Text>
      <TextInput
        value={text}
        onChangeText={setText}
        multiline
        textAlignVertical="top"
        style={styles.textInput}
        placeholder="Write the words to perform..."
        placeholderTextColor="#777f75"
      />
      <View style={styles.actions}>
        <Pressable
          style={styles.primary}
          onPress={() => void generate("dialogue")}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#151910" />
          ) : (
            <>
              <AudioLines size={15} color="#151910" />
              <Text style={styles.primaryText}>Generate dialogue</Text>
            </>
          )}
        </Pressable>
        <Pressable
          style={styles.secondary}
          onPress={() => void generate("narration")}
          disabled={busy}
        >
          <Sparkles size={14} color="#d5f36a" />
          <Text style={styles.secondaryText}>Narration</Text>
        </Pressable>
      </View>
      {(project?.characters ?? []).length > 0 && (
        <>
          <Text style={[styles.label, { marginTop: 25 }]}>
            CHARACTER VOICES
          </Text>
          {project?.characters?.map((character) => (
            <View key={character.id} style={styles.character}>
              <View style={{ flex: 1 }}>
                <Text style={styles.characterName}>{character.name}</Text>
                <Text style={styles.characterVoice}>
                  {character.voice || "No voice assigned"} ·{" "}
                  {character.accent || "Neutral"}
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  setVoice(character.name);
                  void assignVoice(character.id, character.name);
                }}
                style={styles.assign}
              >
                <Text style={styles.assignText}>
                  {character.voice ? "Assigned" : "Assign"}
                </Text>
              </Pressable>
            </View>
          ))}
        </>
      )}
      <Text style={styles.notice}>
        <Check size={11} color="#8f9c7d" /> Demo Mode uses only clearly labeled,
        non-generated audio samples.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#101310" },
  content: { padding: 19, paddingTop: 20, paddingBottom: 40 },
  header: { flexDirection: "row", alignItems: "center", gap: 11 },
  eyebrow: {
    color: "#d5f36a",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 8,
    letterSpacing: 1,
  },
  title: {
    color: "#f0efe7",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 20,
    marginTop: 2,
  },
  mode: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#202719",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 3,
  },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#d5f36a" },
  modeText: {
    color: "#d5f36a",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 7,
  },
  project: {
    color: "#969d92",
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 9,
    marginTop: 12,
  },
  voiceCard: {
    minHeight: 67,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
    marginBottom: 21,
    padding: 11,
    backgroundColor: "#1b211a",
    borderWidth: 1,
    borderColor: "#30392c",
    borderRadius: 5,
  },
  voiceIcon: {
    width: 37,
    height: 37,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#293123",
    borderRadius: 4,
  },
  voiceName: {
    color: "#f0efe7",
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 11,
  },
  voiceMeta: {
    color: "#a5ac9f",
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 8,
    marginTop: 4,
  },
  play: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#d5f36a",
    borderRadius: 15,
  },
  label: {
    color: "#bbc2b4",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 8,
    letterSpacing: 0.9,
    marginBottom: 7,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 17 },
  chip: {
    paddingHorizontal: 9,
    paddingVertical: 7,
    backgroundColor: "#191e19",
    borderWidth: 1,
    borderColor: "#30372e",
    borderRadius: 3,
  },
  activeChip: { backgroundColor: "#d5f36a", borderColor: "#d5f36a" },
  chipText: {
    color: "#adb4a7",
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 8,
  },
  activeText: { color: "#151910" },
  speedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  speed: { color: "#d5f36a", fontFamily: "SpaceGrotesk_700Bold", fontSize: 10 },
  speedRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  speedButton: {
    width: 29,
    height: 29,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#222821",
    borderRadius: 4,
  },
  speedSymbol: {
    color: "#e3e5dc",
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 15,
  },
  speedRail: {
    flex: 1,
    height: 4,
    backgroundColor: "#353c32",
    borderRadius: 2,
  },
  speedFill: { height: 4, backgroundColor: "#d5f36a", borderRadius: 2 },
  textInput: {
    minHeight: 98,
    color: "#eeede5",
    backgroundColor: "#191e19",
    borderWidth: 1,
    borderColor: "#2d342c",
    borderRadius: 4,
    padding: 11,
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    lineHeight: 17,
  },
  actions: { flexDirection: "row", gap: 7, marginTop: 9 },
  primary: {
    flex: 1,
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#d5f36a",
    borderRadius: 4,
  },
  primaryText: {
    color: "#151910",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 9,
  },
  secondary: {
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: "#394131",
    borderRadius: 4,
  },
  secondaryText: {
    color: "#d5f36a",
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 9,
  },
  character: {
    minHeight: 51,
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderColor: "#2c322b",
  },
  characterName: {
    color: "#e9e9e1",
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 10,
  },
  characterVoice: {
    color: "#949b90",
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 8,
    marginTop: 3,
  },
  assign: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: "#222820",
    borderRadius: 3,
  },
  assignText: {
    color: "#d5f36a",
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 8,
  },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    color: "#838b7d",
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 8,
    marginTop: 20,
  },
});
