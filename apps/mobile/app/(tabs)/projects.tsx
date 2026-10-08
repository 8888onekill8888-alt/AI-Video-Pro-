import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { ArrowDownAZ, ArrowUpRight, Film, Plus, Search } from "lucide-react-native";
import { listProjects } from "@/lib/api";
import { getLocalProjects, type LocalProject } from "@/lib/storage";

export default function ProjectsScreen() {
  const router = useRouter();
  const [projects, setProjects] = useState<LocalProject[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"All" | "Draft" | "Rendering" | "Completed">("All");
  const [sortByTitle, setSortByTitle] = useState(false);
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
    }, []),
  );
  const visibleProjects = projects
    .filter((project) => project.title.toLowerCase().includes(query.trim().toLowerCase()))
    .filter((project) => filter === "All" || (filter === "Draft" ? project.status === "DRAFT" : filter === "Completed" ? project.status === "COMPLETED" : /RENDER|PROCESS/i.test(project.status)))
    .sort((left, right) => sortByTitle ? left.title.localeCompare(right.title) : right.updatedAt.localeCompare(left.updatedAt));
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.top}>
        <View>
          <Text style={styles.eyebrow}>YOUR WORKSPACE</Text>
          <Text style={styles.title}>Projects</Text>
        </View>
        <Pressable
          style={styles.add}
          onPress={() => router.push("/(tabs)/create")}
        >
          <Plus color="#151910" size={18} />
        </Pressable>
      </View>
      <View style={styles.count}>
        <Text style={styles.countNum}>
          {String(projects.length).padStart(2, "0")}
        </Text>
        <Text style={styles.countLabel}> FILMS IN DEVELOPMENT</Text>
      </View>
      <View style={styles.search}>
        <Search size={15} color="#8e9689" />
        <TextInput value={query} onChangeText={setQuery} placeholder="Search films" placeholderTextColor="#747c71" style={styles.searchInput} returnKeyType="search" />
        <Pressable onPress={() => setSortByTitle((value) => !value)} style={styles.sortButton} accessibilityLabel={`Sort by ${sortByTitle ? "recent" : "title"}`}>
          <ArrowDownAZ size={15} color={sortByTitle ? "#d5f36a" : "#9ca394"} />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {(["All", "Draft", "Rendering", "Completed"] as const).map((item) => <Pressable key={item} onPress={() => setFilter(item)} style={[styles.filter, filter === item && styles.filterActive]}><Text style={[styles.filterText, filter === item && styles.filterTextActive]}>{item}</Text></Pressable>)}
      </ScrollView>
      {visibleProjects.length ? (
        visibleProjects.map((project, index) => (
          <Pressable
            key={project.id}
            style={styles.project}
            onPress={() => router.push(`/projects/${project.id}`)}
          >
            <View
              style={[
                styles.poster,
                { backgroundColor: index % 2 ? "#24312a" : "#292a22" },
              ]}
            >
              <Film size={22} color="#d5f36a" />
              <Text style={styles.posterIndex}>
                S{String(index + 1).padStart(2, "0")}
              </Text>
            </View>
            <View style={styles.details}>
              <Text style={styles.name}>{project.title}</Text>
              <Text style={styles.meta}>
                {project.genre} · {project.format} ·{" "}
                {Math.round(project.durationSeconds / 60)} min
              </Text>
              <View style={styles.status}>
                <View style={styles.dot} />
                <Text style={styles.statusText}>{project.status}</Text>
              </View>
            </View>
            <ArrowUpRight size={17} color="#858b80" />
          </Pressable>
        ))
      ) : projects.length ? (
        <View style={styles.noResults}><Text style={styles.emptyTitle}>No matching films</Text><Text style={styles.emptyText}>Adjust the search or status filter.</Text></View>
      ) : (
        <View style={styles.empty}>
          <Film size={28} color="#79806f" />
          <Text style={styles.emptyTitle}>A blank slate, in the best way.</Text>
          <Text style={styles.emptyText}>
            Every great film begins with a story. Yours can start here.
          </Text>
          <Pressable
            style={styles.create}
            onPress={() => router.push("/(tabs)/create")}
          >
            <Text style={styles.createText}>Create your first film</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#101310" },
  content: { padding: 22, paddingTop: 28 },
  top: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
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
  add: {
    width: 38,
    height: 38,
    borderRadius: 5,
    backgroundColor: "#d5f36a",
    alignItems: "center",
    justifyContent: "center",
  },
  count: {
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: 22,
    marginBottom: 13,
  },
  countNum: {
    color: "#d5f36a",
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 19,
  },
  countLabel: {
    color: "#8a9187",
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 9,
    letterSpacing: 1,
  },
  search: { minHeight: 43, flexDirection: "row", alignItems: "center", gap: 9, marginTop: 8, paddingHorizontal: 11, backgroundColor: "#191e19", borderWidth: 1, borderColor: "#2b312b", borderRadius: 4 },
  searchInput: { flex: 1, height: 42, color: "#ecebe3", fontFamily: "SpaceGrotesk_400Regular", fontSize: 11 },
  sortButton: { width: 30, height: 32, alignItems: "center", justifyContent: "center" },
  filters: { gap: 7, paddingVertical: 11 },
  filter: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "#191e19", borderWidth: 1, borderColor: "#343b32", borderRadius: 4 },
  filterActive: { backgroundColor: "#d5f36a", borderColor: "#d5f36a" },
  filterText: { color: "#aeb4a8", fontFamily: "SpaceGrotesk_500Medium", fontSize: 8 },
  filterTextActive: { color: "#151910" },
  project: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: "#2b312b",
  },
  poster: {
    height: 73,
    width: 57,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  posterIndex: {
    color: "#929a87",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 8,
    marginTop: 6,
  },
  details: { flex: 1 },
  name: {
    color: "#f2f0e8",
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 14,
  },
  meta: {
    color: "#989e94",
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 10,
    marginTop: 5,
  },
  status: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 9 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#d5f36a" },
  statusText: {
    color: "#d5f36a",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 8,
    letterSpacing: 0.8,
  },
  empty: {
    alignItems: "center",
    paddingHorizontal: 30,
    paddingVertical: 75,
    borderTopWidth: 1,
    borderTopColor: "#2b312b",
    marginTop: 8,
  },
  noResults: { paddingVertical: 28, alignItems: "center", borderTopWidth: 1, borderColor: "#2b312b" },
  emptyTitle: {
    color: "#efeee7",
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 15,
    marginTop: 16,
    textAlign: "center",
  },
  emptyText: {
    color: "#999f96",
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
    marginTop: 8,
  },
  create: {
    marginTop: 20,
    paddingHorizontal: 17,
    paddingVertical: 11,
    backgroundColor: "#d5f36a",
    borderRadius: 4,
  },
  createText: {
    color: "#171a14",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 11,
  },
});
