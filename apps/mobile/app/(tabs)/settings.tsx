import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../lib/api';
import { useAuth } from '../../context/auth';

// ── Geocoding types ──────────────────────────────────────────────────────────

interface GeoResult {
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  admin1?: string;
}

async function searchCities(query: string): Promise<GeoResult[]> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query.trim())}&count=5&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Geocoding failed');
  const data = (await res.json()) as { results?: GeoResult[] };
  return data.results ?? [];
}

function cityLabel(r: GeoResult): string {
  return [r.name, r.admin1, r.country].filter(Boolean).join(', ');
}

// ── Main screen ──────────────────────────────────────────────────────────────

export default function Settings() {
  const { user, refreshUser, logout } = useAuth();

  const [gpsLoading, setGpsLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [cityQuery, setCityQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<GeoResult[]>([]);

  const hasLocation = user?.lat != null && user?.lon != null;

  // ── Save helpers ────────────────────────────────────────────────────────────

  async function persistLocation(lat: number, lon: number) {
    setSaveLoading(true);
    try {
      const updated = await api.updateLocation(lat, lon);
      refreshUser(updated);
      Alert.alert('Location saved', 'Weather on the Suggest screen will now reflect your home location.');
    } catch {
      Alert.alert('Error', 'Could not save location. Is the API running?');
    } finally {
      setSaveLoading(false);
    }
  }

  // ── GPS ─────────────────────────────────────────────────────────────────────

  async function handleUseGPS() {
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission denied',
          'Location access was denied. You can still set your location manually by searching for a city below.',
        );
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      await persistLocation(pos.coords.latitude, pos.coords.longitude);
    } catch {
      Alert.alert('Location error', 'Could not get your position. Try again or set it manually.');
    } finally {
      setGpsLoading(false);
    }
  }

  // ── City search ─────────────────────────────────────────────────────────────

  async function handleSearch() {
    if (!cityQuery.trim()) return;
    setSearchLoading(true);
    setSearchResults([]);
    try {
      const results = await searchCities(cityQuery);
      setSearchResults(results);
      if (results.length === 0) {
        Alert.alert('No results', 'No cities matched that search. Try a different spelling.');
      }
    } catch {
      Alert.alert('Search failed', 'Could not reach the geocoding service. Check your connection.');
    } finally {
      setSearchLoading(false);
    }
  }

  async function handlePickCity(result: GeoResult) {
    setSearchResults([]);
    setCityQuery('');
    await persistLocation(result.latitude, result.longitude);
  }

  // ── Sign out ────────────────────────────────────────────────────────────────

  function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: logout },
    ]);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const busy = gpsLoading || saveLoading;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
        {saveLoading && <ActivityIndicator size="small" color="#a0a0a0" />}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Location section ── */}
        <Text style={styles.sectionLabel}>Location</Text>
        <View style={styles.card}>
          {/* Current value */}
          <View style={styles.locationStatus}>
            <Ionicons name="location-outline" size={20} color="#6b6b6b" style={styles.locationIcon} />
            <View>
              <Text style={styles.locationTitle}>Home location</Text>
              {hasLocation ? (
                <Text style={styles.locationCoords}>
                  {Number(user!.lat).toFixed(4)}°, {Number(user!.lon).toFixed(4)}°
                </Text>
              ) : (
                <View style={styles.unsetBadge}>
                  <Text style={styles.unsetBadgeText}>Not set</Text>
                </View>
              )}
            </View>
          </View>

          {/* GPS button */}
          <TouchableOpacity
            style={[styles.gpsBtn, busy && styles.btnDisabled]}
            activeOpacity={0.85}
            onPress={handleUseGPS}
            disabled={busy}
          >
            {gpsLoading ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <>
                <Ionicons name="navigate-outline" size={16} color="#ffffff" />
                <Text style={styles.gpsBtnText}>Use my current location</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or search by city</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* City search */}
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              placeholder="City name…"
              placeholderTextColor="#b0b0b0"
              value={cityQuery}
              onChangeText={setCityQuery}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
              autoCapitalize="words"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[
                styles.searchBtn,
                (!cityQuery.trim() || searchLoading || busy) && styles.btnDisabled,
              ]}
              activeOpacity={0.85}
              onPress={handleSearch}
              disabled={!cityQuery.trim() || searchLoading || busy}
            >
              {searchLoading ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Ionicons name="search" size={18} color="#ffffff" />
              )}
            </TouchableOpacity>
          </View>

          {/* Search results */}
          {searchResults.length > 0 && (
            <View style={styles.resultsList}>
              {searchResults.map((r, i) => (
                <Pressable
                  key={i}
                  style={({ pressed }) => [
                    styles.resultRow,
                    i < searchResults.length - 1 && styles.resultRowBorder,
                    pressed && styles.resultRowPressed,
                  ]}
                  onPress={() => handlePickCity(r)}
                >
                  <Ionicons name="location-outline" size={14} color="#a0a0a0" />
                  <Text style={styles.resultText}>{cityLabel(r)}</Text>
                  <Ionicons name="chevron-forward" size={14} color="#c0c0c0" />
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* ── Account section ── */}
        <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>Account</Text>
        <View style={styles.card}>
          <View style={styles.accountRow}>
            <Ionicons name="person-outline" size={18} color="#6b6b6b" />
            <Text style={styles.accountEmail}>{user?.email ?? '—'}</Text>
          </View>

          <View style={styles.cardDivider} />

          <TouchableOpacity
            style={styles.signOutRow}
            activeOpacity={0.7}
            onPress={handleSignOut}
          >
            <Ionicons name="log-out-outline" size={18} color="#dc2626" />
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomPad} />
      </ScrollView>
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

  // Scroll
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },

  // Section labels
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#a0a0a0',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  sectionLabelSpaced: {
    marginTop: 28,
  },

  // Card container
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    gap: 14,
  },

  // Location status row
  locationStatus: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  locationIcon: {
    marginTop: 1,
  },
  locationTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 3,
  },
  locationCoords: {
    fontSize: 13,
    color: '#6b6b6b',
    fontVariant: ['tabular-nums'],
  },
  unsetBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#fef3c7',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  unsetBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#b45309',
  },

  // GPS button
  gpsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingVertical: 13,
  },
  gpsBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },

  // Divider
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#eeece8',
  },
  dividerText: {
    fontSize: 12,
    color: '#a0a0a0',
    fontWeight: '500',
  },

  // City search
  searchRow: {
    flexDirection: 'row',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#f7f6f4',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: '#1a1a1a',
  },
  searchBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Search results
  resultsList: {
    backgroundColor: '#f7f6f4',
    borderRadius: 10,
    overflow: 'hidden',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  resultRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#eeece8',
  },
  resultRowPressed: {
    backgroundColor: '#eeecea',
  },
  resultText: {
    flex: 1,
    fontSize: 14,
    color: '#1a1a1a',
  },

  // Account
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  accountEmail: {
    fontSize: 15,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#eeece8',
  },
  signOutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  signOutText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#dc2626',
  },

  // Disabled state
  btnDisabled: {
    opacity: 0.45,
  },

  bottomPad: {
    height: 40,
  },
});
