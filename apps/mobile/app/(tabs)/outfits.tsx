import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import {
  api,
  type ApiItem,
  type ApiOutfit,
  type ApiScoreResult,
  type ScoreBreakdown,
} from '../../lib/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// 2-column slot grid: 20px left + 20px right padding, 10px column gap
const CELL_SIZE = (SCREEN_WIDTH - 40 - 10) / 2;
// 3-column picker grid: 20px l+r padding, 8px * 2 gaps
const PICKER_CELL_SIZE = (SCREEN_WIDTH - 40 - 16) / 3;

type BuildSlot = 'outerwear' | 'top' | 'bottom' | 'dress' | 'footwear' | 'accessory';

interface SlotDef {
  slot: BuildSlot;
  label: string;
  optional: boolean;
  category: string;
  emoji: string;
}

const SLOT_DEFS: SlotDef[] = [
  { slot: 'outerwear', label: 'Outerwear', optional: true,  category: 'outerwear', emoji: '🧥' },
  { slot: 'top',       label: 'Top',       optional: false, category: 'top',       emoji: '👕' },
  { slot: 'bottom',    label: 'Bottom',    optional: false, category: 'bottom',    emoji: '👖' },
  { slot: 'dress',     label: 'Dress',     optional: true,  category: 'dress',     emoji: '👗' },
  { slot: 'footwear',  label: 'Footwear',  optional: false, category: 'footwear',  emoji: '👟' },
  { slot: 'accessory', label: 'Accessory', optional: true,  category: 'accessory', emoji: '👜' },
];

type ActiveView = 'build' | 'saved';

// ── Score helpers ─────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 80) return '#16a34a';
  if (score >= 60) return '#ca8a04';
  return '#dc2626';
}

function breakdownLabel(key: keyof ScoreBreakdown): string {
  switch (key) {
    case 'color':     return 'Color harmony';
    case 'coherence': return 'Style coherence';
    case 'formality': return 'Formality';
    case 'pattern':   return 'Pattern balance';
    case 'novelty':   return 'Novelty';
  }
}

// ── ScoreBar (same pattern as Suggest screen) ─────────────────────────────────

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

// ── Slot cell ─────────────────────────────────────────────────────────────────

