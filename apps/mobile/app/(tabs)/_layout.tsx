import { Tabs } from "expo-router";
import {
  Clapperboard,
  Clapperboard as StudioIcon,
  FolderOpen,
  House,
  Settings2,
} from "lucide-react-native";

const muted = "#747b75";
const accent = "#d5f36a";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          height: 82,
          paddingTop: 11,
          paddingBottom: 22,
          backgroundColor: "#111511",
          borderTopColor: "#252b25",
        },
        tabBarActiveTintColor: accent,
        tabBarInactiveTintColor: muted,
        tabBarLabelStyle: {
          fontFamily: "SpaceGrotesk_500Medium",
          fontSize: 10,
          marginTop: 3,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <House color={color} size={20} />,
        }}
      />
      <Tabs.Screen
        name="projects"
        options={{
          title: "Projects",
          tabBarIcon: ({ color }) => <FolderOpen color={color} size={20} />,
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: "Create",
          tabBarIcon: ({ color }) => <Clapperboard color={color} size={20} />,
        }}
      />
      <Tabs.Screen
        name="studio"
        options={{
          title: "Studio",
          tabBarIcon: ({ color }) => <StudioIcon color={color} size={20} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color }) => <Settings2 color={color} size={20} />,
        }}
      />
      <Tabs.Screen name="assets" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}
