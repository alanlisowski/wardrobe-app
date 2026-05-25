import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { api, type ApiItem } from '../../../lib/api';

const MAX_WARDROBE_SIZE = 150;

const CATEGORY_FILTERS = [
  { label: 'All', value: null },
  { label: 'Tops', value: 'top' },
  { label: 'Bottoms', value: 'bottom' },
  { label: 'Dresses', value: 'dress' },
  { label: 'Outerwear', value: 'outerwear' },
  { label: 'Footwear', value: 'footwear' },
  { label: 'Accessories', value: 'accessory' },
] as const;

type CategoryFilter = (typeof CATEGORY_FILTERS)[number]['value'];

function categoryLabel(cat: string | null): string {
  if (!cat) return '';
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

function ItemCard({ item, cardWidth }: { item: ApiItem; cardWidth: number }) {
  const router = useRouter();
  const imageUri = item.cutoutImageUrl ?? item.originalImageUrl;

  return (
    <TouchableOpacity
      style={[styles.card, { width: cardWidth }]}
      activeOpacity={0.8}
      onPress={() => router.push(`/(tabs)/closet/${item.id}`)}
    >
      <View style={styles.cardImageContainer}>
        <Image
          source={{ uri: imageUri }}
          style={styles.cardImage}
          contentFit="contain"
          transition={150}
          // TODO: remove before shipping
          onError={(e) => console.log('[image] load failed:', imageUri, e.error)}
        />
        {item.procStatus === 'processing' && (
          <View style={styles.processingOverlay}>
            <ActivityIndicator color="#ffffff" size="small" />
          </View>
        )}
        {item.procStatus === 'failed' && (
          <View style={[styles.processingOverlay, styles.failedOverlay]}>
            <Text style={styles.failedText}>!</Text>
          </View>
        )}
      </View>
      <View style={styles.cardFooter}>
        {item.category && (
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryBadgeText}>
              {categoryLabel(item.category)}
            </Text>
          </View>
        )}
        {item.name && (
          <Text style={styles.itemName} numberOfLines={1}>
            {item.name}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function Closet() {
  const router = useRouter();
  const { width } = useWindowDimensions();

  const [items, setItems] = useState<ApiItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>(null);

  const cardWidth = (width - 40 - 12) / 2; // 20px side padding, 12px gap

  const load = useCallback(
    async (category: CategoryFilter, isRefresh = false) => {
      if (!isRefresh) setLoading(true);
      try {
        const [allResult, filteredResult] = await Promise.all([
          category !== null ? api.listItems() : Promise.resolve(null),
          api.listItems(category !== null ? { category } : undefined),
        ]);

        if (allResult) {
          setTotalCount(allResult.total);
          setItems(filteredResult.items);
        } else {
          setTotalCount(filteredResult.total);
          setItems(filteredResult.items);
        }
      } catch {
        // silently fail; existing state stays
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      load(activeCategory);
    }, [load, activeCategory]),
  );

  function handleCategorySelect(cat: CategoryFilter) {
    setActiveCategory(cat);
    load(cat);
  }

  function handleRefresh() {
    setRefreshing(true);
    load(activeCategory, true);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Closet</Text>
        <Text style={styles.headerCount}>
          {totalCount}{' '}
          <Text style={styles.headerCountMax}>/ {MAX_WARDROBE_SIZE}</Text>
        </Text>
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={styles.filterScroll}
      >
        {CATEGORY_FILTERS.map((f) => {
          const active = activeCategory === f.value;
          return (
            <Pressable
              key={String(f.value)}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => handleCategorySelect(f.value)}
            >
              <Text
                style={[styles.chipText, active && styles.chipTextActive]}
                numberOfLines={1}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Grid */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#1a1a1a" />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>Nothing here yet</Text>
          <Text style={styles.emptyBody}>
            Tap the + button to photograph your first item.
          </Text>
        </View>
      ) : (
        <FlatList
          style={styles.listFlex}
          data={items}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.gridRow}
          renderItem={({ item }) => (
            <ItemCard item={item} cardWidth={cardWidth} />
          )}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.85}
        onPress={() => router.push('/add-item/camera')}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#faf9f7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a1a',
    letterSpacing: -0.5,
  },
  headerCount: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  headerCountMax: {
    fontWeight: '400',
    color: '#a0a0a0',
  },
  filterScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  filterRow: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#f0eeec',
  },
  chipActive: {
    backgroundColor: '#1a1a1a',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6b6b6b',
    lineHeight: 18,
  },
  chipTextActive: {
    color: '#ffffff',
  },
  listFlex: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingBottom: 80,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: 15,
    color: '#6b6b6b',
    textAlign: 'center',
    lineHeight: 22,
  },
  grid: {
    paddingHorizontal: 14,
    paddingBottom: 100,
  },
  gridRow: {
    gap: 12,
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardImageContainer: {
    aspectRatio: 1,
    backgroundColor: '#f7f6f4',
    position: 'relative',
  },
  cardImage: {
    flex: 1,
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  failedOverlay: {
    backgroundColor: 'rgba(220,38,38,0.5)',
  },
  failedText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
  },
  cardFooter: {
    padding: 10,
    gap: 4,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#f0eeec',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#6b6b6b',
  },
  itemName: {
    fontSize: 12,
    color: '#1a1a1a',
    fontWeight: '500',
  },
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
});
