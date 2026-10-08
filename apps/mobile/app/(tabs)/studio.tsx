import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AudioLines, Clapperboard, Film, Image as ImageIcon, UsersRound } from 'lucide-react-native';
import { getLocalProjects, type LocalProject } from '@/lib/storage';

const tools = [
  { id: 'characters', title: 'Characters', detail: 'Character profiles & continuity', Icon: UsersRound, route: (id: string) => `/projects/${id}/bible/characters`, color: '#d5f36a' },
  { id: 'storyboard', title: 'Storyboard', detail: 'Frames, shots & scene order', Icon: ImageIcon, route: (id: string) => `/projects/${id}/storyboard`, color: '#83d3bd' },
  { id: 'dubbing', title: 'Dubbing', detail: 'Translate and sync character voices', Icon: AudioLines, route: (id: string) => `/projects/${id}/dubbing`, color: '#e9a885' },
  { id: 'render', title: 'Render', detail: 'Compose timeline and export MP4', Icon: Clapperboard, route: (id: string) => `/projects/${id}/render`, color: '#b3a6ff' },
];

export default function StudioScreen() {
  const router = useRouter();
  const [projects, setProjects] = useState<LocalProject[]>([]);
  useFocusEffect(useCallback(() => { void getLocalProjects().then(setProjects); }, []));
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>CINEFORGE WORKSPACE</Text>
      <Text style={styles.title}>Production studio</Text>
      <Text style={styles.subtitle}>Choose a film, then jump to the part of production you want to shape.</Text>
      {projects.length ? projects.map((project) => (
        <View key={project.id} style={styles.project}>
          <Pressable style={styles.projectHeading} onPress={() => router.push(`/projects/${project.id}`)}>
            <View style={styles.filmIcon}><Film size={16} color="#d5f36a" /></View>
            <View style={{ flex: 1 }}><Text style={styles.projectTitle}>{project.title}</Text><Text style={styles.projectMeta}>{project.genre} · {project.status}</Text></View>
          </Pressable>
          <View style={styles.tools}>{tools.map(({ id, title, detail, Icon, route, color }) => (
            <Pressable key={id} onPress={() => router.push(route(project.id))} style={styles.tool}>
              <View style={[styles.toolIcon, { backgroundColor: `${color}17` }]}><Icon size={17} color={color} /></View>
              <View style={{ flex: 1 }}><Text style={styles.toolTitle}>{title}</Text><Text style={styles.toolDetail}>{detail}</Text></View>
            </Pressable>
          ))}</View>
        </View>
      )) : (
        <View style={styles.empty}><Film size={24} color="#9aa48d" /><Text style={styles.emptyTitle}>Your studio is ready</Text><Text style={styles.emptyCopy}>Create a project to open character, storyboard, dubbing and render tools.</Text><Pressable style={styles.button} onPress={() => router.push('/(tabs)/create')}><Text style={styles.buttonText}>New movie</Text></Pressable></View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: '#101310' }, content: { padding: 20, paddingTop: 28, paddingBottom: 40 }, eyebrow: { color: '#d5f36a', fontFamily: 'SpaceGrotesk_700Bold', fontSize: 9, letterSpacing: 1.2 }, title: { color: '#f1f0e8', fontFamily: 'SpaceGrotesk_700Bold', fontSize: 27, marginTop: 6 }, subtitle: { color: '#9ba197', fontFamily: 'SpaceGrotesk_400Regular', fontSize: 11, lineHeight: 17, marginTop: 6, marginBottom: 22 }, project: { borderTopWidth: 1, borderColor: '#30372e', paddingTop: 14, paddingBottom: 10 }, projectHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 10 }, filmIcon: { width: 34, height: 34, borderRadius: 4, backgroundColor: '#22291e', alignItems: 'center', justifyContent: 'center' }, projectTitle: { color: '#efeee7', fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 13 }, projectMeta: { color: '#8f978b', fontFamily: 'SpaceGrotesk_400Regular', fontSize: 9, marginTop: 2 }, tools: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, tool: { width: '48%', minHeight: 71, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 9, backgroundColor: '#191e19', borderWidth: 1, borderColor: '#2b312b', borderRadius: 4 }, toolIcon: { width: 30, height: 30, borderRadius: 4, alignItems: 'center', justifyContent: 'center' }, toolTitle: { color: '#e5e6dd', fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 10 }, toolDetail: { color: '#92998f', fontFamily: 'SpaceGrotesk_400Regular', fontSize: 8, lineHeight: 11, marginTop: 3 }, empty: { alignItems: 'center', paddingVertical: 58, paddingHorizontal: 22, borderTopWidth: 1, borderColor: '#30372e' }, emptyTitle: { color: '#f0efe7', fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 14, marginTop: 14 }, emptyCopy: { color: '#979e93', fontFamily: 'SpaceGrotesk_400Regular', fontSize: 10, textAlign: 'center', lineHeight: 16, marginTop: 7 }, button: { marginTop: 17, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#d5f36a', borderRadius: 4 }, buttonText: { color: '#151910', fontFamily: 'SpaceGrotesk_700Bold', fontSize: 10 } });