function SlotCell({
  def,
  item,
  onPress,
  onRemove,
}: {
  def: SlotDef;
  item: ApiItem | null;
  onPress: () => void;
  onRemove: () => void;
}) {
  return (
    <View style={[styles.slotWrapper, { width: CELL_SIZE }]}>
      <TouchableOpacity
        style={[styles.slotImageBox, item ? styles.slotImageBoxFilled : null]}
        onPress={onPress}
        activeOpacity={0.8}
      >
        {item ? (
          <Image
            source={{ uri: item.cutoutImageUrl ?? item.originalImageUrl }}
            style={styles.slotImage}
            contentFit="contain"
          />
        ) : (
          <View style={styles.slotEmpty}>
            <Text style={styles.slotEmoji}>{def.emoji}</Text>
            <Ionicons name="add" size={18} color="#c0bdb8" style={styles.slotAddIcon} />
          </View>
        )}
      </TouchableOpacity>

      <View style={styles.slotFooter}>
        <Text style={styles.slotLabel} numberOfLines={1}>
          {item?.name ?? def.label}
          {def.optional && !item ? <Text style={styles.slotOptional}> opt.</Text> : null}
        </Text>
        {item ? (
          <TouchableOpacity onPress={onRemove} hitSlop={8} style={styles.slotRemoveBtn}>
            <Ionicons name="close-circle" size={16} color="#dc2626" />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

// ── Item picker modal ─────────────────────────────────────────────────────────

function ItemPickerModal({
  visible,
  slotDef,
  onSelect,
  onClose,
}: {
  visible: boolean;
  slotDef: SlotDef | null;
  onSelect: (item: ApiItem) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<ApiItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !slotDef) return;
    setLoading(true);
    api
      .listItems({ category: slotDef.category })
      .then(({ items: all }) => setItems(all.filter((i) => i.procStatus === 'ready')))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [visible, slotDef]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.pickerContainer} edges={['top']}>
        <View style={styles.pickerHeader}>
          <Text style={styles.pickerTitle}>
            Pick {slotDef?.label ?? ''}
          </Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={24} color="#1a1a1a" />
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator style={styles.pickerLoading} color="#1a1a1a" />
        ) : items.length === 0 ? (
          <View style={styles.pickerEmpty}>
            <Text style={styles.pickerEmptyText}>
              No {slotDef?.label.toLowerCase()} items cataloged yet.{'\n'}
              Add some in your Closet first.
            </Text>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(i) => i.id}
            numColumns={3}
            contentContainerStyle={styles.pickerGrid}
            columnWrapperStyle={styles.pickerGridRow}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.pickerCell, { width: PICKER_CELL_SIZE }]}
                onPress={() => onSelect(item)}
                activeOpacity={0.8}
              >
                <View style={styles.pickerCellImageBox}>
                  <Image
                    source={{ uri: item.cutoutImageUrl ?? item.originalImageUrl }}
                    style={styles.pickerCellImage}
                    contentFit="contain"
                  />
                </View>
                <Text style={styles.pickerCellName} numberOfLines={2}>
                  {item.name ?? item.category ?? ''}
                </Text>
              </TouchableOpacity>
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ── Saved outfit card ─────────────────────────────────────────────────────────

function SavedOutfitCard({
  outfit,
  onWear,
  onDelete,
}: {
  outfit: ApiOutfit;
  onWear: () => void;
  onDelete: () => void;
}) {
  const [showBreakdown, setShowBreakdown] = useState(false);

  return (
    <View style={styles.savedCard}>
      {/* Header */}
      <View style={styles.savedCardHeader}>
        <View style={styles.savedCardMeta}>
          <Text style={styles.savedCardName} numberOfLines={1}>
            {outfit.name ??
              `Outfit · ${new Date(outfit.createdAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })}`}
          </Text>
          <Text style={styles.savedCardSub}>
            {outfit.items.length} item{outfit.items.length !== 1 ? 's' : ''}
            {outfit.wearCount > 0 ? ` · worn ${outfit.wearCount}×` : ''}
          </Text>
        </View>
        {outfit.score != null ? (
          <View style={styles.scorePill}>
            <Text style={[styles.scorePillText, { color: scoreColor(outfit.score) }]}>
              {Math.round(outfit.score)}
            </Text>
            <Text style={styles.scorePillSuffix}>/100</Text>
          </View>
        ) : null}
      </View>

      {/* Item thumbnails */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.savedThumbsRow}
      >
        {outfit.items.filter((oi) => oi.item != null).map((oi) => (
          <View key={`${oi.slot}-${oi.item.id}`} style={styles.savedThumbCell}>
            <View style={styles.savedThumbImageBox}>
              <Image
                source={{ uri: oi.item.cutoutImageUrl ?? undefined }}
                style={styles.savedThumbImage}
                contentFit="contain"
              />
            </View>
            <Text style={styles.savedThumbSlot}>{oi.slot}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Breakdown toggle */}
      {outfit.scoreBreakdown ? (
        <>
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
              {(Object.keys(outfit.scoreBreakdown) as (keyof ScoreBreakdown)[]).map((k) => (
                <ScoreBar
                  key={k}
                  value={outfit.scoreBreakdown![k]}
                  label={breakdownLabel(k)}
                />
              ))}
            </View>
          )}
        </>
      ) : null}

      {/* Actions */}
      <View style={styles.savedCardActions}>
        <TouchableOpacity
          style={styles.savedWearBtn}
          onPress={onWear}
          activeOpacity={0.85}
        >
          <Text style={styles.savedWearBtnText}>I'll wear this</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.savedDeleteBtn}
          onPress={onDelete}
          activeOpacity={0.85}
        >
          <Ionicons name="trash-outline" size={18} color="#dc2626" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function Outfits() {
  // View toggle
  const [activeView, setActiveView] = useState<ActiveView>('build');

  // ── Builder state ──
  const [slots, setSlots] = useState<Partial<Record<BuildSlot, ApiItem>>>({});
  const [pickerDef, setPickerDef] = useState<SlotDef | null>(null);
  const [scoreResult, setScoreResult] = useState<ApiScoreResult | null>(null);
  const [scoring, setScoring] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const scoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Saved state ──
  const [savedOutfits, setSavedOutfits] = useState<ApiOutfit[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (scoreTimerRef.current) clearTimeout(scoreTimerRef.current);
    };
  }, []);

  // Load saved outfits whenever the tab gains focus (so freshly saved outfits appear)
  useFocusEffect(
    useCallback(() => {
      loadSaved();
    }, []),
  );

  // Also reload when switching to the saved view
  useEffect(() => {
    if (activeView === 'saved') loadSaved();
  }, [activeView]);

  async function loadSaved() {
    setLoadingSaved(true);
    try {
      const { outfits } = await api.listOutfits();
      setSavedOutfits(outfits);
    } catch {
      // keep existing data
    } finally {
      setLoadingSaved(false);
    }
  }

  // ── Score helpers ──

  function buildItemsPayload(
    s: Partial<Record<BuildSlot, ApiItem>>,
  ): { itemId: string; slot: string }[] {
    return (Object.entries(s) as [BuildSlot, ApiItem][])
      .filter(([, item]) => item != null)
      .map(([slot, item]) => ({ itemId: item.id, slot }));
  }

  function scheduleScore(newSlots: Partial<Record<BuildSlot, ApiItem>>) {
    if (scoreTimerRef.current) clearTimeout(scoreTimerRef.current);
    const items = buildItemsPayload(newSlots);
    if (items.length < 2) {
      setScoreResult(null);
      setScoring(false);
      return;
    }
    setScoring(true);
    scoreTimerRef.current = setTimeout(async () => {
      try {
        const result = await api.scoreOutfit(items);
        setScoreResult(result);
      } catch {
        // scoring failure is non-fatal — don't show an error
      } finally {
        setScoring(false);
      }
    }, 500);
  }

  // ── Builder handlers ──

  function handleSlotPress(def: SlotDef) {
    setPickerDef(def);
  }

  function handleItemSelect(item: ApiItem) {
    if (!pickerDef) return;
    const newSlots = { ...slots, [pickerDef.slot]: item };
    setSlots(newSlots);
    setPickerDef(null);
    scheduleScore(newSlots);
  }

  function handleSlotRemove(slot: BuildSlot) {
    const newSlots = { ...slots };
    delete newSlots[slot];
    setSlots(newSlots);
    scheduleScore(newSlots);
    setShowBreakdown(false);
  }

  function handleClearAll() {
    if (scoreTimerRef.current) clearTimeout(scoreTimerRef.current);
    setSlots({});
    setScoreResult(null);
    setScoring(false);
    setShowBreakdown(false);
  }

  async function handleSave() {
    const items = buildItemsPayload(slots);
    if (items.length < 2) {
      Alert.alert('Not enough items', 'Fill at least 2 slots before saving an outfit.');
      return;
    }
    setSaving(true);
    try {
      await api.saveOutfit({ items, source: 'user_created' });
      Alert.alert('Saved!', 'Outfit added to your collection.', [
        {
          text: 'View saved',
          onPress: () => {
            setActiveView('saved');
            handleClearAll();
          },
        },
        { text: 'Keep building', style: 'cancel' },
      ]);
    } catch {
      Alert.alert('Error', 'Could not save outfit. Try again.');
    } finally {
      setSaving(false);
    }
  }

  // ── Saved handlers ──

  async function handleWearSaved(outfit: ApiOutfit) {
    try {
      const itemIds = outfit.items.map((i) => i.item.id);
      await api.logWear({ outfitId: outfit.id, itemIds });
      Alert.alert('Logged! 👕', 'Wear added to your log.');
    } catch {
      Alert.alert('Error', 'Could not log wear. Try again.');
    }
  }

  function handleDeleteSaved(outfit: ApiOutfit) {
    Alert.alert('Delete outfit?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteOutfit(outfit.id);
            setSavedOutfits((prev) => prev.filter((o) => o.id !== outfit.id));
          } catch {
            Alert.alert('Error', 'Could not delete outfit.');
          }
        },
      },
    ]);
  }

  const filledCount = Object.keys(slots).length;

  // ── Render ──

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Outfits</Text>
        <View style={styles.segmentControl}>
          {(['build', 'saved'] as ActiveView[]).map((v) => (
            <Pressable
              key={v}
              style={[styles.segment, activeView === v && styles.segmentActive]}
              onPress={() => setActiveView(v)}
            >
              <Text
                style={[styles.segmentText, activeView === v && styles.segmentTextActive]}
              >
                {v === 'build' ? 'Build' : `Saved${savedOutfits.length > 0 ? ` (${savedOutfits.length})` : ''}`}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {activeView === 'build' ? (
        /* ── Builder view ── */
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.buildScrollContent}
        >
          <Text style={styles.sectionHint}>
            Tap a slot to pick an item from your closet. Score updates live.
          </Text>

          {/* Slot grid — 2 columns */}
          <View style={styles.slotGrid}>
            {SLOT_DEFS.map((def) => (
              <SlotCell
                key={def.slot}
                def={def}
                item={slots[def.slot] ?? null}
                onPress={() => handleSlotPress(def)}
                onRemove={() => handleSlotRemove(def.slot)}
              />
            ))}
          </View>

          {/* ── Live score panel ── */}
          {(scoreResult !== null || scoring) ? (
            <View style={styles.scorePanel}>
              {scoring ? (
                <View style={styles.scoringRow}>
                  <ActivityIndicator size="small" color="#1a1a1a" />
                  <Text style={styles.scoringText}>Scoring outfit…</Text>
                </View>
              ) : scoreResult ? (
                <>
                  {/* Score pill + label */}
                  <View style={styles.scorePanelHeader}>
                    <Text style={styles.scorePanelLabel}>Compatibility</Text>
                    <View style={styles.scorePill}>
                      <Text
                        style={[
                          styles.scorePillText,
                          { color: scoreColor(scoreResult.score) },
                        ]}
                      >
                        {Math.round(scoreResult.score)}
                      </Text>
                      <Text style={styles.scorePillSuffix}>/100</Text>
                    </View>
                  </View>

                  {/* Plain-language critique */}
                  <Text style={styles.critiqueText}>{scoreResult.critique}</Text>

                  {/* Expandable breakdown */}
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
                      {(
                        Object.keys(scoreResult.breakdown) as (keyof ScoreBreakdown)[]
                      ).map((k) => (
                        <ScoreBar
                          key={k}
                          value={scoreResult!.breakdown[k]}
                          label={breakdownLabel(k)}
                        />
                      ))}
                    </View>
                  )}
                </>
              ) : null}
            </View>
          ) : filledCount >= 1 ? (
            <View style={styles.scorePlaceholder}>
              <Text style={styles.scorePlaceholderText}>
                Fill {2 - filledCount} more slot{2 - filledCount !== 1 ? 's' : ''} to see a score
              </Text>
            </View>
          ) : null}

          {/* ── Actions ── */}
          <View style={styles.buildActions}>
            <TouchableOpacity
              style={[
                styles.saveBtn,
                (filledCount < 2 || saving) && styles.saveBtnDisabled,
              ]}
              onPress={handleSave}
              disabled={filledCount < 2 || saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="bookmark-outline" size={18} color="#ffffff" />
                  <Text style={styles.saveBtnText}>Save outfit</Text>
                </>
              )}
            </TouchableOpacity>
            {filledCount > 0 ? (
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={handleClearAll}
                activeOpacity={0.85}
              >
                <Text style={styles.clearBtnText}>Clear</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.bottomPad} />
        </ScrollView>
      ) : /* ── Saved view ── */ loadingSaved ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color="#1a1a1a" />
        </View>
      ) : savedOutfits.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>📋</Text>
          <Text style={styles.emptyTitle}>No saved outfits</Text>
          <Text style={styles.emptyBody}>
            Build and save your first outfit in the Build tab.
          </Text>
          <TouchableOpacity
            style={styles.emptyBtn}
            onPress={() => setActiveView('build')}
            activeOpacity={0.85}
          >
            <Text style={styles.emptyBtnText}>Start building</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={savedOutfits}
          keyExtractor={(o) => o.id}
          contentContainerStyle={styles.savedList}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: outfit }) => (
            <SavedOutfitCard
              outfit={outfit}
              onWear={() => handleWearSaved(outfit)}
              onDelete={() => handleDeleteSaved(outfit)}
            />
          )}
        />
      )}

      {/* Item Picker Modal */}
      <ItemPickerModal
        visible={pickerDef !== null}
        slotDef={pickerDef}
        onSelect={handleItemSelect}
        onClose={() => setPickerDef(null)}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

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
    paddingBottom: 14,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a1a',
    letterSpacing: -0.5,
  },

  // Segment control
  segmentControl: {
    flexDirection: 'row',
    backgroundColor: '#f0eeec',
    borderRadius: 10,
    padding: 3,
  },
  segment: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  segmentActive: {
    backgroundColor: '#1a1a1a',
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b6b6b',
  },
  segmentTextActive: {
    color: '#ffffff',
  },

  // Build scroll
  buildScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  sectionHint: {
    fontSize: 13,
    color: '#a0a0a0',
    marginBottom: 16,
    lineHeight: 18,
  },

  // Slot grid
  slotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  slotWrapper: {
    gap: 6,
  },
  slotImageBox: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#e5e2dd',
    borderStyle: 'dashed',
    backgroundColor: '#f7f6f4',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  slotImageBoxFilled: {
    borderStyle: 'solid',
    borderColor: '#e5e2dd',
    backgroundColor: '#f7f6f4',
  },
  slotImage: {
    width: '100%',
    height: '100%',
  },
  slotEmpty: {
    alignItems: 'center',
    gap: 4,
  },
  slotEmoji: {
    fontSize: 28,
    opacity: 0.3,
  },
  slotAddIcon: {
    opacity: 0.7,
  },
  slotFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 2,
  },
  slotLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: '#6b6b6b',
  },
  slotOptional: {
    fontSize: 11,
    fontWeight: '400',
    color: '#b0aba6',
  },
  slotRemoveBtn: {
    padding: 2,
  },

  // Score panel
  scorePanel: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  scoringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  scoringText: {
    fontSize: 14,
    color: '#6b6b6b',
  },
  scorePanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  scorePanelLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#a0a0a0',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
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
    fontSize: 18,
    fontWeight: '700',
  },
  scorePillSuffix: {
    fontSize: 11,
    fontWeight: '400',
    color: '#a0a0a0',
  },
  critiqueText: {
    fontSize: 14,
    color: '#4a4a4a',
    lineHeight: 20,
    marginBottom: 10,
    fontStyle: 'italic',
  },
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
    gap: 7,
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
    width: 28,
    textAlign: 'right',
  },

  // Score placeholder
  scorePlaceholder: {
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 16,
  },
  scorePlaceholderText: {
    fontSize: 13,
    color: '#b0aba6',
  },

  // Build actions
  buildActions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  saveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    paddingVertical: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  saveBtnDisabled: {
    opacity: 0.4,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  clearBtn: {
    paddingHorizontal: 20,
    borderRadius: 14,
    backgroundColor: '#f0eeec',
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b6b6b',
  },

  // Picker modal
  pickerContainer: {
    flex: 1,
    backgroundColor: '#faf9f7',
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ede9e4',
  },
  pickerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  pickerLoading: {
    marginTop: 48,
  },
  pickerEmpty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  pickerEmptyText: {
    fontSize: 15,
    color: '#6b6b6b',
    textAlign: 'center',
    lineHeight: 22,
  },
  pickerGrid: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  pickerGridRow: {
    gap: 8,
    marginBottom: 8,
  },
  pickerCell: {
    alignItems: 'center',
    gap: 5,
  },
  pickerCellImageBox: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 10,
    backgroundColor: '#f0eeec',
    overflow: 'hidden',
  },
  pickerCellImage: {
    width: '100%',
    height: '100%',
  },
  pickerCellName: {
    fontSize: 11,
    color: '#4a4a4a',
    textAlign: 'center',
    lineHeight: 15,
    fontWeight: '500',
  },

  // Saved list
  savedList: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 100,
    gap: 16,
  },
  savedCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  savedCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  savedCardMeta: {
    flex: 1,
    marginRight: 10,
  },
  savedCardName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 2,
  },
  savedCardSub: {
    fontSize: 12,
    color: '#a0a0a0',
  },
  savedThumbsRow: {
    gap: 8,
    marginBottom: 12,
  },
  savedThumbCell: {
    alignItems: 'center',
    gap: 3,
  },
  savedThumbImageBox: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: '#f7f6f4',
    overflow: 'hidden',
  },
  savedThumbImage: {
    width: '100%',
    height: '100%',
  },
  savedThumbSlot: {
    fontSize: 10,
    color: '#b0aba6',
    fontWeight: '500',
  },
  savedCardActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  savedWearBtn: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  savedWearBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  savedDeleteBtn: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#fef2f2',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // States
  loadingState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingBottom: 80,
    gap: 12,
  },
  emptyEmoji: {
    fontSize: 48,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 15,
    color: '#6b6b6b',
    textAlign: 'center',
    lineHeight: 22,
  },
  emptyBtn: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingVertical: 13,
    marginTop: 4,
  },
  emptyBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },

  bottomPad: {
    height: 100,
  },
});
