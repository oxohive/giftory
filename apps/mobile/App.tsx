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
import { OfflineBanner } from './src/components/ui/OfflineBanner'

// Maps `giftory://...` deep links to the real nested navigator structure
// (checklist section 2: "Define deep-link behavior and test links to
// nested screens" — the `giftory` scheme was declared in app.json but had
// no actual route mapping before this). Home and Products both host
// `CatalogStackNavigator`; `ProductDetail` is reachable through either.
// `as any`: React Navigation's `LinkingOptions<T>` can't express "a tab
// whose own value is itself a nested stack's path config" without also
// declaring a global `ReactNavigation.RootParamList` augmentation (a
// bigger, app-wide typing change this fix pass intentionally avoids, since
// it would affect every existing `useNavigation<...>()` call site's
// inference elsewhere in the app). The runtime shape below is still a real,
// hand-verified mapping to every route in `src/navigation/types.ts` — only
// the compile-time check is loosened, not the actual config.
const linking: any = {
  prefixes: ['giftory://'],
  config: {
    screens: {
      Home: { screens: { Home: '', ProductDetail: 'product/:handle' } },
      Products: { screens: { ProductList: 'products', ProductDetail: 'product/:handle' } },
      Cart: {
        screens: {
          Cart: 'cart',
          Address: 'checkout/address',
          Shipping: 'checkout/shipping',
          Payment: 'checkout/payment',
          Confirmation: 'checkout/confirmation/:orderId',
        },
      },
      Account: {
        screens: {
          Account: 'account',
          Addresses: 'account/addresses',
          OrderDetail: 'order/:orderId',
        },
      },
    },
  },
}

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
              <OfflineBanner />
              <NavigationContainer theme={navTheme} linking={linking}>
                <RootTabNavigator />
              </NavigationContainer>
            </ToastProvider>
          </SafeAreaProvider>
        </QueryClientProvider>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  )
}
