import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';

import { api } from '../../lib/api';

const POLL_INTERVAL_MS = 2500;
const MAX_POLLS = 40; // 2.5s × 40 = 100s — slightly longer than the 90s worker timeout

type ScreenState = 'polling' | 'failed' | 'timeout';

export default function Processing() {
  const router = useRouter();
  const { itemId, photoUri } = useLocalSearchParams<{
    itemId: string;
    photoUri?: string;
  }>();

  const [screenState, setScreenState] = useState<ScreenState>('polling');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const polls = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function stopPolling() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  useEffect(() => {
    if (!itemId) return;

    function schedule() {
      timerRef.current = setTimeout(async () => {
        polls.current += 1;

        if (polls.current > MAX_POLLS) {
          stopPolling();
          setErrorMsg('This is taking longer than expected. The job may have stalled.');
          setScreenState('timeout');
          return;
        }

        try {
          const item = await api.getItem(itemId);

          if (item.procStatus === 'ready') {
            stopPolling();
            router.replace({
              pathname: '/add-item/confirm-tags',
              params: { itemId },
            });
          } else if (item.procStatus === 'failed') {
            stopPolling();
            setErrorMsg(item.procError ?? 'Could not process this photo.');
            setScreenState('failed');
          } else {
            schedule();
          }
        } catch {
          schedule(); // network hiccup — keep polling
        }
      }, POLL_INTERVAL_MS);
    }

    schedule();

    return () => stopPolling();
  }, [itemId]);

  async function handleDelete() {
    if (!itemId) return;
    setDeleting(true);
    try {
      await api.deleteItem(itemId);
    } catch {
      // best-effort; navigate regardless
    }
    router.replace('/(tabs)/closet');
  }

  async function handleRetry() {
    if (!itemId) return;
    setDeleting(true);
    try {
      await api.deleteItem(itemId);
    } catch {
      // best-effort
    }
    router.replace('/add-item/camera');
  }

  const isFailed = screenState === 'failed' || screenState === 'timeout';

  return (
    <View style={styles.container}>
      {photoUri ? (
        <Image
          source={{ uri: photoUri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
      ) : null}

      <View style={styles.overlay}>
        {isFailed ? (
          <>
            <Text style={styles.failIcon}>✕</Text>
            <Text style={styles.title}>
              {screenState === 'timeout' ? 'Still processing…' : 'Cataloging failed'}
            </Text>
            <Text style={styles.body}>{errorMsg}</Text>
            <View style={styles.btnRow}>
              <TouchableOpacity
                style={[styles.btn, styles.btnSecondary]}
                onPress={handleDelete}
                disabled={deleting}
                activeOpacity={0.8}
              >
                <Text style={styles.btnSecondaryText}>Delete</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary]}
                onPress={handleRetry}
                disabled={deleting}
                activeOpacity={0.8}
              >
                <Text style={styles.btnPrimaryText}>Try again</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color="#ffffff" />
            <Text style={styles.title}>Cataloging your item…</Text>
            <Text style={styles.body}>
              Removing the background, extracting colors, and tagging with AI.
              This usually takes 10–30 seconds.
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    gap: 20,
  },
  failIcon: {
    fontSize: 40,
    color: '#ef4444',
  },
  title: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  body: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  btn: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: {
    backgroundColor: '#ffffff',
  },
  btnPrimaryText: {
    color: '#1a1a1a',
    fontSize: 15,
    fontWeight: '600',
  },
  btnSecondary: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  btnSecondaryText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});
