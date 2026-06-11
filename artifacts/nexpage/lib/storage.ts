import AsyncStorage from "@react-native-async-storage/async-storage";

let SecureStore: typeof import("expo-secure-store") | undefined;

try {
  SecureStore = require("expo-secure-store");
} catch {
  SecureStore = undefined;
}

async function isSecureStoreAvailable(): Promise<boolean> {
  if (!SecureStore) return false;
  try {
    await SecureStore.setItemAsync("__test__", "1");
    await SecureStore.deleteItemAsync("__test__");
    return true;
  } catch {
    return false;
  }
}

let _available: boolean | null = null;
async function secureStoreAvailable(): Promise<boolean> {
  if (_available === null) {
    _available = await isSecureStoreAvailable();
  }
  return _available;
}

export async function setItem(key: string, value: string): Promise<void> {
  if (await secureStoreAvailable()) {
    await SecureStore!.setItemAsync(key, value);
  } else {
    await AsyncStorage.setItem(key, value);
  }
}

export async function getItem(key: string): Promise<string | null> {
  if (await secureStoreAvailable()) {
    return SecureStore!.getItemAsync(key);
  } else {
    return AsyncStorage.getItem(key);
  }
}

export async function deleteItem(key: string): Promise<void> {
  if (await secureStoreAvailable()) {
    await SecureStore!.deleteItemAsync(key);
  } else {
    await AsyncStorage.removeItem(key);
  }
}
