import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { api, type ApiWear } from '../../../lib/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// 2-column grid with padding & gap
const ITEM_CELL_SIZE = (SCREEN_WIDTH - 40 - 12) / 2;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateLong(wornOn: string): string {
  const [year, month, day] = wornOn.split('-').map(Number);
  const date = new Date(year!, month! - 1, day!);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateShort(wornOn: string): string {
  const [year, month, day] = wornOn.split('-').map(Number);
  const date = new Date(year!, month! - 1, day!);

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const stripTime = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const d = stripTime(date);
  const t = stripTime(today);
  const y = stripTime(yesterday);

  if (d.getTime() === t.getTime()) return 'Today';
  if (d.getTime() === y.getTime()) return 'Yesterday';
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatLoggedTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function WearDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [wear, setWear] = useState<ApiWear | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [wearingAgain, setWearingAgain] = useState(false);

  useEffect(() => {
    if (!id) return;
    api
      .getWear(id)
      .then(setWear)
      .catch(() => router.back())
      .finally(() => setLoading(false));
  }, [id]);

  function confirmDelete() {
    Alert.alert(
      'Delete wear?',
      'This will remove this entry from your history and adjust wear counts on your items.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!id) return;
            setDeleting(true);
            try {
              await api.deleteWear(id);
              router.back();
            } catch (err) {
              const msg = err instanceof Error ? err.message : 'Delete failed.';
              Alert.alert('Error', msg);
              setDeleting(false);
            }
          },
        },
      ],
    );
  }

  async function handleWearAgain() {
    if (!wear) return;
    const itemIds = (wear.items ?? []).map((i) => i.id);
    if (itemIds.length === 0) {
      Alert.alert('No items', 'This wear has no items to re-log.');
      return;
    }
    setWearingAgain(true);
    try {
      await api.logWear({ itemIds });
      router.back();
      // The log list will refresh via useFocusEffect when the screen re-focuses
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not log wear. Try again.';
      Alert.alert('Error', msg);
      setWearingAgain(false);
    }
  }

  // ── Loading / not found ───────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator color="#1a1a1a" />
        </View>
      </SafeAreaView>
    );
  }

  if (!wear) return null;

  const tempC = wear.weatherTempC != null ? Math.round(Number(wear.weatherTempC)) : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Nav bar */}
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.navBack} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#1a1a1a" />
        </TouchableOpacity>
        <Text style={styles.navTitle} numberOfLines={1}>
          {formatDateShort(wear.wornOn)}
        </Text>
        {/* Spacer to balance the back button */}
        <View style={styles.navSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Items worn ─── */}
        <View style={styles.section}>
          <SectionLabel>ITEMS WORN</SectionLabel>
          {(wear.items ?? []).length > 0 ? (
            <View style={styles.itemsGrid}>
              {(wear.items ?? []).map((item) => (
                <View key={item.id} style={[styles.itemCell, { width: ITEM_CELL_SIZE }]}>
                  <View style={styles.itemImageBox}>
                    <Image
                      source={{ uri: item.cutoutImageUrl ?? item.originalImageUrl }}
                      style={styles.itemImage}
                      contentFit="contain"
                    />
                  </View>
                  <Text style={styles.itemName} numberOfLines={2}>
                    {item.name ?? item.category ?? '—'}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyText}>No items recorded for this wear.</Text>
          )}
        </View>

        {/* ── Date & time ─── */}
        <View style={styles.section}>
          <SectionLabel>DATE & TIME</SectionLabel>
          <View style={styles.infoCard}>
            <Text style={styles.infoValue}>{formatDateLong(wear.wornOn)}</Text>
            <Text style={styles.infoSub}>Logged at {formatLoggedTime(wear.createdAt)}</Text>
          </View>
        </View>

        {/* ── Weather (optional) ─── */}
        {tempC != null ? (
          <View style={styles.section}>
            <SectionLabel>WEATHER</SectionLabel>
            <View style={styles.infoCard}>
              <View style={styles.weatherRow}>
                <Ionicons name="thermometer-outline" size={20} color="#6b6b6b" />
                <Text style={styles.infoValue}>{tempC}°C</Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* ── Note (optional) ─── */}
        {wear.note ? (
          <View style={styles.section}>
            <SectionLabel>NOTE</SectionLabel>
            <View style={styles.infoCard}>
              <Text style={styles.noteText}>{wear.note}</Text>
            </View>
          </View>
        ) : null}

        {/* ── Actions ─── */}
        <View style={styles.actions}>
          {/* Wear again */}
          <TouchableOpacity
            style={[styles.wearAgainBtn, (wearingAgain || deleting) && styles.btnDisabled]}
            onPress={handleWearAgain}
            disabled={wearingAgain || deleting}
            activeOpacity={0.85}
          >
            {wearingAgain ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <Ionicons name="repeat" size={18} color="#ffffff" style={styles.btnIcon} />
                <Text style={styles.wearAgainBtnText}>Wear again</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Delete */}
          <TouchableOpacity
            style={[styles.deleteBtn, (deleting || wearingAgain) && styles.btnDisabled]}
            onPress={confirmDelete}
            disabled={deleting || wearingAgain}
            activeOpacity={0.8}
          >
            {deleting ? (
              <ActivityIndicator color="#dc2626" />
            ) : (
              <Text style={styles.deleteBtnText}>Delete wear</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#faf9f7',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Nav bar
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e8e5e0',
    backgroundColor: '#faf9f7',
  },
  navBack: {
    padding: 4,
    marginRight: 8,
  },
  navTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  navSpacer: {
    width: 40,
  },

  // Scroll
  scrollContent: {
    paddingBottom: 48,
  },

  // Section
  section: {
    paddingHorizontal: 20,
    marginTop: 24,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#a0a0a0',
    letterSpacing: 0.8,
    marginBottom: 10,
  },

  // Items grid (2-col)
  itemsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  itemCell: {
    alignItems: 'center',
    gap: 6,
  },
  itemImageBox: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 14,
    backgroundColor: '#f0eeec',
    overflow: 'hidden',
  },
  itemImage: {
    width: '100%',
    height: '100%',
  },
  itemName: {
    fontSize: 12,
    color: '#4a4a4a',
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#b0aba6',
    fontStyle: 'italic',
  },

  // Info card
  infoCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
    gap: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  infoSub: {
    fontSize: 13,
    color: '#a0a0a0',
    fontWeight: '400',
  },
  weatherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  noteText: {
    fontSize: 15,
    color: '#4a4a4a',
    lineHeight: 22,
    fontStyle: 'italic',
  },

  // Actions
  actions: {
    paddingHorizontal: 20,
    marginTop: 32,
    gap: 12,
  },
  btnIcon: {
    marginRight: 6,
  },
  wearAgainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  wearAgainBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  deleteBtn: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#dc2626',
  },
  deleteBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#dc2626',
  },
  btnDisabled: {
    opacity: 0.45,
  },
});
