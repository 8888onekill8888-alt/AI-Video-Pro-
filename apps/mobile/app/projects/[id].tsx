import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  ArrowUpRight,
  AudioLines,
  Clapperboard,
  Download,
  Image as ImageIcon,
  Languages,
  LoaderCircle,
  MapPin,
  Sparkles,
  UsersRound,
} from "lucide-react-native";
import { getProject, runProjectAction } from "@/lib/api";
import {
  getLocalProjects,
  saveLocalProject,
  updateLocalProject,
  type LocalProject,
} from "@/lib/storage";
import { completeLocalDemoStep } from "@/lib/demo";

const steps = [
  {
    id: "analysis",
    title: "Story analysis",
    detail: "Themes, arc, characters & visual ideas",
    Icon: Sparkles,
  },
  {
    id: "script",
    title: "Screenplay",
    detail: "Scenes, dialogue & direction",
    Icon: Clapperboard,
  },
  {
    id: "characters",
    title: "Character bible",
    detail: "Cast, voice & canonical appearance",
    Icon: UsersRound,
  },
  {
    id: "scenes",
    title: "Scenes & storyboard",
    detail: "Shot list, camera & image prompts",
    Icon: ImageIcon,
  },
  {
    id: "locations",
    title: "Location bible",
    detail: "Sets, atmosphere & visual continuity",
    Icon: MapPin,
  },
  {
    id: "translate",
    title: "Translation",
    detail: "Side-by-side editing across 13 languages",
    Icon: Languages,
  },
  {
    id: "voice",
    title: "Voice studio",
    detail: "Narration, dialogue & subtitles",
    Icon: AudioLines,
  },
  {
    id: "dubbing",
    title: "Dubbing & subtitles",
    detail: "Translate video dialogue and create synchronized voice tracks",
    Icon: Languages,
  },
  {
    id: "render",
    title: "Render & export",
    detail: "Edit your timeline and render a film",
    Icon: Download,
  },
];

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<LocalProject | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [completed, setCompleted] = useState<string[]>([]);
  const refresh = useCallback(() => {
    void (async () => {
      let item = (await getLocalProjects()).find((entry) => entry.id === id) ?? null;
      if (!item && !id.startsWith("demo-")) {
        try {
          item = await getProject(id);
          await saveLocalProject(item);
        } catch {
          item = null;
        }
      }
      setProject(item);
      if (item) setCompleted([
        ...(item.analysis ? ["analysis"] : []),
        ...(item.script ? ["script"] : []),
        ...(item.characters?.length ? ["characters"] : []),
        ...(item.scenes?.length ? ["scenes"] : []),
        ...(item.locations?.length ? ["locations"] : []),
        ...(item.voiceAssets?.length ? ["voice"] : []),
        ...(item.exportResult ? ["render"] : []),
      ]);
    })();
  }, [id]);
  useEffect(() => {
    refresh();
  }, [refresh]);

  async function run(step: string) {
    if (!project) return;
    if (step === "translate" || step === "locations" || step === "dubbing" || step === "render") {
      openStep(step);
      return;
    }
    if (completed.includes(step)) {
      openStep(step);
      return;
    }
    setActive(step);
    if (id.startsWith("demo-")) {
      try {
        const updated = await completeLocalDemoStep(
          id,
          step === "render" ? "export" : step,
        );
        if (!updated)
          throw new Error("Project is no longer available on this device");
        setProject(updated);
        setCompleted((items) => [...new Set([...items, step])]);
        Alert.alert(
            "Demo output ready",
            "This labeled local result did not come from an external AI provider.",
        );
      } catch (error) {
        Alert.alert(
          "Could not complete this step",
          error instanceof Error ? error.message : "Please retry.",
        );
      } finally {
        setActive(null);
      }
      return;
    }
    const actionMap: Record<string, string> = {
      analysis: "analyze",
      script: "script",
      characters: "characters",
      scenes: "scenes",
      voice: "voice",
    };
    try {
      const result = await runProjectAction<{
        project?: Partial<LocalProject>;
        job?: { id: string };
      }>(id, actionMap[step] ?? step);
      await updateLocalProject(id, {
        ...result.project,
        status: "IN_PRODUCTION",
        updatedAt: new Date().toISOString(),
      });
      if (step !== "render")
        setCompleted((items) => [...new Set([...items, step])]);
      Alert.alert(
          step === "analysis" ? "Story analyzed" : "Production updated",
          `${steps.find((item) => item.id === step)?.title} is ready.`,
      );
    } catch (error) {
      Alert.alert(
        "Could not complete this step",
        error instanceof Error ? error.message : "Please retry.",
      );
    } finally {
      setActive(null);
      refresh();
    }
  }

  function openStep(step: string) {
    const routes: Record<string, string> = {
      analysis: `/projects/${id}/analysis`,
      script: `/projects/${id}/script`,
      characters: `/projects/${id}/bible/characters`,
      scenes: `/projects/${id}/storyboard`,
      locations: `/projects/${id}/bible/locations`,
      translate: `/projects/${id}/translate`,
      voice: `/projects/${id}/voice`,
      dubbing: `/projects/${id}/dubbing`,
      render: `/projects/${id}/render`,
    };
    router.push(routes[step] ?? `/editor/${id}`);
  }

  if (!project)
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#d5f36a" />
        <Text style={styles.loadingText}>Opening project...</Text>
      </View>
    );
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Pressable style={styles.back} onPress={() => router.back()}>
        <ArrowLeft color="#d9dcd2" size={18} />
        <Text style={styles.backText}>PROJECTS</Text>
      </Pressable>
      <View style={styles.badge}>
        <View style={styles.dot} />
        <Text style={styles.badgeText}>
          {id.startsWith("demo-") ? "LOCAL DEMO" : "SERVER PROJECT"} · {project.genre.toUpperCase()}
        </Text>
      </View>
      <Text style={styles.title}>{project.title}</Text>
      <Text style={styles.meta}>
        {project.format} ·{" "}
        {Math.max(1, Math.round(project.durationSeconds / 60))} MIN · UPDATED
        JUST NOW
      </Text>
      <View style={styles.story}>
        <Text style={styles.storyLabel}>STORY SOURCE</Text>
        <Text numberOfLines={5} style={styles.storyText}>
          {project.story}
        </Text>
      </View>
      <View style={styles.productionHeading}>
        <Text style={styles.sectionTitle}>Production flow</Text>
        <Text style={styles.sectionMeta}>{completed.length} / {steps.length} READY</Text>
      </View>
      {steps.map(({ id: step, title, detail }, index) => {
        const ready = completed.includes(step);
        const working = active === step;
        return (
          <Pressable
            key={step}
            style={styles.step}
            onPress={() =>
              step === "export" && completed.includes("scenes")
                ? router.push(`/editor/${id}`)
                : void run(step)
            }
            disabled={Boolean(active)}
          >
            <View style={[styles.stepIndex, ready && styles.stepReady]}>
              {working ? (
                <LoaderCircle size={14} color="#151910" />
              ) : ready ? (
                <Text style={styles.check}>✓</Text>
              ) : (
                <Text style={styles.indexText}>
                  {String(index + 1).padStart(2, "0")}
                </Text>
              )}
            </View>
            <View style={styles.stepText}>
              <Text style={styles.stepTitle}>{title}</Text>
              <Text style={styles.stepDetail}>{detail}</Text>
            </View>
            {working ? (
              <ActivityIndicator size="small" color="#d5f36a" />
            ) : (
              <ArrowUpRight size={15} color={ready ? "#d5f36a" : "#858b80"} />
            )}
          </Pressable>
        );
      })}
      <Pressable
        style={styles.editButton}
        onPress={() => router.push(`/editor/${id}`)}
      >
        <Clapperboard color="#151910" size={16} />
        <Text style={styles.editText}>Open film editor</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#101310" },
  content: { padding: 22, paddingTop: 20, paddingBottom: 42 },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#101310",
  },
  loadingText: {
    color: "#adb3a7",
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    marginTop: 10,
  },
  back: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 30,
  },
  backText: {
    color: "#a2a89f",
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 9,
    letterSpacing: 1.2,
  },
  badge: { flexDirection: "row", alignItems: "center", gap: 7 },
  dot: { width: 6, height: 6, backgroundColor: "#d5f36a", borderRadius: 3 },
  badgeText: {
    color: "#d5f36a",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 8,
    letterSpacing: 1,
  },
  title: {
    color: "#f4f2ea",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 31,
    marginTop: 8,
  },
  meta: {
    color: "#8d9489",
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 8,
    letterSpacing: 0.8,
    marginTop: 7,
  },
  story: {
    marginTop: 21,
    padding: 14,
    backgroundColor: "#191e19",
    borderWidth: 1,
    borderColor: "#2b312b",
    borderRadius: 5,
  },
  storyLabel: {
    color: "#b6beac",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 8,
    letterSpacing: 1,
  },
  storyText: {
    color: "#b9beb4",
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 8,
  },
  productionHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginTop: 27,
    marginBottom: 5,
  },
  sectionTitle: {
    color: "#f1f0e9",
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 16,
  },
  sectionMeta: {
    color: "#858d80",
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 8,
    letterSpacing: 0.7,
  },
  step: {
    minHeight: 67,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderTopWidth: 1,
    borderColor: "#2b312b",
  },
  stepIndex: {
    width: 29,
    height: 29,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#3c4438",
    alignItems: "center",
    justifyContent: "center",
  },
  stepReady: { backgroundColor: "#d5f36a", borderColor: "#d5f36a" },
  check: { color: "#151910", fontSize: 13, fontWeight: "700" },
  indexText: {
    color: "#9ba294",
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 9,
  },
  stepText: { flex: 1 },
  stepTitle: {
    color: "#e9e9e1",
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 12,
  },
  stepDetail: {
    color: "#91988d",
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 9,
    marginTop: 3,
  },
  editButton: {
    minHeight: 44,
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    backgroundColor: "#d5f36a",
    borderRadius: 4,
  },
  editText: {
    color: "#151910",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 11,
  },
});
