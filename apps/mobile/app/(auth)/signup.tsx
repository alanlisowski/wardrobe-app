import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Link } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../../context/auth';

export default function Signup() {
  const { signup } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSignup() {
    if (!email.trim() || !password || !confirm) {
      Alert.alert('Missing fields', 'Please fill in all fields.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Password too short', 'Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Passwords don\'t match', 'Please make sure your passwords match.');
      return;
    }
    setLoading(true);
    try {
      await signup(email.trim().toLowerCase(), password);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign up failed. Please try again.';
      Alert.alert('Sign up failed', msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style="dark" />
      <View style={styles.inner}>
        <Text style={styles.wordmark}>Wardrobe</Text>
        <Text style={styles.tagline}>Create your account.</Text>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#a0a0a0"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            returnKeyType="next"
            autoComplete="email"
          />
          <TextInput
            style={styles.input}
            placeholder="Password (min. 8 characters)"
            placeholderTextColor="#a0a0a0"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            returnKeyType="next"
            autoComplete="new-password"
          />
          <TextInput
            style={styles.input}
            placeholder="Confirm password"
            placeholderTextColor="#a0a0a0"
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleSignup}
          />
          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleSignup}
            activeOpacity={0.85}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.btnText}>Create account</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <Link href="/(auth)/login" asChild>
            <TouchableOpacity>
              <Text style={styles.footerLink}>Sign in</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#faf9f7',
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  wordmark: {
    fontSize: 40,
    fontWeight: '700',
    color: '#1a1a1a',
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 16,
    color: '#6b6b6b',
    marginTop: 6,
    marginBottom: 44,
  },
  form: {
    gap: 12,
  },
  input: {
    height: 52,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e8e5e0',
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#1a1a1a',
  },
  btn: {
    height: 52,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 36,
  },
  footerText: {
    color: '#6b6b6b',
    fontSize: 15,
  },
  footerLink: {
    color: '#1a1a1a',
    fontSize: 15,
    fontWeight: '600',
  },
});
