import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../context/auth';
import { useAuth } from '../context/auth';

function NavigationGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (user && inAuthGroup) {
      router.replace('/(tabs)/closet');
    } else if (!user && !inAuthGroup && segments[0] !== 'index') {
      router.replace('/(auth)/login');
    }
  }, [user, isLoading]);

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationGuard>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="add-item"
              options={{
                presentation: 'fullScreenModal',
                animation: 'slide_from_bottom',
              }}
            />
          </Stack>
        </NavigationGuard>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
