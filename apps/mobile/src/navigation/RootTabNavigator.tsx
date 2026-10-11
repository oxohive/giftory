import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import Ionicons from '@expo/vector-icons/Ionicons'
import CatalogStackNavigator from './CatalogStackNavigator'
import CartStackNavigator from './CartStackNavigator'
import AccountStackNavigator from './AccountStackNavigator'
import type { RootTabParamList } from './types'
import { theme } from '../theme'

const Tab = createBottomTabNavigator<RootTabParamList>()

const TAB_ICONS: Record<keyof RootTabParamList, { focused: keyof typeof Ionicons.glyphMap; unfocused: keyof typeof Ionicons.glyphMap }> = {
  Home: { focused: 'home', unfocused: 'home-outline' },
  Products: { focused: 'pricetag', unfocused: 'pricetag-outline' },
  Cart: { focused: 'cart', unfocused: 'cart-outline' },
  Account: { focused: 'person', unfocused: 'person-outline' },
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
 */
export default function RootTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        // The tab navigator has its own header, separate from each tab's inner
        // stack navigator (which has its own, per-screen headers). Left both
        // shown, every root screen displayed its title twice, stacked — e.g.
        // "Products" from this outer header AND "Products" again from the
        // inner stack's header. Hide this outer one everywhere; each inner
        // stack navigator is the single source of header UI per screen.
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarIcon: ({ focused, color, size }) => {
          const icons = TAB_ICONS[route.name as keyof RootTabParamList]
          return <Ionicons name={focused ? icons.focused : icons.unfocused} size={size} color={color} />
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeTab} />
      <Tab.Screen name="Products" component={ProductsTab} />
      <Tab.Screen name="Cart" component={CartStackNavigator} />
      <Tab.Screen name="Account" component={AccountStackNavigator} />
    </Tab.Navigator>
  )
}
