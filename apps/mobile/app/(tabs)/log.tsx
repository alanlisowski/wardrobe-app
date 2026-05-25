import { useCallback, useEffect, useState } from 'react';
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
import { api, type ApiItem, type ApiOutfit, type ApiWear } from '../../lib/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ITEM_CELL_SIZE = (SCREEN_WIDTH - 40 - 16) / 3; // 3 columns

// ── Date helpers ──────────────────────────────────────────────────────────────

function formatWornDate(wornOn: string): string {
  // wornOn is a "YYYY-MM-DD" date string (local, no time component)
  const [year, month, day] = wornOn.split('-').map(Number);
  const date = new Date(year!, month! - 1, day!);

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const stripTime = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate());

  const d = stripTime(date);
  const t = stripTime(today);
  const y = stripTime(yesterday);

  if (d.getTime() === t.getTime()) return 'Today';
  if (d.getTime() === y.getTime()) return 'Yesterday';
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

// Group an array of wears by their wornOn date (sorted newest first)
function groupByDate(wears: ApiWear[]): { dateKey: string; wears: ApiWear[] }[] {
  const map = new Map<string, ApiWear[]>();
  for (const wear of wears) {
    if (!map.has(wear.wornOn)) map.set(wear.wornOn, []);
    map.get(wear.wornOn)!.push(wear);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateKey, wears]) => ({ dateKey, wears }));
}

// ── Wear card ─────────────────────────────────────────────────────────────────

function WearCard({ wear }: { wear: ApiWear }) {
  return (
    <View style={styles.wearCard}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.wearItemsRow}
      >
        {(wear.items ?? []).length > 0 ? (
          (wear.items ?? []).map((item) => (
            <View key={item.id} style={styles.wearItemCell}>
              <View style={styles.wearItemImageBox}>
                <Image
                  source={{ uri: item.cutoutImageUrl ?? item.originalImageUrl }}
                  style={styles.wearItemImage}
                  contentFit="contain"
                />
              </View>
              {item.name ? (
                <Text style={styles.wearItemName} numberOfLines={1}>
                  {item.name}
                </Text>
              ) : null}
            </View>
          ))
        ) : (
          <Text style={styles.wearNoItems}>No items recorded</Text>
        )}
      </ScrollView>
      {wear.note ? <Text style={styles.wearNote}>{wear.note}</Text> : null}
    </View>
  );
}

// ── Log Wear Modal ────────────────────────────────────────────────────────────

type LogMode = 'outfit' | 'items';

