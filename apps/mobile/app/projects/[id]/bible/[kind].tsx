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
  ImagePlus,
  Plus,
  Save,
  Sparkles,
} from "lucide-react-native";
import type { Character, StoryLocation } from "@storyflix/shared";
import { apiRequest } from "@/lib/api";
import {
  getLocalProjects,
  saveLocalProject,
  type LocalProject,
} from "@/lib/storage";

const lime = "#d5f36a";
const characterFields = [
  ["name", "NAME", false],
  ["aliases", "ALIASES · ONE PER LINE", true],
  ["age", "AGE", false],
  ["gender", "GENDER", false],
  ["role", "ROLE", false],
  ["personality", "PERSONALITY", true],
  ["relationships", "RELATIONSHIPS · ONE PER LINE", true],
  ["appearance", "APPEARANCE", true],
  ["hair", "HAIR", false],
  ["face", "FACE", false],
  ["body", "BODY", false],
  ["clothing", "CLOTHING", true],
  ["voice", "VOICE", false],
  ["accent", "ACCENT", false],
  ["canonicalPrompt", "CANONICAL PROMPT · USED IN EVERY GENERATION", true],
] as const;
const locationFields = [
  ["name", "NAME", false],
  ["description", "DESCRIPTION", true],
  ["era", "ERA", false],
  ["architecture", "ARCHITECTURE", true],
  ["weather", "WEATHER", false],
  ["lighting", "LIGHTING", false],
  ["mood", "MOOD", false],
  ["props", "SIGNATURE PROPS · ONE PER LINE", true],
  ["timeOfDay", "TIME OF DAY", false],
  ["canonicalPrompt", "CANONICAL PROMPT · USED IN EVERY GENERATION", true],
] as const;

