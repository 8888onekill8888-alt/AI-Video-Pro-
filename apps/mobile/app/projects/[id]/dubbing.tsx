import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { ArrowLeft, AudioLines, Check, CircleAlert, FileVideo, Languages, Play, Upload } from 'lucide-react-native';
import type { GenerationJob } from '@storyflix/shared';
import { apiRequest, uploadDubbingVideo } from '@/lib/api';
import { getLocalProjects, type LocalProject } from '@/lib/storage';

const languages = ['English', 'Vietnamese', 'Chinese', 'Japanese', 'Korean', 'Spanish', 'French', 'German', 'Portuguese', 'Thai', 'Indonesian', 'Hindi', 'Arabic'];
const speeds = [0.8, 1, 1.2, 1.5];
interface VoiceCatalog { configured: boolean; defaultVoiceId: string; voices: Array<{ id: string; name: string; language?: string }> }

export default function DubbingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<LocalProject | null>(null);
  const [video, setVideo] = useState<{ uri: string; name: string; mimeType?: string; size?: number } | null>(null);
  const [sourceLanguage, setSourceLanguage] = useState('English');
  const [targetLanguage, setTargetLanguage] = useState('Vietnamese');
  const [voice, setVoice] = useState('');
  const [speed, setSpeed] = useState(1);
  const [subtitles, setSubtitles] = useState(true);
  const [catalog, setCatalog] = useState<VoiceCatalog | null>(null);
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const found = (await getLocalProjects()).find((item) => item.id === id) ?? null;
    setProject(found);
    try {
      const data = await apiRequest<VoiceCatalog>('/v1/voices');
      setCatalog(data);
      setVoice((current) => current || data.defaultVoiceId || data.voices[0]?.id || '');
    } catch {
      setCatalog({ configured: false, defaultVoiceId: '', voices: [] });
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!job || !['QUEUED', 'PROCESSING'].includes(job.status)) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const response = await apiRequest<{ job: GenerationJob }>(`/v1/jobs/${job.id}`);
        if (!active) return;
        setJob(response.job);
        if (response.job.status === 'COMPLETED') {
          const result = response.job.result as { available?: boolean; message?: string } | undefined;
          if (result?.available === false) setError(result.message ?? 'Dubbing providers are not configured.');
          else Alert.alert('Dubbing complete', 'The translated audio and subtitle assets are ready.');
        } else if (response.job.status === 'FAILED') setError(response.job.error ?? 'The dubbing job failed.');
        else timer = setTimeout(() => void poll(), 2_000);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not refresh job status.');
      }
    };
    timer = setTimeout(() => void poll(), 1_000);
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [job]);

  async function chooseVideo() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['video/mp4', 'video/quicktime', 'video/webm'], copyToCacheDirectory: true, multiple: false });
      const asset = result.assets?.[0];
      if (!result.canceled && asset) setVideo({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType, size: asset.size });
    } catch (cause) { Alert.alert('Could not open video', cause instanceof Error ? cause.message : 'Choose an MP4, MOV or WebM file.'); }
  }

  async function startDubbing() {
    if (!project || !video) {
      Alert.alert('Choose a source video', 'Select the video you want to translate and dub.');
      return;
    }
    if (sourceLanguage === targetLanguage) {
      Alert.alert('Choose another target language', 'The source and target languages must be different.');
      return;
    }
    if (id.startsWith('demo-')) {
      setError('This project exists only on this device. Connect the API and open a server-saved project to upload a source video.');
      return;
    }
    setBusy(true); setError(''); setJob(null);
    try {
      const result = await uploadDubbingVideo(video, { projectId: id, sourceLanguage, targetLanguage, voice, speed, subtitles });
      if (result.job) setJob(result.job as GenerationJob);
      setAvailable(Boolean(result.providerConfigured));
      if (!result.providerConfigured) setError('Job queued in Demo Mode. OpenAI transcription and ElevenLabs voice are not configured; no dubbed media will be produced.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not submit dubbing job.');
    } finally { setBusy(false); }
  }

  const working = busy || Boolean(job && ['QUEUED', 'PROCESSING'].includes(job.status));
  return <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Pressable style={styles.back} onPress={() => router.back()}><ArrowLeft size={18} color="#e9e8df" /><Text style={styles.backText}>PROJECT</Text></Pressable>
    <Text style={styles.eyebrow}>LOCALIZATION STUDIO</Text><Text style={styles.title}>Dub this film</Text><Text style={styles.subtitle}>{project?.title ?? 'Loading project'} · Original video stays unchanged</Text>

    <Pressable style={styles.upload} onPress={() => void chooseVideo()}>
      {video ? <FileVideo size={22} color="#d5f36a" /> : <Upload size={21} color="#d5f36a" />}
      <View style={{ flex: 1 }}><Text style={styles.uploadTitle}>{video?.name ?? 'Choose source video'}</Text><Text style={styles.uploadHint}>{video ? `${video.size ? `${(video.size / 1_048_576).toFixed(1)} MB · ` : ''}${video.mimeType ?? 'Video'}` : 'MP4, MOV or WebM · Up to 250 MB'}</Text></View>
      {video ? <Check size={16} color="#d5f36a" /> : null}
    </Pressable>

    <View style={styles.languagePanel}>
      <View style={styles.languageHead}><Languages size={15} color="#d5f36a" /><Text style={styles.sectionTitle}>LANGUAGES</Text></View>
      <Text style={styles.label}>SOURCE</Text><View style={styles.chips}>{languages.map((item) => <Pressable key={`source-${item}`} onPress={() => setSourceLanguage(item)} style={[styles.chip, sourceLanguage === item && styles.chipActive]}><Text style={[styles.chipText, sourceLanguage === item && styles.chipTextActive]}>{item}</Text></Pressable>)}</View>
      <Text style={styles.label}>TARGET</Text><View style={styles.chips}>{languages.filter((item) => item !== sourceLanguage).map((item) => <Pressable key={`target-${item}`} onPress={() => setTargetLanguage(item)} style={[styles.chip, targetLanguage === item && styles.chipActive]}><Text style={[styles.chipText, targetLanguage === item && styles.chipTextActive]}>{item}</Text></Pressable>)}</View>
    </View>

    <Text style={styles.label}>VOICE ID</Text>
    {catalog?.voices.length ? <View style={styles.chips}>{catalog.voices.map((item) => <Pressable key={item.id} onPress={() => setVoice(item.id)} style={[styles.chip, voice === item.id && styles.chipActive]}><Text style={[styles.chipText, voice === item.id && styles.chipTextActive]}>{item.name}</Text></Pressable>)}</View> : <Text style={styles.stateNote}>{catalog?.configured ? 'No voice catalog supplied. Enter an approved ElevenLabs voice ID.' : 'ElevenLabs is not configured. A voice ID alone cannot activate the provider.'}</Text>}
    <TextInput value={voice} onChangeText={setVoice} placeholder="ElevenLabs voice ID" placeholderTextColor="#737b70" style={styles.input} autoCapitalize="none" />
    <Text style={[styles.label, { marginTop: 18 }]}>SPEECH SPEED</Text><View style={styles.chips}>{speeds.map((item) => <Pressable key={item} onPress={() => setSpeed(item)} style={[styles.chip, speed === item && styles.chipActive]}><Text style={[styles.chipText, speed === item && styles.chipTextActive]}>{item.toFixed(1)}×</Text></Pressable>)}</View>
    <Pressable style={styles.subtitleToggle} onPress={() => setSubtitles((value) => !value)}><View style={[styles.checkbox, subtitles && styles.checked]}>{subtitles ? <Check size={12} color="#151910" /> : null}</View><Text style={styles.toggleTitle}>Generate translated SRT subtitles</Text></Pressable>

    {job ? <View style={styles.job}>
      <View style={styles.jobHead}><AudioLines size={15} color="#d5f36a" /><Text style={styles.jobTitle}>{job.status === 'COMPLETED' ? 'Dubbing job finished' : `Dubbing · ${job.status.toLowerCase()}`}</Text><Text style={styles.percent}>{job.progress}%</Text></View>
      <View style={styles.progress}><View style={[styles.progressFill, { width: `${Math.max(2, job.progress)}%` }]} /></View>
      <Text style={styles.jobMessage}>{job.message}</Text>
      {job.status === 'FAILED' && job.error ? <Text style={styles.error}>{job.error}</Text> : null}
      {available === false ? <Text style={styles.warning}>No media was generated. Configure the listed providers and Redis worker.</Text> : null}
    </View> : null}
    {error ? <View style={styles.errorBox}><CircleAlert size={15} color="#e3a18e" /><Text style={styles.error}>{error}</Text></View> : null}
    {catalog && (!catalog.configured || !catalog.voices.length) ? <Text style={styles.configuration}>Provider status: ElevenLabs {catalog.configured ? 'configured; voice catalog empty' : 'not configured'}{catalog?.configured ? '' : ' · OpenAI transcription/translation must also be configured'}</Text> : null}
    <Pressable style={[styles.submit, working && styles.disabled]} onPress={() => void startDubbing()} disabled={working}>{working ? <ActivityIndicator color="#151910" /> : <><Play size={15} color="#151910" fill="#151910" /><Text style={styles.submitText}>Start dubbing job</Text></>}</Pressable>
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#101310' }, content: { padding: 20, paddingTop: 18, paddingBottom: 40 }, back: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 25 }, backText: { color: '#a2a89f', fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 9, letterSpacing: 1 }, eyebrow: { color: '#d5f36a', fontFamily: 'SpaceGrotesk_700Bold', fontSize: 8, letterSpacing: 1.1 }, title: { color: '#f1f0e8', fontFamily: 'SpaceGrotesk_700Bold', fontSize: 27, marginTop: 4 }, subtitle: { color: '#969e91', fontFamily: 'SpaceGrotesk_400Regular', fontSize: 10, marginTop: 5, marginBottom: 18 }, upload: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12, backgroundColor: '#1a2019', borderWidth: 1, borderColor: '#35402f', borderRadius: 5 }, uploadTitle: { color: '#e5e7dd', fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 10 }, uploadHint: { color: '#959c91', fontFamily: 'SpaceGrotesk_400Regular', fontSize: 8, marginTop: 4 }, languagePanel: { marginTop: 20 }, languageHead: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 12 }, sectionTitle: { color: '#c4cabb', fontFamily: 'SpaceGrotesk_700Bold', fontSize: 8, letterSpacing: 1 }, label: { color: '#acb4a7', fontFamily: 'SpaceGrotesk_700Bold', fontSize: 8, letterSpacing: 0.8, marginBottom: 7 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 13 }, chip: { paddingHorizontal: 9, paddingVertical: 7, borderRadius: 4, borderWidth: 1, borderColor: '#343b32', backgroundColor: '#191e19' }, chipActive: { backgroundColor: '#d5f36a', borderColor: '#d5f36a' }, chipText: { color: '#adb3a8', fontFamily: 'SpaceGrotesk_500Medium', fontSize: 8 }, chipTextActive: { color: '#151910' }, input: { minHeight: 41, color: '#efeee6', paddingHorizontal: 12, backgroundColor: '#191e19', borderWidth: 1, borderColor: '#2d342c', borderRadius: 4, fontFamily: 'SpaceGrotesk_400Regular', fontSize: 11 }, stateNote: { color: '#a5a999', fontFamily: 'SpaceGrotesk_400Regular', fontSize: 9, lineHeight: 14, marginBottom: 8 }, subtitleToggle: { minHeight: 43, flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 9 }, checkbox: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#606858', borderRadius: 3 }, checked: { backgroundColor: '#d5f36a', borderColor: '#d5f36a' }, toggleTitle: { color: '#d8dbd1', fontFamily: 'SpaceGrotesk_500Medium', fontSize: 10 }, job: { marginTop: 14, padding: 12, backgroundColor: '#191e19', borderWidth: 1, borderColor: '#30372e', borderRadius: 5 }, jobHead: { flexDirection: 'row', alignItems: 'center', gap: 8 }, jobTitle: { flex: 1, color: '#e7e8df', fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 10 }, percent: { color: '#d5f36a', fontFamily: 'SpaceGrotesk_700Bold', fontSize: 9 }, progress: { height: 4, backgroundColor: '#343b32', borderRadius: 2, marginTop: 10 }, progressFill: { height: 4, backgroundColor: '#d5f36a', borderRadius: 2 }, jobMessage: { color: '#9ca396', fontFamily: 'SpaceGrotesk_400Regular', fontSize: 8, marginTop: 7 }, warning: { color: '#d9bb89', fontFamily: 'SpaceGrotesk_500Medium', fontSize: 8, lineHeight: 13, marginTop: 7 }, errorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 12 }, error: { flex: 1, color: '#e3a18e', fontFamily: 'SpaceGrotesk_400Regular', fontSize: 9, lineHeight: 14 }, configuration: { color: '#8f978b', fontFamily: 'SpaceGrotesk_400Regular', fontSize: 8, lineHeight: 12, marginTop: 8 }, submit: { minHeight: 46, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 18, backgroundColor: '#d5f36a', borderRadius: 4 }, disabled: { opacity: 0.6 }, submitText: { color: '#151910', fontFamily: 'SpaceGrotesk_700Bold', fontSize: 11 },
});