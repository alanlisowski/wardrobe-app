import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../lib/api';

type Phase = 'camera' | 'preview' | 'uploading';

export default function CameraScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [phase, setPhase] = useState<Phase>('camera');
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  async function handleCapture() {
    try {
      const photo = await cameraRef.current?.takePictureAsync({
        quality: 0.85,
        exif: false,
      });
      if (photo?.uri) {
        setPhotoUri(photo.uri);
        setPhase('preview');
      }
    } catch {
      Alert.alert('Error', 'Could not take photo. Please try again.');
    }
  }

  async function handleUpload() {
    if (!photoUri) return;
    setPhase('uploading');
    try {
      const { id } = await api.uploadItem(photoUri);
      router.replace({
        pathname: '/add-item/processing',
        params: { itemId: id, photoUri },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed.';
      Alert.alert('Upload failed', msg);
      setPhase('preview');
    }
  }

  if (!permission) {
    return (
      <View style={styles.permissionContainer}>
        <ActivityIndicator color="#1a1a1a" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permissionContainer}>
        <Ionicons name="camera-outline" size={56} color="#a0a0a0" />
        <Text style={styles.permissionTitle}>Camera access needed</Text>
        <Text style={styles.permissionBody}>
          Allow Wardrobe to use your camera to photograph your clothes.
        </Text>
        <TouchableOpacity
          style={styles.permissionBtn}
          onPress={requestPermission}
          activeOpacity={0.85}
        >
          <Text style={styles.permissionBtnText}>Allow camera</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} style={styles.cancelBtn}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // Upload loading overlay
  if (phase === 'uploading') {
    return (
      <View style={styles.uploadingContainer}>
        {photoUri && (
          <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
        )}
        <View style={styles.uploadingOverlay}>
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={styles.uploadingText}>Uploading…</Text>
        </View>
      </View>
    );
  }

  // Photo preview
  if (phase === 'preview' && photoUri) {
    return (
      <View style={styles.previewContainer}>
        <Image
          source={{ uri: photoUri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
        {/* Overlay — top/bottom insets applied directly so the X and
            action buttons clear the status bar and home indicator */}
        <View style={[styles.previewOverlay, { paddingTop: insets.top }]}>
          <TouchableOpacity
            onPress={() => setPhase('camera')}
            style={styles.previewClose}
          >
            <Ionicons name="close" size={28} color="#ffffff" />
          </TouchableOpacity>
          <View style={[styles.previewActions, { paddingBottom: insets.bottom + 24 }]}>
            <TouchableOpacity
              style={styles.retakeBtn}
              onPress={() => setPhase('camera')}
              activeOpacity={0.85}
            >
              <Text style={styles.retakeBtnText}>Retake</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.useBtn}
              onPress={handleUpload}
              activeOpacity={0.85}
            >
              <Text style={styles.useBtnText}>Use photo</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // Camera viewfinder
  return (
    <View style={styles.cameraContainer}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} />

      {/* Full-bleed overlay — insets applied directly on each control strip
          so the camera preview stays edge-to-edge */}
      <View style={styles.cameraUI}>
        {/* Top bar: offset below status bar via insets.top */}
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="close" size={28} color="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.cameraHint}>Lay the item flat or hang it up</Text>
          <TouchableOpacity
            onPress={() => setFacing(facing === 'back' ? 'front' : 'back')}
            style={styles.iconBtn}
          >
            <Ionicons name="camera-reverse-outline" size={28} color="#ffffff" />
          </TouchableOpacity>
        </View>

        {/* Capture button: offset above home indicator via insets.bottom */}
        <View style={[styles.captureRow, { paddingBottom: insets.bottom + 24 }]}>
          <TouchableOpacity
            style={styles.captureBtn}
            onPress={handleCapture}
            activeOpacity={0.85}
          >
            <View style={styles.captureBtnInner} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  permissionContainer: {
    flex: 1,
    backgroundColor: '#faf9f7',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  permissionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a1a',
    textAlign: 'center',
    marginTop: 8,
  },
  permissionBody: {
    fontSize: 15,
    color: '#6b6b6b',
    textAlign: 'center',
    lineHeight: 22,
  },
  permissionBtn: {
    marginTop: 12,
    height: 52,
    width: '100%',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelBtn: {
    paddingVertical: 8,
  },
  cancelBtnText: {
    fontSize: 15,
    color: '#6b6b6b',
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraUI: {
    flex: 1,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    // paddingTop is set dynamically: insets.top + 8
  },
  iconBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraHint: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    fontWeight: '500',
  },
  captureRow: {
    alignItems: 'center',
    // paddingBottom is set dynamically: insets.bottom + 24
  },
  captureBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderWidth: 2,
    borderColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureBtnInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#ffffff',
  },
  previewContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  previewOverlay: {
    flex: 1,
    justifyContent: 'space-between',
  },
  previewClose: {
    padding: 16,
    alignSelf: 'flex-start',
  },
  previewActions: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    // paddingBottom is set dynamically: insets.bottom + 24
    gap: 12,
  },
  retakeBtn: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  retakeBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  useBtn: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  useBtnText: {
    color: '#1a1a1a',
    fontSize: 16,
    fontWeight: '600',
  },
  uploadingContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  uploadingText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
