import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function AddItemIndex() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>Add item</Text>
        <Text style={styles.subtitle}>
          Photograph a single item or import many at once from your library.
        </Text>
      </View>

      <View style={styles.options}>
        {/* ── Take photo ──────────────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.optionCard}
          activeOpacity={0.85}
          onPress={() => router.push('/add-item/camera')}
        >
          <View style={styles.iconWrap}>
            <Ionicons name="camera" size={30} color="#1a1a1a" />
          </View>
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>Take photo</Text>
            <Text style={styles.optionBody}>
              Photograph one item at a time
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#c0bdb9" />
        </TouchableOpacity>

        {/* ── Choose from gallery ─────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.optionCard}
          activeOpacity={0.85}
          onPress={() => router.push('/add-item/gallery')}
        >
          <View style={styles.iconWrap}>
            <Ionicons name="images" size={30} color="#1a1a1a" />
          </View>
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>Choose from gallery</Text>
            <Text style={styles.optionBody}>
              Import multiple items at once
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#c0bdb9" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.cancelBtn}
        onPress={() => router.back()}
        activeOpacity={0.7}
      >
        <Text style={styles.cancelText}>Cancel</Text>
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
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 28,
    gap: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a1a',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b6b6b',
    lineHeight: 20,
  },
  options: {
    paddingHorizontal: 20,
    gap: 12,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: '#f0eeec',
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionText: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 3,
  },
  optionBody: {
    fontSize: 13,
    color: '#6b6b6b',
    lineHeight: 18,
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 24,
    marginTop: 8,
  },
  cancelText: {
    fontSize: 16,
    color: '#6b6b6b',
    fontWeight: '500',
  },
});
