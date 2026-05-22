import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function Suggest() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.title}>Suggest</Text>
        <Text style={styles.body}>Outfit suggestions — coming soon.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#faf9f7' },
  inner: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  title: { fontSize: 24, fontWeight: '700', color: '#1a1a1a', marginBottom: 8 },
  body: { fontSize: 15, color: '#6b6b6b', textAlign: 'center' },
});