export default function BibleScreen() {
  const { id, kind } = useLocalSearchParams<{ id: string; kind: string }>();
  const router = useRouter();
  const isCharacter = kind === "characters";
  const [project, setProject] = useState<LocalProject | null>(null);
  const [selected, setSelected] = useState(0);
  const load = useCallback(async () => {
    const found =
      (await getLocalProjects()).find((item) => item.id === id) ?? null;
    setProject(found);
    setSelected(0);
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  const characters = project?.characters ?? [];
  const locations = project?.locations ?? [];
  const current = isCharacter ? characters[selected] : locations[selected];

  async function updateField(key: string, value: string) {
    if (!project || !current) return;
    const list = isCharacter ? [...characters] : [...locations];
    const prior = list[selected] as Character | StoryLocation;
    const arrayField = isCharacter ? ["aliases", "relationships"] : ["props"];
    const nextValue: unknown = arrayField.includes(key)
      ? value
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
      : value;
    list[selected] = { ...prior, [key]: nextValue } as Character &
      StoryLocation;
    const next = {
      ...project,
      ...(isCharacter
        ? { characters: list as Character[] }
        : { locations: list as StoryLocation[] }),
      updatedAt: new Date().toISOString(),
    };
    setProject(next);
    await saveLocalProject(next);
    if (!id.startsWith("demo-")) {
      const endpoint = isCharacter
        ? `characters/${prior.id}`
        : `locations/${prior.id}`;
      await apiRequest(`/v1/projects/${id}/${endpoint}`, {
        method: "PATCH",
        body: JSON.stringify({ [key]: nextValue }),
      }).catch(() => undefined);
    }
  }

  async function addItem() {
    if (!project) return;
    if (isCharacter) {
      const item: Character = {
        id: `character-${Date.now()}`,
        name: "New character",
        aliases: [],
        age: "",
        gender: "",
        personality: "",
        role: "Supporting",
        relationships: [],
        appearance: "",
        hair: "",
        face: "",
        body: "",
        clothing: "",
        voice: "",
        accent: "",
        canonicalPrompt:
          "New character. Define appearance, hair, face, body and clothing; keep identity consistent across every frame.",
      };
      const next = { ...project, characters: [...characters, item] };
      setProject(next);
      setSelected(next.characters.length - 1);
      await saveLocalProject(next);
    } else {
      const item: StoryLocation = {
        id: `location-${Date.now()}`,
        name: "New location",
        description: "",
        era: "",
        architecture: "",
        weather: "",
        lighting: "",
        mood: "",
        props: [],
        timeOfDay: "",
        canonicalPrompt:
          "A story location. Define consistent architecture, light, layout, palette and signature props.",
      };
      const next = { ...project, locations: [...locations, item] };
      setProject(next);
      setSelected(next.locations.length - 1);
      await saveLocalProject(next);
    }
  }

  async function generateReference() {
    if (!project || !current) return;
    if (id.startsWith("demo-")) {
      const url = isCharacter
        ? "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80"
        : "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1000&q=80";
      const list = isCharacter ? [...characters] : [...locations];
      list[selected] = { ...current, imageUrl: url };
      const next = {
        ...project,
        ...(isCharacter
          ? { characters: list as Character[] }
          : { locations: list as StoryLocation[] }),
      };
      setProject(next);
      await saveLocalProject(next);
      Alert.alert(
        "Demo reference added",
        "This image is a visual placeholder, not AI-generated output.",
      );
      return;
    }
    const type = isCharacter ? "CHARACTER_GENERATION" : "LOCATION_GENERATION";
    const response = await apiRequest<{ job: { id: string } }>(
      `/v1/projects/${id}/jobs`,
      {
        method: "POST",
        body: JSON.stringify({
          type,
          payload: isCharacter
            ? { character: current, variant: "portrait" }
            : { location: current, variant: "exterior" },
        }),
      },
    );
    Alert.alert(
      "Generation queued",
      `Job ${response.job.id} will run in the background.`,
    );
  }

  const formFields = isCharacter ? characterFields : locationFields;
  const title = isCharacter ? "Character bible" : "Location bible";
  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <ArrowLeft color="#e9e8e0" size={18} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>CONSISTENCY GUIDE</Text>
          <Text style={styles.title}>{title}</Text>
        </View>
        <Pressable style={styles.add} onPress={() => void addItem()}>
          <Plus color="#151910" size={16} />
        </Pressable>
      </View>
      <Text style={styles.projectName}>
        {project?.title ?? "Loading project"}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.selector}
      >
        {(isCharacter ? characters : locations).map((item, index) => (
          <Pressable
            key={item.id}
            onPress={() => setSelected(index)}
            style={[
              styles.selectItem,
              selected === index && styles.selectActive,
            ]}
          >
            <Text
              style={[
                styles.selectText,
                selected === index && styles.selectTextActive,
              ]}
            >
              {item.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      {current ? (
        <>
          <View style={styles.consistency}>
            <Sparkles color={lime} size={14} />
            <Text style={styles.consistencyText}>
              Canonical descriptions are automatically included in scene image
              and video prompts.
            </Text>
          </View>
          <Pressable
            style={styles.reference}
            onPress={() => void generateReference()}
          >
            {current.imageUrl ? (
              <Text style={styles.referenceSet}>REFERENCE IMAGE ATTACHED</Text>
            ) : (
              <>
                <ImagePlus color={lime} size={18} />
                <Text style={styles.referenceText}>
                  {isCharacter ? "Generate portrait" : "Generate environment"}
                </Text>
              </>
            )}
            <Text style={styles.referenceHint}>
              DEMO PLACEHOLDER OR PROVIDER JOB
            </Text>
          </Pressable>
          {formFields.map(([key, label, multiline]) => {
            const value = (current as unknown as Record<string, unknown>)[key];
            const text = Array.isArray(value)
              ? value.join("\n")
              : String(value ?? "");
            return (
              <View key={key} style={styles.field}>
                <Text style={styles.label}>{label}</Text>
                <TextInput
                  value={text}
                  onChangeText={(next) => {
                    void updateField(key, next);
                  }}
                  multiline={multiline}
                  textAlignVertical={multiline ? "top" : "center"}
                  style={[
                    styles.input,
                    multiline && styles.multiline,
                    key === "canonicalPrompt" && styles.canonical,
                  ]}
                  placeholder={`Add ${label.toLowerCase()}`}
                  placeholderTextColor="#727a70"
                />
              </View>
            );
          })}
          <View style={styles.footer}>
            <Save color="#9ba38e" size={12} />
            <Text style={styles.footerText}>
              Autosaved to this device
              {!id.startsWith("demo-") ? " and synced to the API" : ""}
            </Text>
          </View>
        </>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>
            No {isCharacter ? "characters" : "locations"} yet
          </Text>
          <Text style={styles.emptyText}>
            Run story analysis to detect them, or add one manually.
          </Text>
          <Pressable style={styles.addButton} onPress={() => void addItem()}>
            <Plus size={14} color="#151910" />
            <Text style={styles.addButtonText}>
              Add {isCharacter ? "character" : "location"}
            </Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#101310" },
  content: { padding: 19, paddingTop: 19, paddingBottom: 38 },
  header: { flexDirection: "row", alignItems: "center", gap: 11 },
  eyebrow: {
    color: "#d5f36a",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 8,
    letterSpacing: 1,
  },
  title: {
    color: "#f1f0e8",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 18,
    marginTop: 2,
  },
  add: {
    width: 33,
    height: 33,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#d5f36a",
    borderRadius: 4,
  },
  projectName: {
    color: "#9da498",
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 10,
    marginTop: 15,
  },
  selector: { gap: 7, paddingVertical: 13 },
  selectItem: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "#31382f",
    borderRadius: 4,
    backgroundColor: "#191e19",
  },
  selectActive: { backgroundColor: "#d5f36a", borderColor: "#d5f36a" },
  selectText: {
    color: "#aeb4a8",
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 9,
  },
  selectTextActive: { color: "#151910" },
  consistency: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    padding: 10,
    backgroundColor: "#1a2116",
    borderRadius: 4,
  },
  consistencyText: {
    flex: 1,
    color: "#b7c0ad",
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 9,
    lineHeight: 14,
  },
  reference: {
    minHeight: 83,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    marginTop: 12,
    marginBottom: 18,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#3a4434",
    borderRadius: 5,
    backgroundColor: "#171c17",
  },
  referenceText: {
    color: "#e3e5dc",
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 10,
  },
  referenceHint: {
    color: "#858e7f",
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 7,
    letterSpacing: 0.8,
  },
  referenceSet: {
    color: lime,
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 9,
    letterSpacing: 0.7,
  },
  field: { marginBottom: 13 },
  label: {
    color: "#bfc5b9",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 8,
    letterSpacing: 0.9,
    marginBottom: 6,
  },
  input: {
    height: 39,
    color: "#ecebe3",
    backgroundColor: "#191e19",
    borderWidth: 1,
    borderColor: "#2b312b",
    borderRadius: 4,
    paddingHorizontal: 10,
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 10,
  },
  multiline: { height: 70, paddingTop: 9, lineHeight: 15 },
  canonical: {
    minHeight: 100,
    height: 100,
    borderColor: "#414b35",
    color: "#dae1ca",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 9,
  },
  footerText: {
    color: "#899081",
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 8,
  },
  empty: {
    alignItems: "center",
    paddingVertical: 55,
    borderTopWidth: 1,
    borderColor: "#2b312b",
  },
  emptyTitle: {
    color: "#ecebe3",
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 14,
  },
  emptyText: {
    maxWidth: 240,
    color: "#999f96",
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 10,
    textAlign: "center",
    lineHeight: 15,
    marginTop: 7,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: "#d5f36a",
    borderRadius: 4,
  },
  addButtonText: {
    color: "#151910",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 9,
  },
});
