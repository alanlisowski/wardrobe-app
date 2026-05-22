import { Stack } from 'expo-router';

export default function AddItemLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="camera" />
      <Stack.Screen name="processing" />
      <Stack.Screen name="confirm-tags" />
    </Stack>
  );
}