function LogWearModal({
  visible,
  onClose,
  onLogged,
}: {
  visible: boolean;
  onClose: () => void;
  onLogged: () => void;
}) {
  const [mode, setMode] = useState<LogMode>('outfit');
  const [outfits, setOutfits] = useState<ApiOutfit[]>([]);
  const [items, setItems] = useState<ApiItem[]>([]);
  const [selectedOutfit, setSelectedOutfit] = useState<ApiOutfit | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) {
      // Reset state when modal closes so it opens fresh next time
      setSelectedOutfit(null);
      setSelectedItems(new Set());
      setMode('outfit');
      return;
    }
    // Load outfits and closet items in parallel
    setLoading(true);
    Promise.all([
      api.listOutfits().catch(() => ({ outfits: [] as ApiOutfit[] })),
      api.listItems().catch(() => ({ items: [] as ApiItem[], total: 0 })),
    ])
      .then(([{ outfits }, { items }]) => {
        setOutfits(outfits);
        setItems(items.filter((i) => i.procStatus === 'ready'));
      })
      .finally(() => setLoading(false));
  }, [visible]);

  function toggleItem(id: string) {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit() {
    if (mode === 'outfit') {
      if (!selectedOutfit) {
        Alert.alert('No outfit selected', 'Pick a saved outfit to log.');
        return;
      }
      setSubmitting(true);
      try {
        const itemIds = selectedOutfit.items.map((i) => i.item.id);
        await api.logWear({ outfitId: selectedOutfit.id, itemIds });
        onLogged();
      } catch {
        Alert.alert('Error', 'Could not log wear. Try again.');
      } finally {
        setSubmitting(false);
      }
    } else {
      if (selectedItems.size === 0) {
        Alert.alert('No items selected', 'Tap items to select what you wore.');
        return;
      }
      setSubmitting(true);
      try {
        await api.logWear({ itemIds: Array.from(selectedItems) });
        onLogged();
      } catch {
        Alert.alert('Error', 'Could not log wear. Try again.');
      } finally {
        setSubmitting(false);
      }
    }
  }

  const canSubmit =
    mode === 'outfit' ? selectedOutfit !== null : selectedItems.size > 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modalContainer} edges={['top']}>
        {/* Modal header */}
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Log today's wear</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={24} color="#1a1a1a" />
          </TouchableOpacity>
        </View>

        {/* Mode toggle: saved outfit vs. pick individual items */}
        <View style={styles.modeToggle}>
          {(['outfit', 'items'] as LogMode[]).map((m) => (
            <Pressable
              key={m}
              style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
              onPress={() => setMode(m)}
            >
              <Text style={[styles.modeBtnText, mode === m && styles.modeBtnTextActive]}>
                {m === 'outfit' ? 'Saved outfit' : 'Pick items'}
              </Text>
            </Pressable>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator style={styles.modalLoading} color="#1a1a1a" />
        ) : mode === 'outfit' ? (
          /* ── Outfit picker ── */
          outfits.length === 0 ? (
            <View style={styles.modalEmpty}>
              <Text style={styles.modalEmptyText}>
                No saved outfits yet.{'\n'}
                Build one in the Outfits tab first.
              </Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.outfitList}>
              {outfits.map((outfit) => {
                const selected = selectedOutfit?.id === outfit.id;
                return (
                  <TouchableOpacity
                    key={outfit.id}
                    style={[styles.outfitRow, selected && styles.outfitRowSelected]}
                    onPress={() => setSelectedOutfit(outfit)}
                    activeOpacity={0.8}
                  >
                    {/* Thumbnails */}
                    <View style={styles.outfitRowThumbs}>
                      {outfit.items.filter((oi) => oi.item != null).slice(0, 3).map((oi) => (
                        <View key={oi.slot} style={styles.outfitThumbBox}>
                          <Image
                            source={{ uri: oi.item.cutoutImageUrl ?? undefined }}
                            style={styles.outfitThumb}
                            contentFit="contain"
                          />
                        </View>
                      ))}
                    </View>
                    {/* Info */}
                    <View style={styles.outfitRowInfo}>
                      <Text style={styles.outfitRowName} numberOfLines={1}>
                        {outfit.name ??
                          `Outfit · ${new Date(outfit.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}`}
                      </Text>
                      <Text style={styles.outfitRowMeta}>
                        {outfit.items.length} items
                        {outfit.score != null
                          ? ` · ${Math.round(outfit.score)}/100`
                          : ''}
                      </Text>
                    </View>
                    {selected ? (
                      <Ionicons name="checkmark-circle" size={22} color="#1a1a1a" />
                    ) : (
                      <Ionicons name="ellipse-outline" size={22} color="#d0cdc8" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )
        ) : (
          /* ── Item multi-picker ── */
          items.length === 0 ? (
            <View style={styles.modalEmpty}>
              <Text style={styles.modalEmptyText}>
                No cataloged items yet.{'\n'}
                Add items in the Closet tab.
              </Text>
            </View>
          ) : (
            <FlatList
              data={items}
              keyExtractor={(i) => i.id}
              numColumns={3}
              contentContainerStyle={styles.itemPickerGrid}
              columnWrapperStyle={styles.itemPickerRow}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const selected = selectedItems.has(item.id);
                return (
                  <TouchableOpacity
                    style={[
                      styles.itemPickerCell,
                      { width: ITEM_CELL_SIZE },
                      selected && styles.itemPickerCellSelected,
                    ]}
                    onPress={() => toggleItem(item.id)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.itemPickerImageBox}>
                      <Image
                        source={{ uri: item.cutoutImageUrl ?? item.originalImageUrl }}
                        style={styles.itemPickerImage}
                        contentFit="contain"
                      />
                      {selected ? (
                        <View style={styles.selectedOverlay}>
                          <Ionicons name="checkmark" size={22} color="#ffffff" />
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.itemPickerName} numberOfLines={1}>
                      {item.name ?? item.category ?? ''}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          )
        )}

        {/* Submit footer */}
        <View style={styles.modalFooter}>
          {mode === 'items' && selectedItems.size > 0 ? (
            <Text style={styles.selectedCount}>
              {selectedItems.size} item{selectedItems.size !== 1 ? 's' : ''} selected
            </Text>
          ) : null}
          <TouchableOpacity
            style={[
              styles.submitBtn,
              (!canSubmit || submitting) && styles.submitBtnDisabled,
            ]}
            onPress={handleSubmit}
            disabled={!canSubmit || submitting}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.submitBtnText}>Log wear</Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function Log() {
  const [wears, setWears] = useState<ApiWear[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadWears();
    }, []),
  );

  async function loadWears() {
    setLoading(true);
    try {
      const { wears } = await api.listWears();
      setWears(wears);
    } catch {
      // keep existing data
    } finally {
      setLoading(false);
    }
  }

  const groups = groupByDate(wears);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Log</Text>
        {!loading && wears.length > 0 ? (
          <Text style={styles.headerSub}>
            {wears.length} wear{wears.length !== 1 ? 's' : ''} logged
          </Text>
        ) : null}
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color="#1a1a1a" />
        </View>
      ) : wears.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>📅</Text>
          <Text style={styles.emptyTitle}>Nothing logged yet</Text>
          <Text style={styles.emptyBody}>
            Tap + to log what you're wearing today. Your wear history will appear here.
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        >
          {groups.map(({ dateKey, wears: dayWears }) => (
            <View key={dateKey}>
              {/* Date section header */}
              <View style={styles.dateSeparator}>
                <Text style={styles.dateSeparatorText}>{formatWornDate(dateKey)}</Text>
                <Text style={styles.dateSeparatorCount}>
                  {dayWears.length} outfit{dayWears.length !== 1 ? 's' : ''}
                </Text>
              </View>

              {/* Wear cards for that day */}
              {dayWears.map((wear) => (
                <WearCard key={wear.id} wear={wear} />
              ))}
            </View>
          ))}
          <View style={styles.bottomPad} />
        </ScrollView>
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowModal(true)}
        activeOpacity={0.85}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>

      {/* Log Wear Modal */}
      <LogWearModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        onLogged={() => {
          setShowModal(false);
          loadWears();
          Alert.alert('Logged! 👕', 'Wear added to your history.');
        }}
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
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a1a',
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 14,
    color: '#a0a0a0',
    fontWeight: '500',
  },

  // List
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },

  // Date separator
  dateSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 10,
  },
  dateSeparatorText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  dateSeparatorCount: {
    fontSize: 12,
    color: '#a0a0a0',
    fontWeight: '500',
  },

  // Wear card
  wearCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  wearItemsRow: {
    gap: 10,
    paddingBottom: 4,
  },
  wearItemCell: {
    alignItems: 'center',
    gap: 4,
  },
  wearItemImageBox: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: '#f7f6f4',
    overflow: 'hidden',
  },
  wearItemImage: {
    width: '100%',
    height: '100%',
  },
  wearItemName: {
    fontSize: 10,
    color: '#6b6b6b',
    fontWeight: '500',
    maxWidth: 72,
    textAlign: 'center',
  },
  wearNoItems: {
    fontSize: 13,
    color: '#b0aba6',
    paddingVertical: 8,
  },
  wearNote: {
    fontSize: 13,
    color: '#6b6b6b',
    marginTop: 8,
    fontStyle: 'italic',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0eeec',
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

  // FAB
  fab: {
    position: 'absolute',
    bottom: 28,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  fabIcon: {
    color: '#ffffff',
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '300',
  },

  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: '#faf9f7',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ede9e4',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  modalLoading: {
    marginTop: 48,
  },

  // Mode toggle
  modeToggle: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 12,
    backgroundColor: '#f0eeec',
    borderRadius: 12,
    padding: 4,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 9,
    alignItems: 'center',
  },
  modeBtnActive: {
    backgroundColor: '#1a1a1a',
  },
  modeBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b6b6b',
  },
  modeBtnTextActive: {
    color: '#ffffff',
  },

  // Empty
  modalEmpty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  modalEmptyText: {
    fontSize: 15,
    color: '#6b6b6b',
    textAlign: 'center',
    lineHeight: 22,
  },

  // Outfit list
  outfitList: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 8,
  },
  outfitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  outfitRowSelected: {
    borderColor: '#1a1a1a',
  },
  outfitRowThumbs: {
    flexDirection: 'row',
    gap: 4,
  },
  outfitThumbBox: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#f0eeec',
    overflow: 'hidden',
  },
  outfitThumb: {
    width: '100%',
    height: '100%',
  },
  outfitRowInfo: {
    flex: 1,
    gap: 2,
  },
  outfitRowName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  outfitRowMeta: {
    fontSize: 12,
    color: '#a0a0a0',
  },

  // Item multi-picker
  itemPickerGrid: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  itemPickerRow: {
    gap: 8,
    marginBottom: 8,
  },
  itemPickerCell: {
    alignItems: 'center',
    gap: 5,
  },
  itemPickerCellSelected: {
    // selection overlay handles the visual, no border needed
  },
  itemPickerImageBox: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 10,
    backgroundColor: '#f0eeec',
    overflow: 'hidden',
  },
  itemPickerImage: {
    width: '100%',
    height: '100%',
  },
  selectedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(26, 26, 26, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
  },
  itemPickerName: {
    fontSize: 11,
    color: '#4a4a4a',
    textAlign: 'center',
    fontWeight: '500',
  },

  // Modal footer
  modalFooter: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#ede9e4',
    gap: 8,
    backgroundColor: '#faf9f7',
  },
  selectedCount: {
    fontSize: 13,
    color: '#6b6b6b',
    textAlign: 'center',
    fontWeight: '500',
  },
  submitBtn: {
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },

  bottomPad: {
    height: 100,
  },
});
