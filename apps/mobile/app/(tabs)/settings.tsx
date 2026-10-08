import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ArrowUpRight, BadgeCheck, CircleHelp, Globe2, KeyRound, LogOut, Settings2, ShieldCheck, Trash2 } from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import { apiRequest, logout } from '@/lib/api';
import { clearLocalProjects } from '@/lib/storage';

interface StudioConfig {
  demoMode: boolean;
  providers: Record<string, { configured: boolean; mode: 'demo' | 'live' }>;
  queue: string;
  storage: { name: string; demo: boolean };
  plans: Record<string, { projects: number; maxResolution: string; watermark: boolean }>;
}
interface IntegrationConfig {
  accounts: Record<string, { configured: boolean; connected: boolean; publishing: boolean; message: string }>;
}

export default function SettingsScreen() {
  const router = useRouter();
  const [config, setConfig] = useState<StudioConfig | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setSignedIn(Boolean(await SecureStore.getItemAsync('storyflix.access-token')));
    try {
      const [studio, accounts] = await Promise.all([apiRequest<StudioConfig>('/v1/config'), apiRequest<IntegrationConfig>('/v1/integrations')]);
      setConfig(studio); setIntegrations(accounts); setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'API configuration is unavailable.');
    } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function signOut() {
    try { await logout(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Server sign-out failed; local credentials were removed.'); }
    setSignedIn(false);
    router.replace('/auth');
  }

  function deleteAccount() {
    Alert.alert('Delete account permanently?', 'Your server projects and account will be deleted. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete account', style: 'destructive', onPress: () => { void (async () => {
        try {
          await apiRequest('/v1/auth/account', { method: 'DELETE' });
          await clearLocalProjects();
          await logout().catch(() => undefined);
          setSignedIn(false);
          router.replace('/auth');
        } catch (cause) { Alert.alert('Account was not deleted', cause instanceof Error ? cause.message : 'Configure Supabase admin credentials on the API.'); }
      })(); } },
    ]);
  }

  return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <Text style={styles.eyebrow}>CINEFORGE AI</Text><Text style={styles.title}>Settings</Text>
    <View style={styles.mode}><View style={[styles.dot, config?.demoMode === false && styles.live]} /><View style={{ flex: 1 }}><Text style={styles.modeTitle}>{config?.demoMode === false ? 'Live providers connected' : 'Demo mode'}</Text><Text style={styles.modeDetail}>{config?.queue ?? 'Checking queue'} · {config?.storage.name ?? 'Storage status unavailable'}</Text></View>{loading ? <ActivityIndicator size="small" color="#d5f36a" /> : null}</View>
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <Text style={styles.section}>AI PROVIDERS</Text>
    {config ? Object.entries(config.providers).map(([name, provider]) => <View key={name} style={styles.row}><KeyRound size={15} color={provider.configured ? '#d5f36a' : '#9a8a70'} /><Text style={styles.providerName}>{name}</Text><Text style={[styles.state, provider.configured && styles.configured]}>{provider.configured ? 'CONFIGURED' : 'NOT CONFIGURED'}</Text></View>) : <Text style={styles.info}>Connect the API server to inspect provider configuration.</Text>}
    <Text style={styles.section}>CONNECTED ACCOUNTS</Text>
    {integrations ? Object.entries(integrations.accounts).map(([name, account]) => <View key={name} style={styles.account}><View style={styles.accountHead}><Globe2 size={15} color="#adb5a5" /><Text style={styles.accountName}>{name}</Text><Text style={[styles.state, account.configured && styles.configured]}>{account.connected ? 'CONNECTED' : account.configured ? 'READY FOR OAUTH' : 'NOT CONFIGURED'}</Text></View><Text style={styles.info}>{account.message}</Text></View>) : <Text style={styles.info}>Account integration states are unavailable.</Text>}
    <Text style={styles.section}>PLAN LIMITS</Text>
    {config?.plans ? Object.entries(config.plans).map(([name, plan]) => <View key={name} style={styles.row}><BadgeCheck size={15} color={name === 'PRO' ? '#d5f36a' : '#a6afa0'} /><Text style={styles.providerName}>{name}</Text><Text style={styles.info}>{plan.projects} projects · {plan.maxResolution}{plan.watermark ? ' · watermark' : ''}</Text></View>) : null}
    <Text style={styles.section}>ACCOUNT</Text>
    <Pressable style={styles.action} onPress={() => router.push('/auth')}><ShieldCheck size={16} color="#c4cabb" /><Text style={styles.actionText}>Sign in / Create account</Text><ArrowUpRight size={14} color="#828a7d" /></Pressable>
    <Pressable style={styles.action} onPress={() => router.push('/(tabs)/profile')}><Settings2 size={16} color="#c4cabb" /><Text style={styles.actionText}>Profile, credits & billing</Text><ArrowUpRight size={14} color="#828a7d" /></Pressable>
    {signedIn ? <>
      <Pressable style={styles.action} onPress={() => void signOut()}><LogOut size={16} color="#c4cabb" /><Text style={styles.actionText}>Sign out</Text><ArrowUpRight size={14} color="#828a7d" /></Pressable>
      <Pressable style={styles.action} onPress={deleteAccount}><Trash2 size={16} color="#d99a83" /><Text style={[styles.actionText, { color: '#d99a83' }]}>Delete account</Text><ArrowUpRight size={14} color="#828a7d" /></Pressable>
    </> : null}
    <View style={styles.note}><CircleHelp size={14} color="#99a28f" /><Text style={styles.info}>Publishing stays disabled until the platform grants official API approval.</Text></View>
  </ScrollView>;
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: '#101310' }, content: { padding: 20, paddingTop: 28, paddingBottom: 38 }, eyebrow: { color: '#d5f36a', fontFamily: 'SpaceGrotesk_700Bold', fontSize: 9, letterSpacing: 1.1 }, title: { color: '#f1f0e8', fontFamily: 'SpaceGrotesk_700Bold', fontSize: 29, marginTop: 5 }, mode: { minHeight: 59, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20, paddingHorizontal: 12, backgroundColor: '#191e19', borderWidth: 1, borderColor: '#2b312b', borderRadius: 5 }, dot: { width: 8, height: 8, borderRadius: 5, backgroundColor: '#e0ab6d' }, live: { backgroundColor: '#d5f36a' }, modeTitle: { color: '#e9e8df', fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 11 }, modeDetail: { color: '#92998f', fontFamily: 'SpaceGrotesk_400Regular', fontSize: 8, marginTop: 3 }, error: { color: '#e0a48e', fontFamily: 'SpaceGrotesk_400Regular', fontSize: 9, marginTop: 9 }, section: { color: '#81897d', fontFamily: 'SpaceGrotesk_700Bold', fontSize: 8, letterSpacing: 1, marginTop: 24, marginBottom: 8 }, row: { minHeight: 41, flexDirection: 'row', alignItems: 'center', gap: 9, borderTopWidth: 1, borderColor: '#282e27' }, providerName: { flex: 1, color: '#dadcd2', fontFamily: 'SpaceGrotesk_500Medium', fontSize: 10, textTransform: 'capitalize' }, state: { color: '#bca17f', fontFamily: 'SpaceGrotesk_700Bold', fontSize: 7, letterSpacing: 0.4 }, configured: { color: '#d5f36a' }, info: { color: '#939a8f', fontFamily: 'SpaceGrotesk_400Regular', fontSize: 9, lineHeight: 14 }, account: { paddingVertical: 10, borderTopWidth: 1, borderColor: '#282e27' }, accountHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 }, accountName: { flex: 1, color: '#d9dbd1', fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 10, textTransform: 'capitalize' }, action: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderColor: '#282e27' }, actionText: { flex: 1, color: '#daddd2', fontFamily: 'SpaceGrotesk_500Medium', fontSize: 10 }, note: { flexDirection: 'row', gap: 8, marginTop: 20 }, });