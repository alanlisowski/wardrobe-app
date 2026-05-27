/**
 * Gallery import screen
 *
 * Flow:
 *   1. Check / request media-library permission
 *   2. Launch the system image picker (multi-select)
 *   3. Cap selection to remaining wardrobe capacity
 *   4. Upload each photo through the same pipeline the camera uses
 *   5. Show batch progress (per-photo status + overall bar)
 *   6. When done, offer "View Closet"
 */
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../lib/api';

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_WARDROBE_SIZE = 150; // keep in sync with @wardrobe/shared
const UPLOAD_CONCURRENCY = 3; // parallel uploads

// ── Types ─────────────────────────────────────────────────────────────────────

type UploadStatus = 'queued' | 'uploading' | 'done' | 'failed';

interface PhotoItem {
  uri: string;
  status: UploadStatus;
  error?: string;
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'permission_denied' }
  | {
      kind: 'progress';
      photos: PhotoItem[];
      cappedMsg?: string;
      allDone: boolean;
    };

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: UploadStatus }) {
  switch (status) {
    case 'queued':
      return <View style={statusStyles.queuedDot} />;
    case 'uploading':
      return <ActivityIndicator size="small" color="#6b6b6b" />;
    case 'done':
      return <Ionicons name="checkmark-circle" size={20} color="#16a34a" />;
    case 'failed':
      return <Ionicons name="close-circle" size={20} color="#ef4444" />;
  }
}

