import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import {
  api,
  type ApiSuggestedOutfit,
  type ApiWeather,
  type ScoreBreakdown,
} from '../../lib/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 40;

type Occasion = 'casual' | 'smart' | 'formal' | 'sporty';

const OCCASIONS: { value: Occasion; label: string; icon: string }[] = [
  { value: 'casual', label: 'Casual', icon: '👕' },
  { value: 'smart', label: 'Smart', icon: '👔' },
  { value: 'formal', label: 'Formal', icon: '🎩' },
  { value: 'sporty', label: 'Sporty', icon: '👟' },
];

const SLOT_ORDER = ['outerwear', 'top', 'bottom', 'dress', 'footwear', 'accessory'] as const;

// ── Weather helpers ──────────────────────────────────────────────────────────

function tempToEmoji(condition: string): string {
  switch (condition) {
    case 'clear': return '☀️';
    case 'cloudy': return '☁️';
    case 'foggy': return '🌫️';
    case 'drizzle':
    case 'rainy': return '🌧️';
    case 'snowy': return '❄️';
    case 'stormy': return '⛈️';
    default: return '🌤️';
  }
}

function formatTemp(c: number | null): string {
  if (c === null) return '—';
  return `${Math.round(c)}°C`;
}

// ── Score helpers ────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 80) return '#16a34a';
  if (score >= 60) return '#ca8a04';
  return '#dc2626';
}

function breakdownLabel(key: keyof ScoreBreakdown): string {
  switch (key) {
    case 'color': return 'Color harmony';
    case 'coherence': return 'Style coherence';
    case 'formality': return 'Formality';
    case 'pattern': return 'Pattern balance';
    case 'novelty': return 'Novelty';
  }
}

function reasoningLine(breakdown: ScoreBreakdown): string {
  const parts: string[] = [];
  if (breakdown.color >= 0.85) parts.push('Palette works well');
  else if (breakdown.color < 0.55) parts.push('Color clash risk');
  if (breakdown.coherence >= 0.8) parts.push('Cohesive style');
  if (breakdown.formality >= 0.85) parts.push('Consistent formality');
  else if (breakdown.formality < 0.5) parts.push('Formality mismatch');
  if (breakdown.pattern >= 0.9) parts.push('Clean pattern mix');
  if (breakdown.novelty >= 0.75) parts.push('Fresh picks');
  return parts.length > 0 ? parts.join(' · ') : 'Decent combination';
}

// ── Sub-components ───────────────────────────────────────────────────────────

function WeatherBadge({ weather }: { weather: ApiWeather }) {
  return (
    <View style={styles.weatherBadge}>
      <Text style={styles.weatherEmoji}>{tempToEmoji(weather.condition)}</Text>
      <Text style={styles.weatherTemp}>{formatTemp(weather.tempC)}</Text>
      <Text style={styles.weatherCondition}>
        {weather.condition.charAt(0).toUpperCase() + weather.condition.slice(1)}
      </Text>
    </View>
  );
}

function ScoreBar({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.scoreBarRow}>
      <Text style={styles.scoreBarLabel}>{label}</Text>
      <View style={styles.scoreBarTrack}>
        <View style={[styles.scoreBarFill, { width: `${Math.round(value * 100)}%` }]} />
      </View>
      <Text style={styles.scoreBarValue}>{Math.round(value * 100)}</Text>
    </View>
  );
}

