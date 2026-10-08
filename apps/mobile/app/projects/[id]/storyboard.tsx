import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Copy,
  Film,
  ImagePlus,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react-native";
import type { GenerationJob, StoryShot } from "@storyflix/shared";
import { apiRequest } from "@/lib/api";
import {
  getLocalProjects,
  saveLocalProject,
  type LocalProject,
} from "@/lib/storage";
import { moveLocalShot } from "@/lib/demo";

export default function StoryboardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<LocalProject | null>(null);
  const [workingShotId, setWorkingShotId] = useState<string | null>(null);
  const [generationMessage, setGenerationMessage] = useState("");
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
  const shots = project?.shots ?? [];

  async function saveShot(shotId: string, patch: Partial<StoryShot>) {
    if (!project) return;
    const next = {
      ...project,
      shots: shots.map((shot) =>
        shot.id === shotId ? { ...shot, ...patch } : shot,
      ),
      updatedAt: new Date().toISOString(),
    };
    setProject(next);
    await saveLocalProject(next);
    if (!id.startsWith("demo-"))
      await apiRequest(`/v1/projects/${id}/shots/${shotId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }).catch(() => undefined);
  }

  async function reorder(shotId: string, direction: -1 | 1) {
    const next = await moveLocalShot(id, shotId, direction);
    if (next) setProject(next);
  }

  async function duplicate(shot: StoryShot) {
    if (!project) return;
    const duplicate = {
      ...shot,
      id: `shot-${Date.now()}`,
      shotNumber: shots.length + 1,
    };
    const next = { ...project, shots: [...shots, duplicate] };
    setProject(next);
    await saveLocalProject(next);
  }

  async function remove(shotId: string) {
    if (!project) return;
    const next = {
      ...project,
      shots: shots
        .filter((shot) => shot.id !== shotId)
        .map((shot, index) => ({ ...shot, shotNumber: index + 1 })),
    };
    setProject(next);
    await saveLocalProject(next);
  }

  async function addShot() {
    if (!project) return;
    const shot: StoryShot = {
      id: `shot-${Date.now()}`,
      sceneId: project.scenes?.[0]?.id ?? "",
      shotNumber: shots.length + 1,
      durationSeconds: 5,
      camera: "Medium shot",
      movement: "Slow push-in",
      dialogue: "",
      voiceover: "",
      sfx: "",
      music: "",
      prompt:
        "A new cinematic shot. Describe composition, subject, light and action.",
    };
    const next = { ...project, shots: [...shots, shot] };
    setProject(next);
    await saveLocalProject(next);
  }

  async function generateAsset(shot: StoryShot, kind: "image" | "video") {
    if (!project) return;
    if (id.startsWith("demo-")) {
      Alert.alert(
        "Connect a generation provider",
        "This project is stored only on this device. No image or video was generated. Connect the API and open a server-saved project to queue provider jobs.",
      );
      return;
    }
    const scene = project.scenes?.find((item) => item.id === shot.sceneId);
    if (!scene) {
      Alert.alert("Scene required", "Create screenplay scenes before generating storyboard assets.");
      return;
    }
    setWorkingShotId(shot.id);
    setGenerationMessage(`Queueing ${kind} generation`);
    try {
      const queued = await apiRequest<{ job: GenerationJob }>(`/v1/projects/${id}/jobs`, {
        method: "POST",
        body: JSON.stringify({
          type: kind === "image" ? "IMAGE_GENERATION" : "VIDEO_GENERATION",
          payload: { sceneId: scene.id, shotId: shot.id, prompt: shot.prompt, durationSeconds: shot.durationSeconds, aspectRatio: project.format, characterIds: scene.characterIds ?? [] },
        }),
      });
      let job = queued.job;
      for (let attempt = 0; attempt < 180 && ["QUEUED", "PROCESSING"].includes(job.status); attempt += 1) {
        setGenerationMessage(`${job.status.toLowerCase()} · ${job.progress}% · ${job.message}`);
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        job = (await apiRequest<{ job: GenerationJob }>(`/v1/jobs/${job.id}`)).job;
      }
      if (job.status !== "COMPLETED") throw new Error(job.error ?? "Generation did not complete.");
      const result = job.result as { url?: string; demo?: boolean; provider?: string; message?: string } | undefined;
      if (!result?.url) throw new Error(result?.message ?? "Provider returned no media URL.");
      if (kind === "image") await saveShot(shot.id, { imageUrl: result.url, imageDemo: Boolean(result.demo) });
      else await saveShot(shot.id, { videoUrl: result.demo ? undefined : result.url, videoDemo: Boolean(result.demo) });
      if (result.demo) {
        Alert.alert("Demo provider output", kind === "video" ? "The demo simulates this job but did not produce a playable video." : "This labeled demo image was not generated by an AI provider.");
      }
    } catch (error) {
      Alert.alert("Generation failed", error instanceof Error ? error.message : "The provider job failed.");
    } finally {
      setWorkingShotId(null);
      setGenerationMessage("");
    }
  }

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <ArrowLeft size={19} color="#edece4" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>VISUAL SEQUENCE</Text>
          <Text style={styles.title}>Storyboard</Text>
        </View>
        <Pressable style={styles.add} onPress={() => void addShot()}>
          <Plus size={16} color="#151910" />
        </Pressable>
      </View>
      <Text style={styles.project}>
        {project?.title ?? "Loading project"} · {shots.length} SHOTS
      </Text>
      {shots.length ? (
        shots.map((shot, index) => (
          <View key={shot.id} style={styles.shot}>
            <View style={styles.shotTop}>
              <Text style={styles.shotIndex}>
                SHOT {String(index + 1).padStart(2, "0")}
              </Text>
              <View style={styles.actions}>
                <Pressable
                  onPress={() => void reorder(shot.id, -1)}
                  style={styles.tool}
                >
                  <ArrowUp size={13} color="#b9c0b2" />
                </Pressable>
                <Pressable
                  onPress={() => void reorder(shot.id, 1)}
                  style={styles.tool}
                >
                  <ArrowDown size={13} color="#b9c0b2" />
                </Pressable>
                <Pressable
                  onPress={() => void duplicate(shot)}
                  style={styles.tool}
                >
                  <Copy size={13} color="#b9c0b2" />
                </Pressable>
                <Pressable
                  onPress={() => void remove(shot.id)}
                  style={styles.tool}
                >
                  <Trash2 size={13} color="#d49a82" />
                </Pressable>
              </View>
            </View>
            <Pressable
              onPress={() => void generateAsset(shot, "image")}
              style={styles.frame}
              disabled={workingShotId === shot.id}
            >
              {shot.imageUrl ? (
                <Image source={{ uri: shot.imageUrl }} style={styles.image} />
              ) : (
                <>
                  <ImagePlus size={21} color="#d5f36a" />
                  <Text style={styles.frameText}>Add frame</Text>
                </>
              )}
              {shot.imageUrl ? <View style={styles.frameTag}><Text style={styles.frameTagText}>{shot.imageDemo ? "DEMO IMAGE" : "PROVIDER IMAGE"}</Text></View> : null}
            </Pressable>
            <View style={styles.meta}>
              <Text style={styles.metaText}>
                {shot.durationSeconds}s · {shot.camera}
              </Text>
              <Text style={styles.metaText}>{shot.movement}</Text>
            </View>
            <Text style={styles.label}>IMAGE / VIDEO PROMPT</Text>
            <TextInput
              value={shot.prompt}
              onChangeText={(prompt) => {
                void saveShot(shot.id, { prompt });
              }}
              multiline
              textAlignVertical="top"
              style={styles.prompt}
            />
            <View style={styles.detailGrid}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>DIALOGUE</Text>
                <TextInput
                  value={shot.dialogue}
                  onChangeText={(dialogue) => {
                    void saveShot(shot.id, { dialogue });
                  }}
                  style={styles.smallInput}
                  placeholder="Dialogue"
                  placeholderTextColor="#717a70"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>VOICEOVER</Text>
                <TextInput
                  value={shot.voiceover}
                  onChangeText={(voiceover) => {
                    void saveShot(shot.id, { voiceover });
                  }}
                  style={styles.smallInput}
                  placeholder="Narration"
                  placeholderTextColor="#717a70"
                />
              </View>
            </View>
            {shot.videoUrl ? <Text style={styles.videoStatus}>{shot.videoDemo ? "DEMO SIMULATION · no playable video" : "VIDEO PROVIDER OUTPUT READY"}</Text> : null}
            {workingShotId === shot.id ? <Text style={styles.generationStatus}>{generationMessage}</Text> : null}
            <View style={styles.generationActions}>
              <Pressable onPress={() => void generateAsset(shot, "image")} style={styles.regenerate} disabled={Boolean(workingShotId)}>
                {workingShotId === shot.id ? <RefreshCw size={12} color="#d5f36a" /> : <ImagePlus size={12} color="#d5f36a" />}
                <Text style={styles.regenerateText}>Generate frame</Text>
              </Pressable>
              <Pressable onPress={() => void generateAsset(shot, "video")} style={styles.regenerate} disabled={Boolean(workingShotId)}>
                <Film size={12} color="#d5f36a" />
                <Text style={styles.regenerateText}>Generate video</Text>
              </Pressable>
            </View>
          </View>
        ))
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No storyboard shots yet</Text>
          <Text style={styles.emptyText}>
            Generate scenes or add the first shot manually.
          </Text>
          <Pressable style={styles.addButton} onPress={() => void addShot()}>
            <Plus size={14} color="#151910" />
            <Text style={styles.addButtonText}>Add first shot</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#101310" },
  content: { padding: 18, paddingTop: 19, paddingBottom: 38 },
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
    fontSize: 19,
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
  project: {
    color: "#90978d",
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 9,
    marginTop: 13,
    marginBottom: 10,
  },
  shot: {
    marginTop: 9,
    padding: 11,
    backgroundColor: "#181d18",
    borderWidth: 1,
    borderColor: "#2b312b",
    borderRadius: 5,
  },
  shotTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 9,
  },
  shotIndex: {
    color: "#d5f36a",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 8,
    letterSpacing: 1,
  },
  actions: { flexDirection: "row", gap: 4 },
  tool: {
    width: 27,
    height: 27,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#242a23",
    borderRadius: 3,
  },
  frame: {
    height: 156,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#252d27",
    borderRadius: 4,
    overflow: "hidden",
  },
  image: { width: "100%", height: "100%" },
  frameText: {
    color: "#bdc3b7",
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 9,
    marginTop: 5,
  },
  frameTag: {
    position: "absolute",
    right: 7,
    top: 7,
    backgroundColor: "rgba(10,14,11,0.75)",
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 2,
  },
  frameTagText: {
    color: "#e5e7df",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 6,
    letterSpacing: 0.7,
  },
  meta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    marginBottom: 10,
  },
  metaText: {
    color: "#a4aa9f",
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 8,
  },
  label: {
    color: "#aeb5a8",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 7,
    letterSpacing: 0.8,
    marginBottom: 5,
  },
  prompt: {
    minHeight: 55,
    color: "#e2e4db",
    backgroundColor: "#20251f",
    borderWidth: 1,
    borderColor: "#30372e",
    borderRadius: 3,
    padding: 8,
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 9,
    lineHeight: 14,
  },
  detailGrid: { flexDirection: "row", gap: 8, marginTop: 9 },
  smallInput: {
    height: 34,
    color: "#e2e4db",
    backgroundColor: "#20251f",
    borderWidth: 1,
    borderColor: "#30372e",
    borderRadius: 3,
    paddingHorizontal: 7,
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 8,
  },
  regenerate: {
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
    marginTop: 10,
  },
  regenerateText: {
    color: "#d5f36a",
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 8,
  },
  generationActions: { flexDirection: "row", gap: 14, alignItems: "center" },
  generationStatus: { color: "#b8c2a8", fontFamily: "SpaceGrotesk_400Regular", fontSize: 8, marginTop: 8 },
  videoStatus: { color: "#c4aa81", fontFamily: "SpaceGrotesk_700Bold", fontSize: 7, letterSpacing: 0.5, marginTop: 9 },
  empty: {
    alignItems: "center",
    paddingVertical: 48,
    borderTopWidth: 1,
    borderColor: "#2b312b",
  },
  emptyTitle: {
    color: "#eeeDE5",
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 13,
  },
  emptyText: {
    color: "#999f96",
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 9,
    marginTop: 6,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#d5f36a",
    borderRadius: 4,
  },
  addButtonText: {
    color: "#151910",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 9,
  },
});
