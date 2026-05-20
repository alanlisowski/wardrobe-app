import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";

export default function Home() {
  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <Text style={styles.title}>Wardrobe</Text>
      <Text style={styles.subtitle}>Your closet, organized by AI.</Text>
      <Text style={styles.todo}>
        TODO: build the Closet, Suggest, Add-item, Builder, and Log screens.
        {"\n"}See SPEC section 12.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#faf9f7",
  },
  title: { fontSize: 42, fontWeight: "700", color: "#1a1a1a" },
  subtitle: { fontSize: 17, color: "#6b6b6b", marginTop: 8 },
  todo: {
    fontSize: 13,
    color: "#999999",
    marginTop: 36,
    textAlign: "center",
    lineHeight: 20,
  },
});
