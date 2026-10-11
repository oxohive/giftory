import { QueryClientProvider } from '@tanstack/react-query'
import { NavigationContainer } from '@react-navigation/native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet'
import RootTabNavigator from './src/navigation/RootTabNavigator'
import { queryClient } from './src/lib/queryClient'
import { useThemeFonts } from './src/theme'
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

  if (!fontsLoaded) {
    return null
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
        <QueryClientProvider client={queryClient}>
          <SafeAreaProvider>
            <ToastProvider>
              <NavigationContainer>
                <RootTabNavigator />
              </NavigationContainer>
            </ToastProvider>
          </SafeAreaProvider>
        </QueryClientProvider>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  )
}
