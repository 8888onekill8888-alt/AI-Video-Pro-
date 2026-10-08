import { useFonts } from "expo-font";
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from "@expo-google-fonts/space-grotesk";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";

export default function RootLayout() {
  const [loaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });

  if (!loaded) return <View style={{ flex: 1, backgroundColor: "#101310" }} />;

  return (
    <View style={{ flex: 1, backgroundColor: "#101310" }}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#101310" },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="projects/[id]"
          options={{ animation: "slide_from_right" }}
        />
        <Stack.Screen
          name="editor/[id]"
          options={{ animation: "slide_from_right" }}
        />
      </Stack>
    </View>
  );
}
