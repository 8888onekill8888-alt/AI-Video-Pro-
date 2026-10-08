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
import { ArrowLeft, Check, Redo2, Sparkles, Undo2 } from "lucide-react-native";
import type { ScriptScene } from "@storyflix/shared";
import { apiRequest } from "@/lib/api";
import {
  getLocalProjects,
  saveLocalProject,
  type LocalProject,
} from "@/lib/storage";
import { completeLocalDemoStep } from "@/lib/demo";

const actions = [
  { id: "rewrite", label: "Rewrite" },
  { id: "shorten", label: "Shorten" },
  { id: "expand", label: "Expand" },
  { id: "change-tone", label: "Change tone" },
  { id: "change-genre", label: "Change genre" },
  { id: "add-dialogue", label: "Add dialogue" },
  { id: "add-narration", label: "Add narration" },
  { id: "regenerate", label: "Regenerate" },
] as const;

export default function ScriptEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<LocalProject | null>(null);
  const [script, setScript] = useState<ScriptScene[] | null>(null);
  const [history, setHistory] = useState<ScriptScene[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [savedAt, setSavedAt] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    let found =
      (await getLocalProjects()).find((item) => item.id === id) ?? null;
    if (found && !found.script?.length) {
      found = await completeLocalDemoStep(id, "script");
    }
    setProject(found);
    if (found?.script) {
      setScript(found.script);
      setHistory([found.script]);
      setHistoryIndex(0);
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!script || !project) return;
    const timer = setTimeout(() => {
      const updated = {
        ...project,
        script,
        updatedAt: new Date().toISOString(),
      };
      void saveLocalProject(updated).then(() =>
        setSavedAt(new Date().toLocaleTimeString()),
      );
      if (!id.startsWith("demo-"))
        void apiRequest(`/v1/projects/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ script }),
        }).catch(() => undefined);
    }, 750);
    return () => clearTimeout(timer);
  }, [id, project, script]);

  function commit(next: ScriptScene[]) {
    const trimmed = history.slice(0, historyIndex + 1);
    setHistory([...trimmed, next]);
    setHistoryIndex(trimmed.length);
    setScript(next);
  }

  function updateScene(index: number, key: keyof ScriptScene, value: string) {
    if (!script) return;
    commit(
      script.map((scene, sceneIndex) =>
        sceneIndex === index
          ? {
              ...scene,
              [key]:
                key === "dialogue"
                  ? value
                      .split("\n")
                      .filter(Boolean)
                      .map((line) => {
                        const separator = line.indexOf(":");
                        return separator < 0
                          ? { character: "PROTAGONIST", line }
                          : {
                              character: line.slice(0, separator).trim(),
                              line: line.slice(separator + 1).trim(),
                            };
                      })
                  : value,
            }
          : scene,
      ),
    );
  }

  function undo() {
    if (historyIndex <= 0) return;
    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);
    setScript(history[nextIndex] ?? null);
  }

  function redo() {
    if (historyIndex >= history.length - 1) return;
    const nextIndex = historyIndex + 1;
    setHistoryIndex(nextIndex);
    setScript(history[nextIndex] ?? null);
  }

  async function perform(action: (typeof actions)[number]["id"]) {
    if (!script || !project) return;
    setBusy(true);
    try {
      let next = script.map((scene) => ({
        ...scene,
        dialogue: [...scene.dialogue],
      }));
      if (action === "shorten")
        next = next.map((scene) => ({
          ...scene,
          action: scene.action.slice(0, 150),
          dialogue: scene.dialogue.slice(0, 1),
        }));
      else if (action === "expand")
        next = next.map((scene) => ({
          ...scene,
          action: `${scene.action} A specific physical choice reveals what the character cannot yet say.`,
        }));
      else if (action === "rewrite")
        next = next.map((scene) => ({
          ...scene,
          action: `${scene.action} Reframed with a more cinematic point of view.`,
        }));
      else if (action === "add-dialogue")
        next = next.map((scene, index) =>
          index === 1 && scene.dialogue.length === 0
            ? {
                ...scene,
                dialogue: [
                  {
                    character: project.characters?.[0]?.name ?? "PROTAGONIST",
                    line: "I know what I have to do.",
                  },
                ],
              }
            : scene,
        );
      else if (action === "add-narration")
        next = next.map((scene) =>
          scene.voiceover ? scene : { ...scene, voiceover: scene.action },
        );
      else if (action === "change-tone" || action === "change-genre") {
        const value =
          action === "change-tone"
            ? "Dreamlike and quietly suspenseful"
            : "Mystery";
        await saveLocalProject({
          ...project,
          [action === "change-tone" ? "tone" : "genre"]: value,
        });
        next = next.map((scene) => ({
          ...scene,
          action: `${scene.action} [${value}]`,
        }));
      } else if (action === "regenerate") {
        next = next.map((scene, index) => ({
          ...scene,
          action:
            project.story.split(/(?<=[.!?])\s+/).filter(Boolean)[index] ??
            scene.action,
          transition:
            index === 0
              ? "FADE IN:"
              : index === next.length - 1
                ? "FADE OUT."
                : "CUT TO:",
        }));
      }
      if (!id.startsWith("demo-")) {
        const response = await apiRequest<{ script: ScriptScene[] }>(
          `/v1/projects/${id}/script`,
          { method: "POST", body: JSON.stringify({ action, script: next }) },
        );
        next = response.script;
      }
      commit(next);
    } catch (error) {
      Alert.alert(
        "Could not update screenplay",
        error instanceof Error ? error.message : "Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!project || !script)
    return (
      <View style={styles.empty}>
        <Text style={styles.title}>Screenplay is being prepared</Text>
        <Text style={styles.copy}>
          Add story analysis from the production flow to continue.
        </Text>
        <Pressable style={styles.primary} onPress={() => void load()}>
          <Sparkles size={14} color="#151910" />
          <Text style={styles.primaryText}>Prepare screenplay</Text>
        </Pressable>
      </View>
    );
  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <ArrowLeft size={19} color="#e9e8e0" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>
            SCREENPLAY · {script.length} SCENES
          </Text>
          <Text style={styles.title}>{project.title}</Text>
        </View>
        <View style={styles.history}>
          <Pressable
            disabled={historyIndex <= 0}
            onPress={undo}
            style={styles.iconButton}
          >
            <Undo2
              size={16}
              color={historyIndex <= 0 ? "#5f675d" : "#d4d8ce"}
            />
          </Pressable>
          <Pressable
            disabled={historyIndex >= history.length - 1}
            onPress={redo}
            style={styles.iconButton}
          >
            <Redo2
              size={16}
              color={historyIndex >= history.length - 1 ? "#5f675d" : "#d4d8ce"}
            />
          </Pressable>
        </View>
      </View>
      <View style={styles.actionHeader}>
        <Text style={styles.label}>STORY TO SCREEN</Text>
        <Text style={styles.saved}>
          <Check size={10} color="#9bb176" />{" "}
          {savedAt ? `Saved ${savedAt}` : "Autosave on"}
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.actionRow}
      >
        {actions.map((action) => (
          <Pressable
            key={action.id}
            disabled={busy}
            onPress={() => void perform(action.id)}
            style={styles.action}
          >
            <Text style={styles.actionText}>{action.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {script.map((scene, index) => (
        <View key={`${scene.sceneNumber}-${index}`} style={styles.scene}>
          <View style={styles.sceneHeader}>
            <Text style={styles.sceneNumber}>
              SCENE {String(scene.sceneNumber).padStart(2, "0")}
            </Text>
            <Text style={styles.sceneTime}>{scene.time.toUpperCase()}</Text>
          </View>
          <TextInput
            value={scene.heading}
            onChangeText={(value) => updateScene(index, "heading", value)}
            style={styles.slug}
          />
          <TextInput
            value={scene.location}
            onChangeText={(value) => updateScene(index, "location", value)}
            style={styles.lineInput}
            placeholder="Location"
            placeholderTextColor="#777f75"
          />
          <Text style={styles.field}>ACTION</Text>
          <TextInput
            value={scene.action}
            onChangeText={(value) => updateScene(index, "action", value)}
            multiline
            textAlignVertical="top"
            style={[styles.input, styles.actionInput]}
          />
          <Text style={styles.field}>CAMERA & LIGHT</Text>
          <TextInput
            value={scene.camera}
            onChangeText={(value) => updateScene(index, "camera", value)}
            style={styles.lineInput}
            placeholder="Camera"
            placeholderTextColor="#777f75"
          />
          <TextInput
            value={scene.lighting}
            onChangeText={(value) => updateScene(index, "lighting", value)}
            style={styles.lineInput}
            placeholder="Lighting"
            placeholderTextColor="#777f75"
          />
          <Text style={styles.field}>DIALOGUE · CHARACTER: LINE</Text>
          <TextInput
            value={scene.dialogue
              .map((line) => `${line.character}: ${line.line}`)
              .join("\n")}
            onChangeText={(value) => updateScene(index, "dialogue", value)}
            multiline
            textAlignVertical="top"
            style={[styles.input, styles.dialogueInput]}
            placeholder="Add dialogue"
            placeholderTextColor="#777f75"
          />
          <Text style={styles.field}>VOICEOVER</Text>
          <TextInput
            value={scene.voiceover}
            onChangeText={(value) => updateScene(index, "voiceover", value)}
            multiline
            textAlignVertical="top"
            style={styles.input}
            placeholder="Narration"
            placeholderTextColor="#777f75"
          />
          <View style={styles.pair}>
            <View style={{ flex: 1 }}>
              <Text style={styles.field}>SOUND</Text>
              <TextInput
                value={scene.sound}
                onChangeText={(value) => updateScene(index, "sound", value)}
                multiline
                style={styles.input}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.field}>MUSIC</Text>
              <TextInput
                value={scene.music}
                onChangeText={(value) => updateScene(index, "music", value)}
                multiline
                style={styles.input}
              />
            </View>
          </View>
          <TextInput
            value={scene.transition}
            onChangeText={(value) => updateScene(index, "transition", value)}
            style={styles.transition}
          />
        </View>
      ))}
      <Pressable
        style={styles.primary}
        onPress={() => void perform("regenerate")}
      >
        <Sparkles size={14} color="#151910" />
        <Text style={styles.primaryText}>Regenerate screenplay</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#101310" },
  content: { padding: 17, paddingTop: 20, paddingBottom: 45 },
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
    fontSize: 17,
    marginTop: 3,
  },
  history: { flexDirection: "row", gap: 4 },
  iconButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1b201b",
    borderRadius: 4,
  },
  actionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 21,
    marginBottom: 9,
  },
  label: {
    color: "#c2c7ba",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 8,
    letterSpacing: 1,
  },
  saved: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    color: "#8d9685",
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 8,
  },
  actionRow: { gap: 6, paddingBottom: 14 },
  action: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "#1b211a",
    borderWidth: 1,
    borderColor: "#30392c",
    borderRadius: 4,
  },
  actionText: {
    color: "#c4cbb9",
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 9,
  },
  scene: {
    marginTop: 10,
    marginBottom: 10,
    padding: 13,
    backgroundColor: "#171c17",
    borderWidth: 1,
    borderColor: "#2a3029",
    borderRadius: 5,
  },
  sceneHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 11,
  },
  sceneNumber: {
    color: "#d5f36a",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 8,
    letterSpacing: 1,
  },
  sceneTime: {
    color: "#9b9f97",
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 8,
  },
  slug: {
    color: "#f0efe7",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 12,
    marginBottom: 8,
    padding: 2,
  },
  lineInput: {
    color: "#d5d9cf",
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 10,
    borderBottomWidth: 1,
    borderColor: "#30362f",
    paddingVertical: 8,
    marginBottom: 9,
  },
  field: {
    color: "#8e968a",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 7,
    letterSpacing: 1,
    marginTop: 9,
    marginBottom: 5,
  },
  input: {
    minHeight: 51,
    color: "#e7e7de",
    backgroundColor: "#1d221d",
    borderWidth: 1,
    borderColor: "#2c332c",
    borderRadius: 3,
    paddingHorizontal: 9,
    paddingVertical: 8,
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 10,
    lineHeight: 15,
  },
  actionInput: { minHeight: 68 },
  dialogueInput: { minHeight: 54 },
  pair: { flexDirection: "row", gap: 8 },
  transition: {
    alignSelf: "flex-end",
    color: "#d5f36a",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 8,
    marginTop: 9,
  },
  primary: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: "#d5f36a",
    borderRadius: 4,
    marginTop: 14,
  },
  primaryText: {
    color: "#151910",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 10,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
    backgroundColor: "#101310",
  },
  copy: {
    color: "#999f96",
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    textAlign: "center",
    marginTop: 8,
  },
});
