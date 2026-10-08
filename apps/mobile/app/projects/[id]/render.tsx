import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Check, Clapperboard, Download, Film, Gauge, MonitorPlay } from 'lucide-react-native';
import type { GenerationJob } from '@storyflix/shared';
import { apiRequest } from '@/lib/api';
import { getLocalProjects, saveLocalProject, type LocalProject } from '@/lib/storage';

const resolutions = ['720p', '1080p', '4k'] as const;
const presets = [
  { id: 'youtube', label: 'YouTube', ratio: '16:9' },
  { id: 'tiktok', label: 'TikTok', ratio: '9:16' },
  { id: 'reels', label: 'Instagram', ratio: '9:16' },
  { id: 'square', label: 'Instagram square', ratio: '1:1' },
  { id: 'cinema', label: 'Cinema', ratio: '16:9' },
] as const;

export default function RenderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<LocalProject | null>(null);
  const [resolution, setResolution] = useState<LocalProject['resolution']>('720p');
  const [preset, setPreset] = useState<(typeof presets)[number]['id']>('youtube');
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [estimatedCredits, setEstimatedCredits] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const found = (await getLocalProjects()).find((item) => item.id === id) ?? null;
    setProject(found);
    if (found?.resolution) setResolution(found.resolution);
    try {
      const estimate = await apiRequest<{ estimatedCredits: number }>('/v1/credits/estimate', { method: 'POST', body: JSON.stringify({ operation: 'RENDER', units: 1 }) });
      setEstimatedCredits(estimate.estimatedCredits);
    } catch { setEstimatedCredits(null); }
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
          const result = response.job.result as { demo?: boolean; message?: string; filename?: string; url?: string; resolution?: string } | undefined;
          const hasMedia = Boolean(result?.url || result?.filename);
          const next: LocalProject = {
            ...(project as LocalProject),
            status: hasMedia ? 'COMPLETED' : 'IN_PRODUCTION',
            exportResult: { id: response.job.id, format: 'mp4', resolution: result?.resolution ?? resolution ?? '720p', demo: result?.demo ?? true, status: 'COMPLETED', label: result?.message ?? (hasMedia ? 'Rendered MP4' : 'Demo job complete · no MP4 was rendered'), url: result?.url },
          };
          await saveLocalProject(next);
          setProject(next);
          setError(hasMedia ? '' : result?.message ?? 'The demo job did not create a video file. Configure a Redis worker, FFmpeg and persistent storage for MP4 export.');
        } else if (response.job.status === 'FAILED') setError(response.job.error ?? 'The render job failed.');
        else timer = setTimeout(() => void poll(), 2_000);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not refresh the render job.');
      }
    };
    timer = setTimeout(() => void poll(), 1_000);
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [job, project, resolution]);

  async function render() {
    if (!project) return;
    if (!project.scenes?.length) {
      setError('Generate screenplay scenes before starting a render.');
      return;
    }
    if (id.startsWith('demo-')) {
      setError('This project is stored only on this device. Connect the API, Redis worker, FFmpeg and storage to create an MP4. No local demo file was fabricated.');
      return;
    }
    setBusy(true); setError('');
    try {
      const selectedPreset = presets.find((item) => item.id === preset) ?? presets[0];
      const response = await apiRequest<{ job: GenerationJob; estimatedCredits: number }>(`/v1/projects/${id}/export`, {
        method: 'POST',
        body: JSON.stringify({ resolution, preset, format: 'mp4', aspectRatio: selectedPreset.ratio }),
      });
      setJob(response.job); setEstimatedCredits(response.estimatedCredits);
      if (response.job.status === 'COMPLETED') {
        const result = response.job.result as { message?: string; url?: string; demo?: boolean } | undefined;
        if (!result?.url) setError(result?.message ?? 'The configured queue did not produce an MP4.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not queue the render.');
    } finally { setBusy(false); }
  }

  const selectedPreset = presets.find((item) => item.id === preset) ?? presets[0];
  const working = busy || Boolean(job && ['QUEUED', 'PROCESSING'].includes(job.status));
  const output = project?.exportResult;
  return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <Pressable style={styles.back} onPress={() => router.back()}><ArrowLeft size={18} color="#e9e8df" /><Text style={styles.backLabel}>PROJECT</Text></Pressable>
    <Text style={styles.eyebrow}>FINAL DELIVERY</Text><Text style={styles.title}>Render film</Text><Text style={styles.subtitle}>{project?.title ?? 'Loading project'} · {project?.scenes?.length ?? 0} scenes</Text>
    <View style={styles.preview}><View style={styles.previewIcon}><MonitorPlay size={23} color="#d5f36a" /></View><Text style={styles.previewTitle}>{selectedPreset.label}</Text><Text style={styles.previewMeta}>{selectedPreset.ratio} · {project?.durationSeconds ? `${Math.ceil(project.durationSeconds / 60)} min target` : 'MP4'}</Text></View>
    <Text style={styles.section}>PLATFORM PRESET</Text><View style={styles.presets}>{presets.map((item) => <Pressable key={item.id} style={[styles.preset, preset === item.id && styles.presetActive]} onPress={() => setPreset(item.id)}><Text style={[styles.presetTitle, preset === item.id && styles.selectedText]}>{item.label}</Text><Text style={[styles.presetMeta, preset === item.id && styles.selectedText]}>{item.ratio}</Text></Pressable>)}</View>
    <Text style={styles.section}>RESOLUTION</Text><View style={styles.chips}>{resolutions.map((item) => <Pressable key={item} onPress={() => setResolution(item)} style={[styles.chip, resolution === item && styles.chipActive]}><Text style={[styles.chipText, resolution === item && styles.chipTextActive]}>{item.toUpperCase()}</Text></Pressable>)}</View>
    <View style={styles.spec}><View style={styles.specIcon}><Gauge size={15} color="#d5f36a" /></View><View style={{ flex: 1 }}><Text style={styles.specTitle}>24 FPS · H.264 · AAC</Text><Text style={styles.specMeta}>FFmpeg render runs asynchronously on the worker</Text></View><Film size={14} color="#8f988a" /></View>
    {estimatedCredits !== null ? <Text style={styles.estimate}>Estimated cost <Text style={styles.estimateValue}>{estimatedCredits} credits</Text></Text> : <Text style={styles.estimate}>Credit estimate unavailable until the API is connected.</Text>}
    {job ? <View style={styles.job}><View style={styles.jobHead}><Clapperboard size={14} color="#d5f36a" /><Text style={styles.jobTitle}>{job.status} · {job.progress}%</Text><Text style={styles.jobTime}>{job.message}</Text></View><View style={styles.progress}><View style={[styles.progressFill, { width: `${Math.max(2, job.progress)}%` }]} /></View></View> : null}
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {output ? <View style={styles.output}><Check size={15} color={output.url ? '#d5f36a' : '#d0a06f'} /><View style={{ flex: 1 }}><Text style={styles.outputTitle}>{output.url ? 'MP4 output ready' : 'No video file produced'}</Text><Text style={styles.outputDetail}>{output.label}</Text></View>{output.url ? <Pressable onPress={() => Alert.alert('Signed video', output.url ?? '')}><Download size={15} color="#d5f36a" /></Pressable> : null}</View> : null}
    <Pressable style={[styles.submit, working && styles.disabled]} onPress={() => void render()} disabled={working}>{working ? <ActivityIndicator color="#151910" /> : <><Clapperboard size={15} color="#151910" /><Text style={styles.submitText}>Queue render</Text></>}</Pressable>
    {project?.exportResult?.url ? <Pressable style={styles.openEditor} onPress={() => router.push(`/editor/${id}`)}><Text style={styles.openEditorText}>Back to timeline editor</Text></Pressable> : null}
  </ScrollView>;
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: '#101310' }, content: { padding: 20, paddingTop: 18, paddingBottom: 40 }, back: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 25 }, backLabel: { color: '#9ea597', fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 8, letterSpacing: 1 }, eyebrow: { color: '#d5f36a', fontFamily: 'SpaceGrotesk_700Bold', fontSize: 8, letterSpacing: 1 }, title: { color: '#f1f0e8', fontFamily: 'SpaceGrotesk_700Bold', fontSize: 28, marginTop: 4 }, subtitle: { color: '#959d91', fontFamily: 'SpaceGrotesk_400Regular', fontSize: 10, marginTop: 5 }, preview: { height: 147, alignItems: 'center', justifyContent: 'center', marginTop: 18, backgroundColor: '#202820', borderRadius: 5 }, previewIcon: { width: 45, height: 45, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: '#303b29' }, previewTitle: { color: '#e9eae1', fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 11, marginTop: 9 }, previewMeta: { color: '#9aa294', fontFamily: 'SpaceGrotesk_400Regular', fontSize: 9, marginTop: 3 }, section: { color: '#8f978b', fontFamily: 'SpaceGrotesk_700Bold', fontSize: 8, letterSpacing: 0.9, marginTop: 23, marginBottom: 9 }, presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, preset: { minWidth: '31%', paddingVertical: 9, paddingHorizontal: 9, backgroundColor: '#191e19', borderWidth: 1, borderColor: '#31382f', borderRadius: 4 }, presetActive: { backgroundColor: '#d5f36a', borderColor: '#d5f36a' }, presetTitle: { color: '#c2c8bb', fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 9 }, presetMeta: { color: '#939b8d', fontFamily: 'SpaceGrotesk_400Regular', fontSize: 8, marginTop: 4 }, selectedText: { color: '#151910' }, chips: { flexDirection: 'row', gap: 7 }, chip: { minWidth: 58, alignItems: 'center', paddingHorizontal: 11, paddingVertical: 8, backgroundColor: '#191e19', borderWidth: 1, borderColor: '#333a32', borderRadius: 4 }, chipActive: { backgroundColor: '#d5f36a', borderColor: '#d5f36a' }, chipText: { color: '#aeb4a8', fontFamily: 'SpaceGrotesk_500Medium', fontSize: 9 }, chipTextActive: { color: '#151910' }, spec: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20, paddingHorizontal: 11, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#2a3129' }, specIcon: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: '#22291e', borderRadius: 4 }, specTitle: { color: '#dfe0d7', fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 9 }, specMeta: { color: '#91998e', fontFamily: 'SpaceGrotesk_400Regular', fontSize: 8, marginTop: 3 }, estimate: { color: '#939a90', fontFamily: 'SpaceGrotesk_400Regular', fontSize: 9, marginTop: 15 }, estimateValue: { color: '#d5f36a', fontFamily: 'SpaceGrotesk_700Bold' }, job: { marginTop: 14, padding: 11, backgroundColor: '#191e19', borderRadius: 4 }, jobHead: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' }, jobTitle: { color: '#dce0d6', fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 9 }, jobTime: { flex: 1, color: '#949b90', fontFamily: 'SpaceGrotesk_400Regular', fontSize: 8, textAlign: 'right' }, progress: { height: 4, marginTop: 8, backgroundColor: '#333a30', borderRadius: 2 }, progressFill: { height: 4, backgroundColor: '#d5f36a', borderRadius: 2 }, error: { color: '#e1a28f', fontFamily: 'SpaceGrotesk_400Regular', fontSize: 9, lineHeight: 14, marginTop: 10 }, output: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 13, padding: 10, backgroundColor: '#1b2119', borderRadius: 4 }, outputTitle: { color: '#e3e5da', fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 9 }, outputDetail: { color: '#959d90', fontFamily: 'SpaceGrotesk_400Regular', fontSize: 8, lineHeight: 12, marginTop: 3 }, submit: { minHeight: 45, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 18, backgroundColor: '#d5f36a', borderRadius: 4 }, disabled: { opacity: 0.65 }, submitText: { color: '#151910', fontFamily: 'SpaceGrotesk_700Bold', fontSize: 10 }, openEditor: { alignItems: 'center', padding: 12 }, openEditorText: { color: '#b5bcae', fontFamily: 'SpaceGrotesk_500Medium', fontSize: 9 } });