function FlatLayGrid({ outfit }: { outfit: ApiSuggestedOutfit }) {
  const bySlot = new Map(outfit.items.map((i) => [i.slot, i.item]));
  const slots = SLOT_ORDER.filter((s) => bySlot.has(s));

  return (
    <View style={styles.flatLayGrid}>
      {slots.map((slot) => {
        const item = bySlot.get(slot)!;
        const imageUri = item.cutoutImageUrl ?? null;
        return (
          <View key={slot} style={styles.flatLayCell}>
            {imageUri ? (
              <Image
                source={{ uri: imageUri }}
                style={styles.flatLayImage}
                contentFit="contain"
                transition={200}
              />
            ) : (
              <View style={styles.flatLayPlaceholder}>
                <Text style={styles.flatLaySlotLabel}>{slot}</Text>
              </View>
            )}
            {item.name ? (
              <Text style={styles.flatLayItemName} numberOfLines={1}>
                {item.name}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function OutfitCard({
  outfit,
  index,
  total,
  onWear,
  onSave,
}: {
  outfit: ApiSuggestedOutfit;
  index: number;
  total: number;
  onWear: () => void;
  onSave: () => void;
}) {
  const [showBreakdown, setShowBreakdown] = useState(false);

  return (
    <View style={styles.card}>
      {/* Card header */}
      <View style={styles.cardHeader}>
        <Text style={styles.cardIndex}>
          {index + 1} of {total}
        </Text>
        <View style={styles.scorePill}>
          <Text style={[styles.scorePillText, { color: scoreColor(outfit.score) }]}>
            {Math.round(outfit.score)}
          </Text>
          <Text style={styles.scorePillSuffix}>/100</Text>
        </View>
      </View>

      {/* Flat-lay grid */}
      <FlatLayGrid outfit={outfit} />

      {/* Reasoning */}
      <Text style={styles.reasoningText}>{reasoningLine(outfit.breakdown)}</Text>

      {/* Breakdown toggle */}
      <Pressable
        style={styles.breakdownToggle}
        onPress={() => setShowBreakdown((v) => !v)}
      >
        <Text style={styles.breakdownToggleText}>
          {showBreakdown ? 'Hide breakdown' : 'See breakdown'}
        </Text>
        <Ionicons
          name={showBreakdown ? 'chevron-up' : 'chevron-down'}
          size={14}
          color="#6b6b6b"
        />
      </Pressable>

      {showBreakdown && (
        <View style={styles.breakdownPanel}>
          {(Object.keys(outfit.breakdown) as (keyof ScoreBreakdown)[]).map((k) => (
            <ScoreBar key={k} value={outfit.breakdown[k]} label={breakdownLabel(k)} />
          ))}
        </View>
      )}

      {/* Actions */}
      <View style={styles.cardActions}>
        <TouchableOpacity
          style={styles.actionBtnPrimary}
          activeOpacity={0.85}
          onPress={onWear}
        >
          <Text style={styles.actionBtnPrimaryText}>I'll wear this</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtnSecondary}
          activeOpacity={0.85}
          onPress={onSave}
        >
          <Ionicons name="bookmark-outline" size={18} color="#1a1a1a" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────

type ScreenState =
  | { phase: 'idle' }
  | { phase: 'loading-weather' }
  | { phase: 'no-location' }
  | { phase: 'ready'; weather: ApiWeather | null }
  | { phase: 'loading-suggestions'; weather: ApiWeather | null }
  | { phase: 'results'; weather: ApiWeather | null; outfits: ApiSuggestedOutfit[] }
  | { phase: 'empty'; weather: ApiWeather | null }
  | { phase: 'error'; message: string };

export default function Suggest() {
  const router = useRouter();
  const [state, setState] = useState<ScreenState>({ phase: 'idle' });
  const [occasion, setOccasion] = useState<Occasion>('casual');
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());

  useFocusEffect(
    useCallback(() => {
      loadWeather();
    }, []),
  );

  async function loadWeather() {
    setState({ phase: 'loading-weather' });
    try {
      const weather = await api.getWeather();
      setState({ phase: 'ready', weather });
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 422) {
        setState({ phase: 'no-location' });
      } else {
        // Weather failed but not due to missing location — proceed without it
        setState({ phase: 'ready', weather: null });
      }
    }
  }

  async function handleSuggest() {
    const weather =
      state.phase === 'ready' || state.phase === 'results' || state.phase === 'empty'
        ? state.weather
        : null;

    setState({ phase: 'loading-suggestions', weather });

    try {
      const result = await api.suggestOutfits({
        occasion,
        useWeather: weather !== null,
      });

      if (result.outfits.length === 0) {
        setState({ phase: 'empty', weather });
      } else {
        setState({ phase: 'results', weather, outfits: result.outfits });
        setSavedIds(new Set());
      }
    } catch {
      setState({ phase: 'error', message: 'Could not load suggestions. Is the API running?' });
    }
  }

  async function handleWear(outfit: ApiSuggestedOutfit, index: number) {
    try {
      const itemIds = outfit.items.map((i) => i.item.id);
      await api.logWear({ itemIds });
      Alert.alert('Logged!', 'Your outfit has been added to today\'s log.');
    } catch {
      Alert.alert('Error', 'Could not log wear. Try again.');
    }
  }

  async function handleSave(outfit: ApiSuggestedOutfit, index: number) {
    if (savedIds.has(index)) return;
    try {
      await api.saveOutfit({
        items: outfit.items.map((i) => ({ itemId: i.item.id, slot: i.slot })),
        source: 'ai_suggested',
      });
      setSavedIds((prev) => new Set(prev).add(index));
      Alert.alert('Saved!', 'Outfit added to your collection.');
    } catch {
      Alert.alert('Error', 'Could not save outfit. Try again.');
    }
  }

  const isLoading =
    state.phase === 'loading-weather' || state.phase === 'loading-suggestions';

  const weather =
    state.phase === 'ready' ||
    state.phase === 'results' ||
    state.phase === 'empty' ||
    state.phase === 'loading-suggestions'
      ? state.weather
      : null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Suggest</Text>
        {weather && <WeatherBadge weather={weather} />}
        {state.phase === 'loading-weather' && (
          <ActivityIndicator size="small" color="#a0a0a0" />
        )}
      </View>

      {state.phase === 'no-location' ? (
        /* ── No location state ── */
        <View style={styles.centeredState}>
          <Text style={styles.stateEmoji}>📍</Text>
          <Text style={styles.stateTitle}>Location not set</Text>
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => router.push('/(tabs)/settings')}
          >
            <Text style={[styles.stateBody, styles.stateBodyLink]}>
              Set your home location in Settings so the app can factor in
              today's weather when picking outfits.
            </Text>
          </TouchableOpacity>
          <View style={styles.noLocationActions}>
            <TouchableOpacity
              style={styles.primaryBtn}
              activeOpacity={0.85}
              onPress={() => router.push('/(tabs)/settings')}
            >
              <Text style={styles.primaryBtnText}>Open Settings</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryBtn}
              activeOpacity={0.85}
              onPress={loadWeather}
            >
              <Text style={styles.secondaryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : state.phase === 'error' ? (
        /* ── Error state ── */
        <View style={styles.centeredState}>
          <Text style={styles.stateEmoji}>⚠️</Text>
          <Text style={styles.stateTitle}>Something went wrong</Text>
          <Text style={styles.stateBody}>{state.message}</Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            activeOpacity={0.85}
            onPress={loadWeather}
          >
            <Text style={styles.primaryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* ── Occasion picker ── */}
          <Text style={styles.sectionLabel}>Occasion</Text>
          <View style={styles.occasionRow}>
            {OCCASIONS.map((o) => {
              const active = occasion === o.value;
              return (
                <Pressable
                  key={o.value}
                  style={[styles.occasionChip, active && styles.occasionChipActive]}
                  onPress={() => setOccasion(o.value)}
                >
                  <Text style={styles.occasionChipIcon}>{o.icon}</Text>
                  <Text
                    style={[
                      styles.occasionChipLabel,
                      active && styles.occasionChipLabelActive,
                    ]}
                  >
                    {o.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* ── CTA ── */}
          <TouchableOpacity
            style={[styles.suggestBtn, isLoading && styles.suggestBtnDisabled]}
            activeOpacity={0.85}
            onPress={handleSuggest}
            disabled={isLoading}
          >
            {state.phase === 'loading-suggestions' ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <Ionicons name="sparkles" size={18} color="#ffffff" />
                <Text style={styles.suggestBtnText}>What should I wear?</Text>
              </>
            )}
          </TouchableOpacity>

          {/* ── Empty closet state ── */}
          {state.phase === 'empty' && (
            <View style={styles.inlineState}>
              <Text style={styles.stateEmoji}>👗</Text>
              <Text style={styles.stateTitle}>Not enough items</Text>
              <Text style={styles.stateBody}>
                Add more items to your closet and make sure they finish cataloging
                before requesting suggestions.
              </Text>
            </View>
          )}

          {/* ── Results ── */}
          {state.phase === 'results' && (
            <View style={styles.resultsList}>
              <Text style={styles.resultsHeader}>
                {state.outfits.length} outfit{state.outfits.length !== 1 ? 's' : ''} for you
              </Text>
              {state.outfits.map((outfit, i) => (
                <OutfitCard
                  key={i}
                  outfit={outfit}
                  index={i}
                  total={state.outfits.length}
                  onWear={() => handleWear(outfit, i)}
                  onSave={() => handleSave(outfit, i)}
                />
              ))}
            </View>
          )}

          <View style={styles.bottomPad} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#faf9f7',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a1a',
    letterSpacing: -0.5,
  },

  // Weather badge
  weatherBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f0eeec',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  weatherEmoji: { fontSize: 15 },
  weatherTemp: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  weatherCondition: {
    fontSize: 13,
    color: '#6b6b6b',
  },

  // Scroll
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },

  // Section label
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#a0a0a0',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },

  // Occasion chips
  occasionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  occasionChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#f0eeec',
    gap: 4,
  },
  occasionChipActive: {
    backgroundColor: '#1a1a1a',
  },
  occasionChipIcon: {
    fontSize: 20,
  },
  occasionChipLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#6b6b6b',
  },
  occasionChipLabelActive: {
    color: '#ffffff',
  },

  // Suggest button
  suggestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    paddingVertical: 16,
    marginBottom: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  suggestBtnDisabled: {
    opacity: 0.6,
  },
  suggestBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },

  // Results
  resultsList: {
    gap: 20,
  },
  resultsHeader: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6b6b6b',
    marginBottom: 4,
  },

  // Outfit card
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  cardIndex: {
    fontSize: 12,
    fontWeight: '500',
    color: '#a0a0a0',
  },
  scorePill: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: '#f7f6f4',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 1,
  },
  scorePillText: {
    fontSize: 16,
    fontWeight: '700',
  },
  scorePillSuffix: {
    fontSize: 11,
    fontWeight: '400',
    color: '#a0a0a0',
  },

  // Flat-lay grid
  flatLayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  flatLayCell: {
    width: (CARD_WIDTH - 32 - 16) / 3,
    alignItems: 'center',
    gap: 4,
  },
  flatLayImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 10,
    backgroundColor: '#f7f6f4',
  },
  flatLayPlaceholder: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 10,
    backgroundColor: '#f0eeec',
    justifyContent: 'center',
    alignItems: 'center',
  },
  flatLaySlotLabel: {
    fontSize: 10,
    color: '#a0a0a0',
    fontWeight: '500',
  },
  flatLayItemName: {
    fontSize: 10,
    color: '#6b6b6b',
    textAlign: 'center',
    fontWeight: '500',
  },

  // Reasoning
  reasoningText: {
    fontSize: 13,
    color: '#6b6b6b',
    fontStyle: 'italic',
    marginBottom: 10,
    lineHeight: 18,
  },

  // Breakdown
  breakdownToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  breakdownToggleText: {
    fontSize: 12,
    color: '#6b6b6b',
    fontWeight: '500',
  },
  breakdownPanel: {
    gap: 6,
    marginBottom: 8,
  },
  scoreBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scoreBarLabel: {
    fontSize: 11,
    color: '#6b6b6b',
    width: 110,
  },
  scoreBarTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#f0eeec',
    overflow: 'hidden',
  },
  scoreBarFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#1a1a1a',
  },
  scoreBarValue: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1a1a1a',
    width: 24,
    textAlign: 'right',
  },

  // Card actions
  cardActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  actionBtnPrimary: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  actionBtnPrimaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  actionBtnSecondary: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#f0eeec',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Centered / inline states
  centeredState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingBottom: 80,
    gap: 12,
  },
  inlineState: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 10,
  },
  stateEmoji: {
    fontSize: 48,
  },
  stateTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
    textAlign: 'center',
  },
  stateBody: {
    fontSize: 15,
    color: '#6b6b6b',
    textAlign: 'center',
    lineHeight: 22,
  },

  // Primary button (for states)
  primaryBtn: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingVertical: 13,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },

  // Secondary button
  secondaryBtn: {
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingVertical: 13,
    backgroundColor: '#f0eeec',
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
  },

  // No-location action row
  noLocationActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },

  // Tappable body text in no-location state
  stateBodyLink: {
    textDecorationLine: 'underline',
    textDecorationColor: '#c0bdb8',
  },

  bottomPad: {
    height: 100,
  },
});
