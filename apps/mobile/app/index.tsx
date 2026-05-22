import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../context/auth';

export default function Index() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View
        style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#faf9f7' }}
      >
        <ActivityIndicator color="#1a1a1a" />
      </View>
    );
  }

  if (user) return <Redirect href="/(tabs)/closet" />;
  return <Redirect href="/(auth)/login" />;
}
