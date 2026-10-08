import { useCallback, useEffect, useState } from "react";
import {
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
  ArrowLeftRight,
  Languages,
  Save,
  Sparkles,
} from "lucide-react-native";
import { apiRequest } from "@/lib/api";
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
const kinds = ["Story", "Screenplay", "Dialogue", "Narration", "Subtitles"];

export default function TranslationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<LocalProject | null>(null);
  const [kind, setKind] = useState("Story");
  const [language, setLanguage] = useState("Vietnamese");
  const [original, setOriginal] = useState("");
  const [translation, setTranslation] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const found =
      (await getLocalProjects()).find((item) => item.id === id) ?? null;
    setProject(found);
    if (found) {
      const text =
        kind === "Story"
          ? found.story
          : kind === "Screenplay"
            ? (found.script ?? [])
                .map(
                  (scene) =>
                    `${scene.heading}\n${scene.action}\n${scene.dialogue.map((line) => `${line.character}: ${line.line}`).join("\n")}`,
                )
                .join("\n\n")
            : kind === "Dialogue"
              ? (found.scenes ?? [])
                  .map((scene) => `${scene.sceneNumber} · ${scene.dialogue}`)
                  .filter(Boolean)
                  .join("\n\n")
              : kind === "Narration"
                ? (found.scenes ?? [])
                    .map((scene) => `${scene.sceneNumber} · ${scene.narration}`)
                    .filter(Boolean)
                    .join("\n\n")
                : (found.subtitles ?? [])
                    .map(
                      (cue) => `${cue.startMs} --> ${cue.endMs}\n${cue.text}`,
                    )
                    .join("\n\n");
      setOriginal(text);
      setTranslation(found.translations?.[`${kind}:${language}`] ?? "");
    }
  }, [id, kind, language]);
  useEffect(() => {
    void load();
  }, [load]);

  async function translate() {
    if (!original.trim() || !project) {
      Alert.alert(
        "Nothing to translate",
        "Add source text or generate a script first.",
      );
      return;
    }
    Alert.alert(
      "Translation estimate",
      "About 2 credits per 1,000 characters. Character names, scene IDs and timing are preserved. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Translate",
          onPress: () => {
            void runTranslation();
          },
        },
      ],
    );
  }

  async function runTranslation() {
    if (!project) return;
    setBusy(true);
    try {
      if (id.startsWith("demo-")) {
        setTranslation(`[DEMO PREVIEW · NOT MACHINE TRANSLATED]\n${original}`);
      } else {
        const result = await apiRequest<{ translation: string }>(
          `/v1/translate`,
          {
            method: "POST",
            body: JSON.stringify({
              text: original,
              targetLanguage: language,
              names:
                project.characters?.map((character) => character.name) ?? [],
              sceneIds: project.scenes?.map((scene) => scene.id),
            }),
          },
        );
        setTranslation(result.translation);
      }
    } catch (error) {
      Alert.alert(
        "Translation failed",
        error instanceof Error ? error.message : "Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!project) return;
    const next = {
      ...project,
      translations: {
        ...project.translations,
        [`${kind}:${language}`]: translation,
      },
      updatedAt: new Date().toISOString(),
    };
    setProject(next);
    await saveLocalProject(next);
    Alert.alert(
      "Translation saved",
      "The original text and your edited translation are preserved side by side.",
    );
  }

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <ArrowLeft size={18} color="#ecebe3" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>MULTILINGUAL WORKSPACE</Text>
          <Text style={styles.title}>Translation</Text>
        </View>
        <Languages size={18} color="#d5f36a" />
      </View>
      <Text style={styles.project}>{project?.title ?? "Loading project"}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.segment}
      >
        {kinds.map((item) => (
          <Pressable
            key={item}
            onPress={() => setKind(item)}
            style={[styles.segmentItem, kind === item && styles.segmentActive]}
          >
            <Text
              style={[
                styles.segmentText,
                kind === item && styles.segmentTextActive,
              ]}
            >
              {item}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <Text style={styles.label}>TARGET LANGUAGE</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.languageRow}
      >
        {languages.map((item) => (
          <Pressable
            key={item}
            onPress={() => setLanguage(item)}
            style={[
              styles.language,
              item === language && styles.languageActive,
            ]}
          >
            <Text
              style={[
                styles.languageText,
                item === language && styles.languageTextActive,
              ]}
            >
              {item}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.columns}>
        <View style={styles.column}>
          <View style={styles.columnHeader}>
            <Text style={styles.columnTitle}>ORIGINAL</Text>
            <Text style={styles.languageCode}>SOURCE</Text>
          </View>
          <TextInput
            value={original}
            onChangeText={setOriginal}
            multiline
            textAlignVertical="top"
            style={styles.textArea}
            placeholder="Original story or script..."
            placeholderTextColor="#747c71"
          />
        </View>
        <View style={styles.swap}>
          <ArrowLeftRight size={14} color="#d5f36a" />
        </View>
        <View style={styles.column}>
          <View style={styles.columnHeader}>
            <Text style={styles.columnTitle}>TRANSLATION</Text>
            <Text style={styles.languageCode}>{language.toUpperCase()}</Text>
          </View>
          <TextInput
            value={translation}
            onChangeText={setTranslation}
            multiline
            textAlignVertical="top"
            style={styles.textArea}
            placeholder="Your translation appears here..."
            placeholderTextColor="#747c71"
          />
        </View>
      </View>
      <View style={styles.preserve}>
        <Sparkles size={14} color="#d5f36a" />
        <Text style={styles.preserveText}>
          Names, scene IDs, speaker identities and subtitle timestamps are sent
          as protected context.
        </Text>
      </View>
      <Pressable
        style={[styles.translateButton, busy && { opacity: 0.7 }]}
        onPress={() => void translate()}
        disabled={busy}
      >
        <Languages size={15} color="#151910" />
        <Text style={styles.translateText}>
          {busy ? "Working..." : `Translate to ${language}`}
        </Text>
      </Pressable>
      <Pressable style={styles.saveButton} onPress={() => void save()}>
        <Save size={14} color="#d5f36a" />
        <Text style={styles.saveText}>Save edited translation</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#101310" },
  content: { padding: 18, paddingTop: 19, paddingBottom: 35 },
  header: { flexDirection: "row", alignItems: "center", gap: 11 },
  eyebrow: {
    color: "#d5f36a",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 8,
    letterSpacing: 1,
  },
  title: {
    color: "#f2f1e9",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 20,
    marginTop: 2,
  },
  project: {
    color: "#969d92",
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 9,
    marginTop: 11,
  },
  segment: { gap: 6, paddingVertical: 14 },
  segmentItem: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "#31382f",
    borderRadius: 3,
  },
  segmentActive: { backgroundColor: "#d5f36a", borderColor: "#d5f36a" },
  segmentText: {
    color: "#adb4a7",
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 8,
  },
  segmentTextActive: { color: "#151910" },
  label: {
    color: "#bec5b8",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 8,
    letterSpacing: 0.8,
  },
  languageRow: { gap: 6, paddingTop: 7, paddingBottom: 14 },
  language: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#30372e",
    borderRadius: 3,
    backgroundColor: "#191e19",
  },
  languageActive: { borderColor: "#d5f36a", backgroundColor: "#22291d" },
  languageText: {
    color: "#aeb5a7",
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 8,
  },
  languageTextActive: { color: "#d5f36a" },
  columns: {
    minHeight: 270,
    flexDirection: "row",
    gap: 6,
    alignItems: "stretch",
  },
  column: { flex: 1 },
  columnHeader: {
    height: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  columnTitle: {
    color: "#c6cbbf",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 7,
    letterSpacing: 0.8,
  },
  languageCode: {
    color: "#80877d",
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 6,
  },
  textArea: {
    flex: 1,
    minHeight: 245,
    color: "#e5e5dc",
    backgroundColor: "#191e19",
    borderWidth: 1,
    borderColor: "#2c322b",
    borderRadius: 4,
    padding: 8,
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 9,
    lineHeight: 14,
  },
  swap: { width: 22, alignItems: "center", justifyContent: "center" },
  preserve: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    marginTop: 14,
    padding: 10,
    backgroundColor: "#1a2116",
    borderRadius: 4,
  },
  preserveText: {
    flex: 1,
    color: "#b3bdab",
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 8,
    lineHeight: 12,
  },
  translateButton: {
    height: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 14,
    backgroundColor: "#d5f36a",
    borderRadius: 4,
  },
  translateText: {
    color: "#151910",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 10,
  },
  saveButton: {
    height: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 7,
    borderWidth: 1,
    borderColor: "#3c4735",
    borderRadius: 4,
  },
  saveText: {
    color: "#d5f36a",
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 9,
  },
});
