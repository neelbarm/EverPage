import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { getItem, setItem } from '@/lib/storage';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  resolvedScheme: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextValue>({
  themeMode: 'system',
  setThemeMode: async () => {},
  resolvedScheme: 'light',
});

const THEME_KEY = 'app_theme_mode';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    getItem(THEME_KEY).then((v) => {
      if (v === 'light' || v === 'dark' || v === 'system') {
        setThemeModeState(v as ThemeMode);
      }
    });
  }, []);

  const setThemeMode = async (mode: ThemeMode) => {
    setThemeModeState(mode);
    await setItem(THEME_KEY, mode);
  };

  const resolvedScheme: 'light' | 'dark' =
    themeMode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : themeMode;

  return (
    <ThemeContext.Provider value={{ themeMode, setThemeMode, resolvedScheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
