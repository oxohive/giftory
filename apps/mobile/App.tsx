import { QueryClientProvider } from '@tanstack/react-query'
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native'
import type { Theme as NavigationTheme } from '@react-navigation/native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet'
import RootTabNavigator from './src/navigation/RootTabNavigator'
import { queryClient } from './src/lib/queryClient'
import { useTheme, useThemeFonts } from './src/theme'
import { ToastProvider } from './src/components/ui/Toast'

/**
 * Provider order (each constraint from the design-polish wave's 6 parallel
 * tasks, merged by hand since App.tsx was a shared touch-point none of them
 * edited directly):
 * - GestureHandlerRootView must be outermost (needs flex: 1) — TASK-14.
 * - BottomSheetModalProvider goes inside it, around everything else — TASK-14.
 * - fontsLoaded gate must run before any themed <Text> renders, since
 *   typography styles reference the Nunito family names — TASK-10.
 * - ToastProvider must be inside SafeAreaProvider (uses useSafeAreaInsets)
 *   and above RootTabNavigator — TASK-12.
 */
export default function App() {
  const { fontsLoaded } = useThemeFonts()
  const theme = useTheme()

  if (!fontsLoaded) {
    return null
  }

  // Without this, React Navigation falls back to its own fixed DefaultTheme
  // background for every screen's native container — independent of our app
  // theme and OS dark-mode setting. That split was invisible while our old
  // light/dark surfaces were low-contrast; it became a glaring "dark card
  // floating on a light screen" bug once the atelier palette (cream vs.
  // near-black) made the two diverge. Build a matching nav theme so the
  // screen container itself follows theme.colors, not a React Navigation
  // default.
  const navTheme: NavigationTheme = {
    ...(theme.isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(theme.isDark ? DarkTheme.colors : DefaultTheme.colors),
      primary: theme.colors.primary,
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.text,
      border: theme.colors.border,
      notification: theme.colors.primary,
    },
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
        <QueryClientProvider client={queryClient}>
          <SafeAreaProvider>
            <ToastProvider>
              <NavigationContainer theme={navTheme}>
                <RootTabNavigator />
              </NavigationContainer>
            </ToastProvider>
          </SafeAreaProvider>
        </QueryClientProvider>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  )
}
