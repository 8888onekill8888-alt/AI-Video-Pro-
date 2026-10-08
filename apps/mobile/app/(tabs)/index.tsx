import { useCallback, useState } from "react";
import {
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import {
  ArrowUpRight,
  AudioLines,
  Clapperboard,
  Film,
  Lightbulb,
  Plus,
  Sparkles,
  Zap,
  Workflow,
} from "lucide-react-native";
import type { GenerationJob } from "@storyflix/shared";
import { apiRequest, listProjects } from "@/lib/api";
import { getLocalProjects, type LocalProject } from "@/lib/storage";

const cover =
  "https://images.unsplash.com/photo-1478720568477-152d9b164e26?auto=format&fit=crop&w=1100&q=85";
const palette = {
  bg: "#101310",
  panel: "#191e19",
  line: "#2b312b",
  text: "#f3f2eb",
  muted: "#9b9f97",
  lime: "#d5f36a",
  orange: "#f09b6c",
};

export default function HomeScreen() {
  const router = useRouter();
  const [projects, setProjects] = useState<LocalProject[]>([]);
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [demoMode, setDemoMode] = useState(true);
  const [credits, setCredits] = useState<number | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  useFocusEffect(
    useCallback(() => {
      void (async () => {
        const local = await getLocalProjects();
        setProjects(local);
        try {
          const remote = await listProjects();
          const remoteIds = new Set(remote.map((project) => project.id));
          setProjects([...remote, ...local.filter((project) => !remoteIds.has(project.id))]);
        } catch {
          setProjects(local);
        }
      })();
      setConfigLoading(true);
      void apiRequest<{ demoMode: boolean }>("/v1/config")
        .then((config) => setDemoMode(config.demoMode))
        .catch(() => setDemoMode(true))
        .finally(() => setConfigLoading(false));
      void apiRequest<{ balance: number }>("/v1/credits")
        .then((result) => setCredits(result.balance))
        .catch(() => setCredits(null));
      void apiRequest<{ jobs: GenerationJob[] }>('/v1/jobs')
        .then((result) => setJobs(result.jobs.filter((job) => ['EXPORT', 'VIDEO_RENDER', 'DUBBING_GENERATION'].includes(job.type)).slice(0, 3)))
        .catch(() => setJobs([]));
    }, []),
  );

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.wordmark}>
            CINEFORGE <Text style={styles.ai}>AI</Text>
          </Text>
          <Text style={styles.kicker}>YOUR FILM STUDIO, REIMAGINED</Text>
        </View>
        <View style={styles.credit}>
          <Zap size={13} color={palette.lime} />
          <Text style={styles.creditText}>{credits === null ? "—" : credits}</Text>
        </View>
      </View>

      <View style={styles.demo}>
        <View style={styles.liveDot} />
        <Text style={styles.demoText}>{configLoading ? "CONNECTING" : demoMode ? "DEMO MODE" : "LIVE PROVIDERS"}</Text>
        <Text style={styles.demoHint}>{demoMode ? "Demo results are labeled · providers in Settings" : "Provider availability varies by tool"}</Text>
      </View>

      <ImageBackground
        source={{ uri: cover }}
        style={styles.hero}
        imageStyle={styles.heroImage}
      >
        <View style={styles.heroShade} />
        <View style={styles.heroContent}>
          <View style={styles.heroEyebrow}>
            <Sparkles size={13} color={palette.lime} />
            <Text style={styles.heroEyebrowText}>CINEFORGE AI STUDIO</Text>
          </View>
          <Text style={styles.heroTitle}>
            Turn stories{"\n"}into{" "}
            <Text style={styles.heroItalic}>movies.</Text>
          </Text>
          <Text style={styles.heroCopy}>
            From the first line to the final frame.
          </Text>
          <Pressable
            style={styles.primaryButton}
            onPress={() => router.push("/(tabs)/create")}
          >
            <Clapperboard size={17} color="#151910" />
            <Text style={styles.primaryText}>Create a movie</Text>
            <ArrowUpRight size={16} color="#151910" />
          </Pressable>
        </View>
        <View style={styles.frameTag}>
          <Film size={12} color={palette.text} />
          <Text style={styles.frameTagText}>STORY TO SCREEN</Text>
        </View>
      </ImageBackground>

      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>Start with a spark</Text>
        <Text style={styles.sectionMeta}>01 / 04</Text>
      </View>
      <View style={styles.startGrid}>
        {[
          {
            title: "A story",
            sub: "I have the words",
            icon: "Aa",
            tint: palette.lime,
          },
          {
            title: "An idea",
            sub: "Just a beginning",
            icon: "✳",
            tint: palette.orange,
          },
          {
            title: "A novel",
            sub: "Adapt a long read",
            icon: "▤",
            tint: "#a9a7ff",
          },
          {
            title: "A script",
            sub: "Build it into film",
            icon: "▧",
            tint: "#76d4c1",
          },
        ].map((item) => (
          <Pressable
            key={item.title}
            style={styles.startTile}
            onPress={() =>
              router.push({
                pathname: "/(tabs)/create",
                params: { source: item.title },
              })
            }
          >
            <Text style={[styles.tileIcon, { color: item.tint }]}>
              {item.icon}
            </Text>
            <Text style={styles.tileTitle}>{item.title}</Text>
            <Text style={styles.tileSub}>{item.sub}</Text>
            <Plus size={14} color={palette.muted} style={styles.tilePlus} />
          </Pressable>
        ))}
      </View>

      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>Recent projects</Text>
        <Pressable onPress={() => router.push("/(tabs)/projects")}>
          <Text style={styles.seeAll}>
            View all <ArrowUpRight size={12} color={palette.lime} />
          </Text>
        </Pressable>
      </View>
      {projects.length ? (
        projects.slice(0, 2).map((project) => (
          <Pressable
            key={project.id}
            style={styles.projectRow}
            onPress={() => router.push(`/projects/${project.id}`)}
          >
            <View style={styles.projectThumb}>
              <Film size={19} color={palette.lime} />
            </View>
            <View style={styles.projectInfo}>
              <Text style={styles.projectName}>{project.title}</Text>
              <Text style={styles.projectSub}>
                {project.genre} · {project.status}
              </Text>
            </View>
            <ArrowUpRight size={16} color={palette.muted} />
          </Pressable>
        ))
      ) : (
        <Pressable
          style={styles.emptyRow}
          onPress={() => router.push("/(tabs)/create")}
        >
          <View style={styles.emptyPlus}>
            <Plus color={palette.lime} size={17} />
          </View>
          <View>
            <Text style={styles.emptyTitle}>Your next story starts here</Text>
            <Text style={styles.emptySub}>Create your first film project</Text>
          </View>
        </Pressable>
      )}

      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>Translate or dub</Text>
      </View>
      <Pressable style={styles.dubShortcut} onPress={() => router.push('/(tabs)/studio')}>
        <View style={styles.dubIcon}><AudioLines size={16} color="#e9a885" /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.dubTitle}>Localize a film</Text>
          <Text style={styles.dubCopy}>Upload video, translate dialogue and prepare subtitles.</Text>
        </View>
        <ArrowUpRight size={15} color={palette.muted} />
      </Pressable>

      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>Render queue</Text>
        <Pressable onPress={() => router.push('/(tabs)/studio')}>
          <Text style={styles.seeAll}>Open studio <ArrowUpRight size={12} color={palette.lime} /></Text>
        </Pressable>
      </View>
      {jobs.length ? jobs.map((job) => (
        <View key={job.id} style={styles.queueRow}>
          <View style={styles.queueDot} />
          <View style={{ flex: 1 }}>
            <Text style={styles.queueTitle}>{job.type.replaceAll('_', ' ')}</Text>
            <Text style={styles.queueMessage}>{job.message}</Text>
          </View>
          <Text style={styles.queueProgress}>{job.status === 'COMPLETED' ? 'READY' : `${job.progress}%`}</Text>
        </View>
      )) : (
        <View style={styles.queueEmpty}><Workflow size={14} color="#818a7b" /><Text style={styles.queueEmptyText}>No renders in progress</Text></View>
      )}

      <View style={styles.insight}>
        <View style={styles.insightIcon}>
          <Lightbulb size={16} color={palette.orange} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.insightLabel}>STUDIO NOTE</Text>
          <Text style={styles.insightText}>
            A strong visual world begins with one unforgettable detail.
          </Text>
        </View>
        <ArrowUpRight size={14} color={palette.muted} />
      </View>
      <Text style={styles.footer}>CINEFORGE AI · TURN STORIES INTO MOVIES</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.bg },
  content: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 28 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  wordmark: {
    color: palette.text,
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 18,
    letterSpacing: 0.5,
  },
  ai: { color: palette.lime },
  kicker: {
    color: palette.muted,
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 8,
    letterSpacing: 1.4,
    marginTop: 2,
  },
  credit: {
    height: 34,
    paddingHorizontal: 11,
    gap: 6,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    backgroundColor: "#20271a",
    borderWidth: 1,
    borderColor: "#3c492a",
  },
  creditText: {
    color: palette.text,
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 12,
  },
  demo: {
    height: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 14,
    paddingHorizontal: 10,
    borderRadius: 5,
    backgroundColor: "#1b2418",
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 4,
    backgroundColor: palette.lime,
  },
  demoText: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 9,
    color: palette.lime,
    letterSpacing: 0.9,
  },
  demoHint: {
    color: "#abb19f",
    fontSize: 10,
    fontFamily: "SpaceGrotesk_400Regular",
  },
  hero: {
    height: 354,
    borderRadius: 9,
    overflow: "hidden",
    justifyContent: "flex-end",
    backgroundColor: "#272d27",
  },
  heroImage: { borderRadius: 9 },
  heroShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5,9,7,0.48)",
  },
  heroContent: { padding: 21 },
  heroEyebrow: {
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    marginBottom: 11,
  },
  heroEyebrowText: {
    color: palette.lime,
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 9,
    letterSpacing: 1.1,
  },
  heroTitle: {
    color: "#fffdf7",
    fontSize: 39,
    lineHeight: 42,
    fontFamily: "SpaceGrotesk_700Bold",
  },
  heroItalic: { color: palette.lime },
  heroCopy: {
    color: "#deded5",
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 12,
    marginTop: 8,
    marginBottom: 16,
  },
  primaryButton: {
    alignSelf: "flex-start",
    height: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: 5,
    backgroundColor: palette.lime,
  },
  primaryText: {
    color: "#151910",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 12,
  },
  frameTag: {
    position: "absolute",
    top: 15,
    right: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(12,15,12,0.65)",
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 3,
  },
  frameTagText: {
    color: palette.text,
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 8,
    letterSpacing: 0.8,
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginTop: 27,
    marginBottom: 12,
  },
  sectionTitle: {
    color: palette.text,
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 17,
  },
  sectionMeta: {
    color: "#6e766d",
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 9,
  },
  startGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  startTile: {
    width: "48%",
    minHeight: 103,
    backgroundColor: palette.panel,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 6,
    padding: 12,
  },
  tileIcon: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 16,
    marginBottom: 8,
  },
  tileTitle: {
    color: palette.text,
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 13,
  },
  tileSub: {
    color: palette.muted,
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 10,
    marginTop: 3,
  },
  tilePlus: { position: "absolute", top: 12, right: 12 },
  seeAll: {
    color: palette.lime,
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 11,
  },
  dubShortcut: { minHeight: 61, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 11, backgroundColor: "#191e19", borderWidth: 1, borderColor: "#2b312b", borderRadius: 5 },
  dubIcon: { width: 31, height: 31, alignItems: "center", justifyContent: "center", backgroundColor: "#30271f", borderRadius: 4 },
  dubTitle: { color: "#e8e8df", fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 10 },
  dubCopy: { color: "#92998e", fontFamily: "SpaceGrotesk_400Regular", fontSize: 8, marginTop: 3 },
  queueRow: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 8, borderTopWidth: 1, borderColor: "#292f28" },
  queueDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#d5f36a" },
  queueTitle: { color: "#daddd2", fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 9, textTransform: "capitalize" },
  queueMessage: { color: "#899186", fontFamily: "SpaceGrotesk_400Regular", fontSize: 8, marginTop: 2 },
  queueProgress: { color: "#d5f36a", fontFamily: "SpaceGrotesk_700Bold", fontSize: 8 },
  queueEmpty: { minHeight: 39, flexDirection: "row", alignItems: "center", gap: 7, borderTopWidth: 1, borderColor: "#292f28" },
  queueEmptyText: { color: "#8e9689", fontFamily: "SpaceGrotesk_400Regular", fontSize: 9 },
  projectRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  projectThumb: {
    width: 45,
    height: 45,
    borderRadius: 5,
    backgroundColor: "#272d22",
    alignItems: "center",
    justifyContent: "center",
  },
  projectInfo: { flex: 1 },
  projectName: {
    color: palette.text,
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 13,
  },
  projectSub: {
    color: palette.muted,
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 10,
    marginTop: 3,
  },
  emptyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: palette.line,
    borderStyle: "dashed",
    borderRadius: 6,
  },
  emptyPlus: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#232b1c",
    borderRadius: 4,
  },
  emptyTitle: {
    color: palette.text,
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 12,
  },
  emptySub: {
    color: palette.muted,
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 10,
    marginTop: 3,
  },
  insight: {
    marginTop: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 13,
    backgroundColor: "#1b1d19",
    borderRadius: 5,
  },
  insightIcon: {
    width: 31,
    height: 31,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#30271f",
  },
  insightLabel: {
    color: palette.orange,
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 8,
    letterSpacing: 1,
  },
  insightText: {
    color: "#d9d8ce",
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    marginTop: 4,
  },
  footer: {
    textAlign: "center",
    color: "#596058",
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 8,
    letterSpacing: 1,
    marginTop: 24,
  },
});