function statusLabel(status: UploadStatus): string {
  switch (status) {
    case 'queued':
      return 'Queued';
    case 'uploading':
      return 'Uploading…';
    case 'done':
      return 'Done';
    case 'failed':
      return 'Failed';
  }
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function GalleryScreen() {
  const router = useRouter();
  const [permission, requestPermission] = ImagePicker.useMediaLibraryPermissions();
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });

  // Prevent double-launch (React Strict Mode / hot-reload)
  const hasLaunched = useRef(false);
  // Shared mutable index consumed by concurrent upload workers
  const uploadIndexRef = useRef(0);

  // ── Start the flow once permission state is known ────────────────────────
  useEffect(() => {
    if (permission === null) return; // hook still loading
    if (hasLaunched.current) return;
    hasLaunched.current = true;

    async function flow() {
      // 1. Ensure we have library access
      let granted = permission!.granted;
      if (!granted) {
        if (!permission!.canAskAgain) {
          setPhase({ kind: 'permission_denied' });
          return;
        }
        const result = await requestPermission();
        granted = result.granted;
        if (!granted) {
          setPhase({ kind: 'permission_denied' });
          return;
        }
      }

      // 2. Launch system picker
      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.85,
        orderedSelection: true,
      });

      if (pickerResult.canceled || pickerResult.assets.length === 0) {
        router.back();
        return;
      }

      // 3. Enforce wardrobe cap
      let currentCount = 0;
      try {
        const { total } = await api.listItems();
        currentCount = total;
      } catch {
        // If we can't fetch, proceed — the server enforces the cap per-upload
      }

      const remaining = MAX_WARDROBE_SIZE - currentCount;

      if (remaining <= 0) {
        setPhase({
          kind: 'progress',
          photos: [],
          cappedMsg: `Your wardrobe is at the ${MAX_WARDROBE_SIZE}-item limit. Delete items to add more.`,
          allDone: true,
        });
        return;
      }

      const selected = pickerResult.assets;
      let cappedMsg: string | undefined;
      const toUpload = selected.slice(0, remaining);

      if (selected.length > remaining) {
        cappedMsg =
          `You can add ${remaining} more item${remaining === 1 ? '' : 's'} — ` +
          `only the first ${remaining} photo${remaining === 1 ? '' : 's'} will be imported.`;
      }

      const photos: PhotoItem[] = toUpload.map((asset) => ({
        uri: asset.uri,
        status: 'queued',
      }));

      setPhase({ kind: 'progress', photos, cappedMsg, allDone: false });
      uploadIndexRef.current = 0;

      // 4. Upload with bounded concurrency
      const workerCount = Math.min(UPLOAD_CONCURRENCY, photos.length);
      await Promise.all(
        Array.from({ length: workerCount }, async () => {
          while (true) {
            const idx = uploadIndexRef.current++;
            if (idx >= photos.length) break;

            // Mark this slot as uploading
            setPhase((prev) => {
              if (prev.kind !== 'progress') return prev;
              return {
                ...prev,
                photos: prev.photos.map((p, i) =>
                  i === idx ? { ...p, status: 'uploading' as const } : p,
                ),
              };
            });

            try {
              // Reuse the same upload path the camera uses
              await api.uploadItem(photos[idx]!.uri);
              setPhase((prev) => {
                if (prev.kind !== 'progress') return prev;
                return {
                  ...prev,
                  photos: prev.photos.map((p, i) =>
                    i === idx ? { ...p, status: 'done' as const } : p,
                  ),
                };
              });
            } catch (err) {
              const errMsg =
                err instanceof Error ? err.message : 'Upload failed';
              setPhase((prev) => {
                if (prev.kind !== 'progress') return prev;
                return {
                  ...prev,
                  photos: prev.photos.map((p, i) =>
                    i === idx
                      ? { ...p, status: 'failed' as const, error: errMsg }
                      : p,
                  ),
                };
              });
            }
          }
        }),
      );

      // 5. Mark batch complete
      setPhase((prev) => {
        if (prev.kind !== 'progress') return prev;
        return { ...prev, allDone: true };
      });
    }

    flow().catch((err: unknown) => {
      console.error('[gallery] unexpected error:', err);
      router.back();
    });
  }, [permission]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Permission denied ─────────────────────────────────────────────────────
  if (phase.kind === 'permission_denied') {
    return (
      <SafeAreaView style={styles.permContainer} edges={['top', 'bottom']}>
        <Ionicons name="images-outline" size={56} color="#a0a0a0" />
        <Text style={styles.permTitle}>Photo library access needed</Text>
        <Text style={styles.permBody}>
          Allow Wardrobe to access your photo library to import your clothes.
        </Text>
        <TouchableOpacity
          style={styles.permBtn}
          onPress={() => Linking.openSettings()}
          activeOpacity={0.85}
        >
          <Text style={styles.permBtnText}>Open Settings</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.permCancelBtn}
        >
          <Text style={styles.permCancelText}>Cancel</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Loading (permission check / picker open) ──────────────────────────────
  if (phase.kind === 'loading') {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#1a1a1a" />
      </View>
    );
  }

  // ── Batch progress ─────────────────────────────────────────────────────────
  const { photos, cappedMsg, allDone } = phase;

  const finishedCount = photos.filter(
    (p) => p.status === 'done' || p.status === 'failed',
  ).length;
  const successCount = photos.filter((p) => p.status === 'done').length;
  const failedCount = photos.filter((p) => p.status === 'failed').length;
  const progress = photos.length > 0 ? finishedCount / photos.length : 1;
  // Template-literal type required by RN's DimensionValue (`${number}%`)
  const progressPct: `${number}%` = `${Math.round(progress * 100)}%`;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {allDone ? 'Import complete' : 'Importing…'}
        </Text>
        {!allDone && photos.length > 0 && (
          <Text style={styles.headerCount}>
            {finishedCount} / {photos.length}
          </Text>
        )}
      </View>

      {/* Cap warning */}
      {cappedMsg ? (
        <View style={styles.capNotice}>
          <Ionicons name="information-circle" size={16} color="#92400e" />
          <Text style={styles.capNoticeText}>{cappedMsg}</Text>
        </View>
      ) : null}

      {/* Progress bar */}
      {photos.length > 0 ? (
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              // eslint-disable-next-line react-native/no-inline-styles
              { width: progressPct },
            ]}
          />
        </View>
      ) : null}

      {/* Photo list */}
      {photos.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            {cappedMsg ?? 'No photos to import.'}
          </Text>
        </View>
      ) : (
        <FlatList
          style={styles.list}
          data={photos}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={styles.listContent}
          renderItem={({ item, index }) => (
            <View style={styles.photoRow}>
              <Image
                source={{ uri: item.uri }}
                style={styles.thumb}
                contentFit="cover"
              />
              <View style={styles.photoMeta}>
                <Text style={styles.photoIndex}>Photo {index + 1}</Text>
                <Text
                  style={[
                    styles.photoStatus,
                    item.status === 'done' && styles.statusDone,
                    item.status === 'failed' && styles.statusFailed,
                  ]}
                >
                  {statusLabel(item.status)}
                </Text>
                {item.error ? (
                  <Text style={styles.photoError} numberOfLines={1}>
                    {item.error}
                  </Text>
                ) : null}
              </View>
              <StatusIcon status={item.status} />
            </View>
          )}
        />
      )}

      {/* Completion footer */}
      {allDone ? (
        <View style={styles.footer}>
          {failedCount > 0 ? (
            <Text style={styles.summaryText}>
              {successCount} imported · {failedCount} failed
            </Text>
          ) : null}
          <TouchableOpacity
            style={styles.doneBtn}
            onPress={() => router.replace('/(tabs)/closet')}
            activeOpacity={0.85}
          >
            <Text style={styles.doneBtnText}>View Closet</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const statusStyles = StyleSheet.create({
  queuedDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#d0cdc9',
  },
});

const styles = StyleSheet.create({
  // ── Loading ────────────────────────────────────────────────────────────────
  loadingContainer: {
    flex: 1,
    backgroundColor: '#faf9f7',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Permission denied ──────────────────────────────────────────────────────
  permContainer: {
    flex: 1,
    backgroundColor: '#faf9f7',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  permTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a1a',
    textAlign: 'center',
    marginTop: 8,
  },
  permBody: {
    fontSize: 15,
    color: '#6b6b6b',
    textAlign: 'center',
    lineHeight: 22,
  },
  permBtn: {
    marginTop: 12,
    height: 52,
    width: '100%',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  permCancelBtn: {
    paddingVertical: 8,
  },
  permCancelText: {
    fontSize: 15,
    color: '#6b6b6b',
  },

  // ── Progress screen ────────────────────────────────────────────────────────
  container: {
    flex: 1,
    backgroundColor: '#faf9f7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e8e5e0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  headerCount: {
    fontSize: 14,
    color: '#6b6b6b',
    fontWeight: '500',
  },
  capNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#fef3c7',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
  },
  capNoticeText: {
    flex: 1,
    fontSize: 13,
    color: '#92400e',
    lineHeight: 19,
  },
  progressTrack: {
    height: 4,
    backgroundColor: '#e8e5e0',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#1a1a1a',
    borderRadius: 2,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingVertical: 8,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e8e5e0',
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: '#f0eeec',
  },
  photoMeta: {
    flex: 1,
    gap: 2,
  },
  photoIndex: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1a1a1a',
  },
  photoStatus: {
    fontSize: 13,
    color: '#6b6b6b',
  },
  statusDone: {
    color: '#16a34a',
  },
  statusFailed: {
    color: '#ef4444',
  },
  photoError: {
    fontSize: 11,
    color: '#ef4444',
    marginTop: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 15,
    color: '#6b6b6b',
    textAlign: 'center',
    lineHeight: 22,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 8 : 16,
    backgroundColor: '#faf9f7',
    borderTopWidth: 1,
    borderTopColor: '#e8e5e0',
    gap: 10,
  },
  summaryText: {
    fontSize: 14,
    color: '#6b6b6b',
    textAlign: 'center',
  },
  doneBtn: {
    height: 54,
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
