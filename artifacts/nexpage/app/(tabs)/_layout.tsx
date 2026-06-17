import { Redirect, Tabs, useRouter } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Feather, Ionicons } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, TouchableOpacity, View } from "react-native";
import { isLiquidGlassAvailable } from "expo-glass-effect";

import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";
import { useSocial } from "@/context/SocialContext";

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "books.vertical", selected: "books.vertical.fill" }} />
        <Label>Shelf</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="friends">
        <Icon sf={{ default: "person.2", selected: "person.2.fill" }} />
        <Label>Friends</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="log">
        <Icon sf={{ default: "plus.circle", selected: "plus.circle.fill" }} />
        <Label>Read</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="stats">
        <Icon sf={{ default: "chart.bar", selected: "chart.bar.fill" }} />
        <Label>Stats</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="you">
        <Icon sf={{ default: "person.circle", selected: "person.circle.fill" }} />
        <Label>Profile</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const router = useRouter();
  const isWeb = Platform.OS === "web";
  const { unreadNudgeCount } = useSocial();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.foreground,
        tabBarInactiveTintColor: colors.tabBarInactive,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: "transparent",
          borderTopWidth: 0,
          borderRadius: 32,
          marginHorizontal: 14,
          marginBottom: 14,
          elevation: 12,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.14,
          shadowRadius: 16,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () => (
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: colors.tabBar, borderRadius: 32 },
            ]}
          />
        ),
        tabBarLabelStyle: {
          fontFamily: 'Inter_600SemiBold',
          fontSize: 11,
          letterSpacing: 0.2,
          marginBottom: 4,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Shelf",
          tabBarIcon: ({ color }) =>
            Platform.OS === "ios" ? (
              <SymbolView name="books.vertical" tintColor={color} size={22} />
            ) : (
              <Ionicons name="book-outline" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: "Friends",
          tabBarBadge: unreadNudgeCount > 0 ? (unreadNudgeCount > 9 ? "9+" : unreadNudgeCount) : undefined,
          tabBarBadgeStyle: { fontSize: 10, minWidth: 16, height: 16, lineHeight: 16 },
          tabBarIcon: ({ color }) =>
            Platform.OS === "ios" ? (
              <SymbolView name="person.2" tintColor={color} size={22} />
            ) : (
              <Ionicons name="people-outline" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="log"
        options={{
          title: "",
          tabBarLabel: () => null,
          tabBarIcon: () => null,
          tabBarButton: () => (
            <TouchableOpacity
              onPress={() => router.push({ pathname: "/(tabs)/log", params: { addBook: "true" } })}
              style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
              activeOpacity={0.85}
            >
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  backgroundColor: colors.tabBarFab,
                  alignItems: "center",
                  justifyContent: "center",
                  shadowColor: colors.tabBarFab,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.4,
                  shadowRadius: 10,
                  elevation: 8,
                  marginBottom: isWeb ? 16 : 0,
                }}
              >
                <Feather name="plus" size={24} color="#fff" />
              </View>
            </TouchableOpacity>
          ),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: "Stats",
          tabBarIcon: ({ color }) =>
            Platform.OS === "ios" ? (
              <SymbolView name="chart.bar" tintColor={color} size={22} />
            ) : (
              <Ionicons name="bar-chart-outline" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="you"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) =>
            Platform.OS === "ios" ? (
              <SymbolView name="person.circle" tintColor={color} size={22} />
            ) : (
              <Ionicons name="person-circle-outline" size={24} color={color} />
            ),
        }}
      />
    </Tabs>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null;
  if (!isAuthenticated) return <Redirect href="/" />;
  return <>{children}</>;
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <AuthGate><NativeTabLayout /></AuthGate>;
  }
  return <AuthGate><ClassicTabLayout /></AuthGate>;
}
