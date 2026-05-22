import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { api, type ApiItem, type ItemPatch } from '../../../lib/api';

const CATEGORIES = ['top', 'bottom', 'dress', 'outerwear', 'footwear', 'accessory'] as const;
const PATTERNS = ['solid', 'striped', 'plaid', 'checked', 'floral', 'graphic', 'other'] as const;
const SEASONS = ['spring', 'summer', 'fall', 'winter'] as const;

function ChipSelect<T extends string>({
  options,
  value,
  onChange,
  multi = false,
  multiValue,
  onMultiChange,
}: {
  options: readonly T[];
  value?: T | null;
  onChange?: (v: T) => void;
  multi?: boolean;
  multiValue?: T[];
  onMultiChange?: (v: T[]) => void;
}) {
  if (multi && multiValue !== undefined && onMultiChange) {
    return (
      <View style={chipStyles.row}>
        {options.map((opt) => {
          const active = multiValue.includes(opt);
          return (
            <Pressable
              key={opt}
              style={[chipStyles.chip, active && chipStyles.active]}
              onPress={() =>
                onMultiChange(
                  active
                    ? multiValue.filter((v) => v !== opt)
                    : [...multiValue, opt],
                )
              }
            >
              <Text style={[chipStyles.text, active && chipStyles.activeText]}>
                {opt}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <View style={chipStyles.row}>
      {options.map((opt) => {
        const active = value === opt;
        return (
          <Pressable
            key={opt}
            style={[chipStyles.chip, active && chipStyles.active]}
            onPress={() => onChange?.(opt)}
          >
            <Text style={[chipStyles.text, active && chipStyles.activeText]}>
              {opt}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function DotRating({
  value,
  onChange,
  min = 1,
  max = 5,
}: {
  value: number | null;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <View style={dotStyles.row}>
      {Array.from({ length: max - min + 1 }, (_, i) => i + min).map((n) => (
        <Pressable key={n} onPress={() => onChange(n)} style={dotStyles.dot}>
          <View
            style={[
              dotStyles.circle,
              value !== null && n <= value && dotStyles.filled,
            ]}
          />
        </Pressable>
      ))}
      <Text style={dotStyles.label}>{value ?? '—'}</Text>
    </View>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

export default function ItemDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [item, setItem] = useState<ApiItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Editable state
  const [name, setName] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [subcategory, setSubcategory] = useState('');
  const [brand, setBrand] = useState('');
  const [formality, setFormality] = useState<number | null>(null);
  const [warmth, setWarmth] = useState<number | null>(null);
  const [seasons, setSeasons] = useState<string[]>([]);
  const [pattern, setPattern] = useState<string | null>(null);
  const [material, setMaterial] = useState('');

  useEffect(() => {
    if (!id) return;
    api
      .getItem(id)
      .then((data) => {
        setItem(data);
        setName(data.name ?? '');
        setCategory(data.category ?? null);
        setSubcategory(data.subcategory ?? '');
        setBrand(data.brand ?? '');
        setFormality(data.formality ?? null);
        setWarmth(data.warmth ?? null);
        setSeasons((data.seasons ?? []).filter((s) => s !== 'all'));
        setPattern(data.pattern ?? null);
        setMaterial(data.material ?? '');
      })
      .catch(() => router.back())
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSave() {
    if (!id) return;
    setSaving(true);
    try {
      const patch: ItemPatch = {};
      if (name) patch.name = name;
      if (category) patch.category = category;
      if (subcategory) patch.subcategory = subcategory;
      if (brand) patch.brand = brand;
      if (formality !== null) patch.formality = formality;
      if (warmth !== null) patch.warmth = warmth;
      if (seasons.length > 0) patch.seasons = seasons;
      if (pattern) patch.pattern = pattern;
      if (material) patch.material = material;

      const updated = await api.patchItem(id, patch);
      setItem(updated);
      Alert.alert('Saved', 'Item updated.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed.';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    Alert.alert(
      'Delete item?',
      'This will permanently remove the item from your wardrobe.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!id) return;
            setDeleting(true);
            try {
              await api.deleteItem(id);
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

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator color="#1a1a1a" />
        </View>
      </SafeAreaView>
    );
  }

  if (!item) return null;

  const imageUri = item.cutoutImageUrl ?? item.originalImageUrl;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Nav bar */}
        <View style={styles.navBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.navBack}>
            <Ionicons name="chevron-back" size={24} color="#1a1a1a" />
          </TouchableOpacity>
          <Text style={styles.navTitle} numberOfLines={1}>
            {item.name ?? 'Item'}
          </Text>
          <TouchableOpacity
            onPress={handleSave}
            style={styles.navSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#1a1a1a" />
            ) : (
              <Text style={styles.navSaveText}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Cutout image */}
          <View style={styles.imageContainer}>
            <Image
              source={{ uri: imageUri }}
              style={styles.image}
              contentFit="contain"
              transition={200}
            />
            {item.procStatus === 'processing' && (
              <View style={styles.processingBanner}>
                <ActivityIndicator size="small" color="#ffffff" />
                <Text style={styles.processingText}>Cataloging…</Text>
              </View>
            )}
          </View>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{item.wearCount}</Text>
              <Text style={styles.statLabel}>wears</Text>
            </View>
            {item.lastWornAt && (
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  {new Date(item.lastWornAt).toLocaleDateString('en', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
                <Text style={styles.statLabel}>last worn</Text>
              </View>
            )}
          </View>

          {/* Fields */}
          <View style={styles.fields}>
            <FieldRow label="Name">
              <TextInput
                style={styles.textInput}
                value={name}
                onChangeText={setName}
                placeholder="e.g. cream ribbed knit sweater"
                placeholderTextColor="#a0a0a0"
              />
            </FieldRow>

            <FieldRow label="Category">
              <ChipSelect
                options={CATEGORIES}
                value={category as (typeof CATEGORIES)[number] | null}
                onChange={(v) => setCategory(v)}
              />
            </FieldRow>

            <FieldRow label="Subcategory">
              <TextInput
                style={styles.textInput}
                value={subcategory}
                onChangeText={setSubcategory}
                placeholder="e.g. crew-neck, straight-leg"
                placeholderTextColor="#a0a0a0"
              />
            </FieldRow>

            <FieldRow label="Brand">
              <TextInput
                style={styles.textInput}
                value={brand}
                onChangeText={setBrand}
                placeholder="e.g. Uniqlo"
                placeholderTextColor="#a0a0a0"
              />
            </FieldRow>

            <FieldRow label="Material">
              <TextInput
                style={styles.textInput}
                value={material}
                onChangeText={setMaterial}
                placeholder="e.g. 100% cotton"
                placeholderTextColor="#a0a0a0"
              />
            </FieldRow>

            <FieldRow label="Formality  1 = casual · 5 = formal">
              <DotRating value={formality} onChange={setFormality} />
            </FieldRow>

            <FieldRow label="Warmth  1 = summer · 5 = winter">
              <DotRating value={warmth} onChange={setWarmth} />
            </FieldRow>

            <FieldRow label="Seasons">
              <ChipSelect
                options={SEASONS}
                multi
                multiValue={seasons as string[]}
                onMultiChange={setSeasons}
              />
            </FieldRow>

            <FieldRow label="Pattern">
              <ChipSelect
                options={PATTERNS}
                value={pattern as (typeof PATTERNS)[number] | null}
                onChange={(v) => setPattern(v)}
              />
            </FieldRow>
          </View>

          {/* Delete */}
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={confirmDelete}
            disabled={deleting}
            activeOpacity={0.8}
          >
            {deleting ? (
              <ActivityIndicator color="#dc2626" />
            ) : (
              <Text style={styles.deleteBtnText}>Delete item</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const chipStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#f0eeec',
  },
  active: {
    backgroundColor: '#1a1a1a',
  },
  text: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6b6b6b',
  },
  activeText: {
    color: '#ffffff',
  },
});

const dotStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  dot: {
    padding: 4,
  },
  circle: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: '#d0cdc9',
    backgroundColor: 'transparent',
  },
  filled: {
    backgroundColor: '#1a1a1a',
    borderColor: '#1a1a1a',
  },
  label: {
    fontSize: 13,
    color: '#6b6b6b',
    marginLeft: 4,
    minWidth: 16,
  },
});

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
  navSave: {
    paddingHorizontal: 4,
    paddingVertical: 4,
    minWidth: 44,
    alignItems: 'flex-end',
  },
  navSaveText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  scrollContent: {
    paddingBottom: 48,
  },
  imageContainer: {
    height: 300,
    backgroundColor: '#f0eeec',
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  image: {
    flex: 1,
  },
  processingBanner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingVertical: 10,
    gap: 8,
  },
  processingText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '500',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 24,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  statLabel: {
    fontSize: 11,
    color: '#a0a0a0',
    marginTop: 2,
  },
  fields: {
    paddingHorizontal: 20,
    gap: 20,
  },
  fieldRow: {
    gap: 2,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#a0a0a0',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  textInput: {
    marginTop: 6,
    height: 44,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e8e5e0',
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#1a1a1a',
  },
  deleteBtn: {
    marginHorizontal: 20,
    marginTop: 32,
    height: 50,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#dc2626',
  },
});
