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
import { ArrowLeft, Check, Save, Sparkles } from "lucide-react-native";
import { apiRequest } from "@/lib/api";
import {
  getLocalProjects,
  saveLocalProject,
  type LocalProject,
} from "@/lib/storage";
import { completeLocalDemoStep } from "@/lib/demo";

const fields = [
  ["plot", "THE STORY"],
  ["beginning", "BEGINNING"],
  ["middle", "MIDDLE"],
  ["climax", "CLIMAX"],
  ["ending", "ENDING"],
  ["mainConflict", "MAIN CONFLICT"],
  ["tone", "TONE"],
  ["timePeriod", "TIME PERIOD"],
] as const;
const lists = [
  ["themes", "THEMES"],
  ["relationships", "RELATIONSHIPS"],
  ["locations", "LOCATIONS"],
  ["importantEvents", "IMPORTANT EVENTS"],
  ["visualOpportunities", "VISUAL OPPORTUNITIES"],
] as const;
type EditableKey = (typeof fields)[number][0];
type ListKey = (typeof lists)[number][0];

export default function AnalysisScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<LocalProject | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState("");
  const load = useCallback(async () => {
    const found =
      (await getLocalProjects()).find((item) => item.id === id) ?? null;
    setProject(found);
    const analysis = found?.analysis;
    if (analysis)
      setDraft(
        Object.fromEntries([
          ...fields.map(([key]) => [
            key,
            String(analysis[key as EditableKey] ?? ""),
          ]),
          ...lists.map(([key]) => [
            key,
            (analysis[key as ListKey] ?? []).join("\n"),
          ]),
        ]),
      );
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  function setValue(key: string, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    if (!project?.analysis) return;
    const analysis = {
      ...project.analysis,
      ...Object.fromEntries(fields.map(([key]) => [key, draft[key] ?? ""])),
      ...Object.fromEntries(
        lists.map(([key]) => [
          key,
          (draft[key] ?? "")
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean),
        ]),
      ),
    };
    const updated = {
      ...project,
      analysis,
      updatedAt: new Date().toISOString(),
    };
    await saveLocalProject(updated);
    if (!id.startsWith("demo-")) {
      try {
        await apiRequest(`/v1/projects/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ analysis }),
        });
      } catch {
        Alert.alert(
          "Saved on this device",
          "The API is unavailable; your edits are stored locally.",
        );
      }
    }
    setProject(updated);
    setSavedAt(new Date().toLocaleTimeString());
  }

  async function generate() {
    if (!project) return;
    if (id.startsWith("demo-")) {
      await completeLocalDemoStep(id, "analysis");
      await load();
      return;
    }
    try {
      const result = await apiRequest<{
        analysis: LocalProject["analysis"];
        project: LocalProject;
      }>(`/v1/projects/${id}/analyze`, { method: "POST", body: "{}" });
      await saveLocalProject({ ...project, ...result.project });
      await load();
    } catch (error) {
      Alert.alert(
        "Analysis unavailable",
        error instanceof Error ? error.message : "Try again.",
      );
    }
  }

  if (!project?.analysis)
    return (
      <View style={styles.empty}>
        <Text style={styles.title}>No analysis yet</Text>
        <Text style={styles.copy}>
          Run story analysis from the production flow first.
        </Text>
        <Pressable style={styles.button} onPress={() => void generate()}>
          <Sparkles size={15} color="#171a13" />
          <Text style={styles.buttonText}>Analyze story</Text>
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
          <Text style={styles.eyebrow}>EDITABLE STORY BREAKDOWN</Text>
          <Text style={styles.title}>Story analysis</Text>
        </View>
        <Pressable onPress={() => void save()} style={styles.save}>
          <Save size={15} color="#151910" />
          <Text style={styles.saveText}>Save</Text>
        </Pressable>
      </View>
      <View style={styles.projectTag}>
        <Text style={styles.projectTitle}>{project.title}</Text>
        <Text style={styles.projectMeta}>
          {project.genre.toUpperCase()} · {project.analysis.characters.length}{" "}
          CHARACTERS
        </Text>
      </View>
      {fields.map(([key, label]) => (
        <View key={key} style={styles.field}>
          <Text style={styles.label}>{label}</Text>
          <TextInput
            value={draft[key] ?? ""}
            onChangeText={(value) => setValue(key, value)}
            onBlur={() => void save()}
            multiline
            textAlignVertical="top"
            style={styles.input}
            placeholderTextColor="#778075"
          />
        </View>
      ))}
      {lists.map(([key, label]) => (
        <View key={key} style={styles.field}>
          <Text style={styles.label}>
            {label} <Text style={styles.fieldHint}>ONE PER LINE</Text>
          </Text>
          <TextInput
            value={draft[key] ?? ""}
            onChangeText={(value) => setValue(key, value)}
            onBlur={() => void save()}
            multiline
            textAlignVertical="top"
            style={[styles.input, styles.listInput]}
            placeholderTextColor="#778075"
          />
        </View>
      ))}
      <Text style={styles.label}>CHARACTERS</Text>
      {project.analysis.characters.map((character, index) => (
        <View key={`${character.name}-${index}`} style={styles.character}>
          <Text style={styles.characterName}>{character.name}</Text>
          <Text style={styles.characterRole}>{character.role}</Text>
          <Text style={styles.characterDescription}>
            {character.description}
          </Text>
        </View>
      ))}
      <Pressable style={styles.generate} onPress={() => void generate()}>
        <Sparkles size={15} color="#151910" />
        <Text style={styles.buttonText}>Regenerate analysis</Text>
      </Pressable>
      <Text style={styles.saved}>
        <Check size={11} color="#99aa76" />{" "}
        {savedAt ? `Saved ${savedAt}` : "Autosaves when a field loses focus"}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#101310" },
  content: { padding: 20, paddingTop: 19, paddingBottom: 40 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 22,
  },
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
  save: {
    height: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    backgroundColor: "#d5f36a",
    borderRadius: 4,
  },
  saveText: {
    color: "#151910",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 9,
  },
  projectTag: {
    paddingVertical: 13,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#2b312b",
    marginBottom: 20,
  },
  projectTitle: {
    color: "#eeeeE6",
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 13,
  },
  projectMeta: {
    color: "#858d81",
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 8,
    letterSpacing: 1,
    marginTop: 4,
  },
  field: { marginBottom: 15 },
  label: {
    color: "#c3c8bc",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 8,
    letterSpacing: 1,
    marginBottom: 7,
  },
  fieldHint: { color: "#767e74", fontSize: 7 },
  input: {
    minHeight: 73,
    color: "#eeede5",
    backgroundColor: "#191e19",
    borderColor: "#2b312b",
    borderWidth: 1,
    borderRadius: 4,
    padding: 11,
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    lineHeight: 17,
  },
  listInput: { minHeight: 83 },
  character: { paddingVertical: 10, borderTopWidth: 1, borderColor: "#2b312b" },
  characterName: {
    color: "#eeeDE6",
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 12,
  },
  characterRole: {
    color: "#d5f36a",
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 8,
    marginTop: 3,
  },
  characterDescription: {
    color: "#9da399",
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 5,
  },
  generate: {
    height: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#d5f36a",
    borderRadius: 4,
    marginTop: 19,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#d5f36a",
    paddingHorizontal: 15,
    paddingVertical: 11,
    marginTop: 18,
    borderRadius: 4,
  },
  buttonText: {
    color: "#151910",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 10,
  },
  saved: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    justifyContent: "center",
    color: "#899282",
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 8,
    marginTop: 12,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
    backgroundColor: "#101310",
  },
  copy: {
    color: "#9b9f97",
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    textAlign: "center",
    marginTop: 8,
  },
});
