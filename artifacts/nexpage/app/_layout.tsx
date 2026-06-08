import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { StoreProvider } from "@/context/StoreContext";
import { SocialProvider, useSocial } from "@/context/SocialContext";
import { AuthProvider, useAuth } from "@/lib/auth";
import {
  requestNotificationPermissions,
  setupNotificationResponseHandler,
} from "@/lib/notifications";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function PushTokenRegistrar() {
  const { isAuthenticated } = useAuth();
  const { isRegistered, registerPushToken } = useSocial();

  useEffect(() => {
    if (Platform.OS === "web") return;
    if (!isAuthenticated || !isRegistered) return;

    async function register() {
      try {
        const granted = await requestNotificationPermissions();
        if (!granted) return;
        const tokenData = await Notifications.getExpoPushTokenAsync();
        await registerPushToken(tokenData.data);
      } catch {
        // non-blocking
      }
    }

    register();
  }, [isAuthenticated, isRegistered]);

  return null;
}

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="session/[bookId]"
        options={{ headerShown: false, presentation: "fullScreenModal", animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="session-log/[bookId]"
        options={{ headerShown: false, presentation: "fullScreenModal" }}
      />
      <Stack.Screen
        name="book/[bookId]"
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="finish/[bookId]"
        options={{ headerShown: false, presentation: "modal" }}
      />
      <Stack.Screen
        name="profile/[userId]"
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="wrapped/[year]"
        options={{ headerShown: false, presentation: "fullScreenModal", animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="room/[roomId]"
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="settings"
        options={{ headerShown: false, presentation: "modal" }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    requestNotificationPermissions();
    const cleanup = setupNotificationResponseHandler();
    return cleanup;
  }, []);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView>
            <KeyboardProvider>
              <AuthProvider>
                <StoreProvider>
                  <SocialProvider>
                    <PushTokenRegistrar />
                    <RootLayoutNav />
                  </SocialProvider>
                </StoreProvider>
              </AuthProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
