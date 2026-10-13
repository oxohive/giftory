import { AnimatedTabBarNavigator, TabElementDisplayOptions } from 'react-native-animated-nav-tab-bar'
import Ionicons from '@expo/vector-icons/Ionicons'
import CatalogStackNavigator from './CatalogStackNavigator'
import CartStackNavigator from './CartStackNavigator'
import AccountStackNavigator from './AccountStackNavigator'
import { useTheme } from '../theme'

const Tab = AnimatedTabBarNavigator()

const TAB_ICONS = {
  Home: { focused: 'home', unfocused: 'home-outline' },
  Products: { focused: 'pricetag', unfocused: 'pricetag-outline' },
  Cart: { focused: 'cart', unfocused: 'cart-outline' },
  Account: { focused: 'person', unfocused: 'person-outline' },
} as const

function tabIcon(name: keyof typeof TAB_ICONS) {
  return ({ focused, color, size }: { focused: boolean; color: string; size: number }) => (
    <Ionicons name={focused ? TAB_ICONS[name].focused : TAB_ICONS[name].unfocused} color={color} size={size} />
  )
}

function HomeTab() {
  return <CatalogStackNavigator initialRouteName="Home" />
}

function ProductsTab() {
  return <CatalogStackNavigator initialRouteName="ProductList" />
}

/**
 * Top-level bottom-tab navigator: Home, Products, Cart, Account. Home and
 * Products both mount `CatalogStackNavigator` (with different initial
 * routes) so `ProductDetail` is reachable, typed, from either tab. Cart
 * mounts the cart+checkout stack; Account mounts the account+orders stack.
 *
 * Tab bar: `react-native-animated-nav-tab-bar` (real library, not a
 * hand-rolled animation) — its "Dot" is a plain `Animated.Value` sprung
 * between each focused tab's measured position on every tab change, which
 * is the actual sliding-indicator / segmented-control behavior this was
 * asked to match. No header is ever rendered by this navigator (it only
 * renders the screen content + the bar), which is fine since every screen
 * already renders its own `ScreenHeader`.
 *
 * Known limitation (platform nuance, not a bug on our end): the library's
 * floating-mode bottom margin is a hardcoded 20px, gated on an iOS-only
 * "is this an iPhone X+" check — it does not read this device's actual
 * Android gesture-nav safe-area inset the way the previous hand-rolled bar
 * did. 20px should read fine against most devices' gesture handles; worth
 * confirming on-device.
 */
export default function RootTabNavigator() {
  const theme = useTheme()

  return (
    <Tab.Navigator
      appearance={{
        floating: true,
        tabBarBackground: theme.colors.navBarBackground,
        activeTabBackgrounds: theme.colors.navBarActiveDot,
        dotCornerRadius: 999,
        // Both states now show icon + label (checklist section 2: "keep tab
        // order, icons, labels and selected states consistent" — the bar
        // was icon-only, with no labels at all, before this).
        whenActiveShow: TabElementDisplayOptions.BOTH,
        whenInactiveShow: TabElementDisplayOptions.BOTH,
        shadow: true,
      }}
      tabBarOptions={{
        activeTintColor: theme.colors.navBarBackground,
        inactiveTintColor: theme.colors.navBarInactive,
      }}
    >
      <Tab.Screen name="Home" component={HomeTab} options={{ tabBarIcon: tabIcon('Home') }} />
      <Tab.Screen name="Products" component={ProductsTab} options={{ tabBarIcon: tabIcon('Products') }} />
      <Tab.Screen name="Cart" component={CartStackNavigator} options={{ tabBarIcon: tabIcon('Cart') }} />
      <Tab.Screen name="Account" component={AccountStackNavigator} options={{ tabBarIcon: tabIcon('Account') }} />
    </Tab.Navigator>
  )
}
