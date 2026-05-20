import { Stack } from "expo-router";

export default function RootLayout() {
  // TODO: gate on auth state; show login stack vs the main tab navigator.
  return <Stack screenOptions={{ headerShown: false }} />;
}
