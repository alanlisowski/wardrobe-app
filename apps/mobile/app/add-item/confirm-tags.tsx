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
import { api, type ApiItem, type ItemPatch } from '../../lib/api';

// ── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = ['top', 'bottom', 'dress', 'outerwear', 'footwear', 'accessory'] as const;
const PATTERNS = ['solid', 'striped', 'plaid', 'checked', 'floral', 'graphic', 'other'] as const;
const SEASONS = ['spring', 'summer', 'fall', 'winter'] as const;
const STYLE_PRESETS = [
  'casual', 'minimalist', 'streetwear', 'sporty', 'formal', 'vintage', 'preppy', 'business',
] as const;

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

function FieldLabel({ children }: { children: string }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

function ChipRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <View style={chipStyles.row}>
      {options.map((opt) => {
        const active = value === opt;
        return (
          <Pressable
            key={opt}
            style={[chipStyles.chip, active && chipStyles.active]}
            onPress={() => onChange(opt)}
          >
            <Text style={[chipStyles.text, active && chipStyles.activeText]}>{opt}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function MultiChipRow({
  options,
  value,
  onChange,
}: {
  options: readonly string[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  function toggle(opt: string) {
    onChange(
      value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt],
    );
  }
  return (
    <View style={chipStyles.row}>
      {options.map((opt) => {
        const active = value.includes(opt);
        return (
          <Pressable
            key={opt}
            style={[chipStyles.chip, active && chipStyles.active]}
            onPress={() => toggle(opt)}
          >
            <Text style={[chipStyles.text, active && chipStyles.activeText]}>{opt}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function DotRating({
  value,
  onChange,
  lowLabel,
  highLabel,
}: {
  value: number | null;
  onChange: (v: number) => void;
  lowLabel: string;
  highLabel: string;
}) {
  return (
    <View style={dotStyles.container}>
      <Text style={dotStyles.sideLabel}>{lowLabel}</Text>
      <View style={dotStyles.row}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} onPress={() => onChange(n)} style={dotStyles.dot}>
            <View
              style={[
                dotStyles.circle,
                value !== null && n <= value && dotStyles.filled,
              ]}
            />
          </Pressable>
        ))}
      </View>
      <Text style={dotStyles.sideLabel}>{highLabel}</Text>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ConfirmTags() {
  const router = useRouter();
  const { itemId } = useLocalSearchParams<{ itemId: string }>();

  const [item, setItem] = useState<ApiItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number] | null>(null);
  const [subcategory, setSubcategory] = useState('');
  const [brand, setBrand] = useState('');
  const [formality, setFormality] = useState<number | null>(null);
  const [warmth, setWarmth] = useState<number | null>(null);
  const [seasons, setSeasons] = useState<string[]>([]);
  const [styleGenres, setStyleGenres] = useState<string[]>([]);
  const [pattern, setPattern] = useState<(typeof PATTERNS)[number] | null>(null);
  const [material, setMaterial] = useState('');

  useEffect(() => {
    if (!itemId) return;
    api
      .getItem(itemId)
      .then((data) => {
        setItem(data);
        setName(data.name ?? '');
        setCategory((data.category as (typeof CATEGORIES)[number]) ?? null);
        setSubcategory(data.subcategory ?? '');
        setBrand(data.brand ?? '');
        setFormality(data.formality ?? null);
        setWarmth(data.warmth ?? null);
        setSeasons((data.seasons ?? []).filter((s) => s !== 'all'));
        setStyleGenres(data.styleGenres ?? []);
        setPattern((data.pattern as (typeof PATTERNS)[number]) ?? null);
        setMaterial(data.material ?? '');
      })
      .catch(() => {
        Alert.alert('Error', 'Could not load item.');
        router.replace('/(tabs)/closet');
      })
      .finally(() => setLoading(false));
  }, [itemId]);

  async function handleSave() {
    if (!itemId) return;
    setSaving(true);
    try {
      const patch: ItemPatch = {
        name: name || undefined,
        category: category ?? undefined,
        subcategory: subcategory || undefined,
        brand: brand || undefined,
        formality: formality ?? undefined,
        warmth: warmth ?? undefined,
        seasons: seasons.length > 0 ? seasons : undefined,
        styleGenres: styleGenres.length > 0 ? styleGenres : undefined,
        pattern: pattern ?? undefined,
        material: material || undefined,
      };
      // Strip undefined keys
      Object.keys(patch).forEach(
        (k) => (patch as Record<string, unknown>)[k] === undefined && delete (patch as Record<string, unknown>)[k],
      );
      await api.patchItem(itemId, patch);
      router.replace('/(tabs)/closet');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed.';
      Alert.alert('Error', msg);
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#ffffff" size="large" />
        <Text style={styles.loadingText}>Loading tags…</Text>
      </View>
    );
  }

  if (!item) return null;

  const imageUri = item.cutoutImageUrl ?? item.originalImageUrl;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.replace('/(tabs)/closet')}
            style={styles.skipBtn}
          >
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Confirm tags</Text>
          <View style={{ width: 56 }} />
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
            {item.cutoutImageUrl && (
              <View style={styles.cutoutBadge}>
                <Ionicons name="checkmark-circle" size={14} color="#16a34a" />
                <Text style={styles.cutoutBadgeText}>Background removed</Text>
              </View>
            )}
          </View>

          {/* Hint */}
          <View style={styles.hintRow}>
            <Ionicons name="sparkles" size={14} color="#a0a0a0" />
            <Text style={styles.hintText}>
              AI-filled — tap any field to correct it
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <SectionTitle>BASIC INFO</SectionTitle>

            <View style={styles.field}>
              <FieldLabel>Name</FieldLabel>
              <TextInput
                style={styles.textInput}
                value={name}
                onChangeText={setName}
                placeholder="e.g. cream ribbed knit sweater"
                placeholderTextColor="#a0a0a0"
              />
            </View>

            <View style={styles.field}>
              <FieldLabel>Category</FieldLabel>
              <ChipRow
                options={CATEGORIES}
                value={category}
                onChange={setCategory}
              />
            </View>

            <View style={styles.field}>
              <FieldLabel>Subcategory</FieldLabel>
              <TextInput
                style={styles.textInput}
                value={subcategory}
                onChangeText={setSubcategory}
                placeholder="e.g. crew-neck, straight-leg"
                placeholderTextColor="#a0a0a0"
              />
            </View>

            <View style={styles.field}>
              <FieldLabel>Brand (if visible)</FieldLabel>
              <TextInput
                style={styles.textInput}
                value={brand}
                onChangeText={setBrand}
                placeholder="e.g. Uniqlo"
                placeholderTextColor="#a0a0a0"
              />
            </View>

            <View style={styles.field}>
              <FieldLabel>Material</FieldLabel>
              <TextInput
                style={styles.textInput}
                value={material}
                onChangeText={setMaterial}
                placeholder="e.g. 100% cotton"
                placeholderTextColor="#a0a0a0"
              />
            </View>

            <SectionTitle>STYLE</SectionTitle>

            <View style={styles.field}>
              <FieldLabel>Pattern</FieldLabel>
              <ChipRow
                options={PATTERNS}
                value={pattern}
                onChange={setPattern}
              />
            </View>

            <View style={styles.field}>
              <FieldLabel>Style genres</FieldLabel>
              <MultiChipRow
                options={STYLE_PRESETS}
                value={styleGenres}
                onChange={setStyleGenres}
              />
            </View>

            <SectionTitle>PRACTICAL</SectionTitle>

            <View style={styles.field}>
              <FieldLabel>Formality</FieldLabel>
              <DotRating
                value={formality}
                onChange={setFormality}
                lowLabel="Casual"
                highLabel="Formal"
              />
            </View>

            <View style={styles.field}>
              <FieldLabel>Warmth</FieldLabel>
              <DotRating
                value={warmth}
                onChange={setWarmth}
                lowLabel="Summer"
                highLabel="Winter"
              />
            </View>

            <View style={styles.field}>
              <FieldLabel>Seasons</FieldLabel>
              <MultiChipRow
                options={SEASONS as readonly string[]}
                value={seasons}
                onChange={setSeasons}
              />
            </View>
          </View>

          {/* Bottom spacer for the fixed button */}
          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Save button — floats above keyboard */}
        <View style={styles.saveContainer}>
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            activeOpacity={0.85}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.saveBtnText}>Save to closet</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const chipStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#f0eeec',
  },
  active: {
    backgroundColor: '#1a1a1a',
  },
  text: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6b6b6b',
  },
  activeText: {
    color: '#ffffff',
  },
});

const dotStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  dot: {
    padding: 4,
  },
  circle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#d0cdc9',
  },
  filled: {
    backgroundColor: '#1a1a1a',
    borderColor: '#1a1a1a',
  },
  sideLabel: {
    fontSize: 11,
    color: '#a0a0a0',
    minWidth: 44,
  },
});

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
  },
  container: {
    flex: 1,
    backgroundColor: '#faf9f7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e8e5e0',
  },
  skipBtn: {
    width: 56,
  },
  skipText: {
    fontSize: 15,
    color: '#6b6b6b',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  scrollContent: {
    paddingBottom: 24,
  },
  imageContainer: {
    height: 280,
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#f0eeec',
  },
  image: {
    flex: 1,
  },
  cutoutBadge: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  cutoutBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#16a34a',
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  hintText: {
    fontSize: 12,
    color: '#a0a0a0',
  },
  form: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 20,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#a0a0a0',
    letterSpacing: 1,
    marginTop: 8,
    marginBottom: -4,
  },
  field: {
    gap: 0,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b6b6b',
    marginBottom: 2,
  },
  textInput: {
    marginTop: 6,
    height: 46,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e8e5e0',
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#1a1a1a',
  },
  saveContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 8 : 16,
    backgroundColor: '#faf9f7',
    borderTopWidth: 1,
    borderTopColor: '#e8e5e0',
  },
  saveBtn: {
    height: 54,
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
