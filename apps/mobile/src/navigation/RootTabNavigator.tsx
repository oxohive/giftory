import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import CatalogStackNavigator from './CatalogStackNavigator'
import CartStackNavigator from './CartStackNavigator'
import AccountStackNavigator from './AccountStackNavigator'
import type { RootTabParamList } from './types'

const Tab = createBottomTabNavigator<RootTabParamList>()

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
    <Tab.Navigator>
      <Tab.Screen name="Home" component={HomeTab} />
      <Tab.Screen name="Products" component={ProductsTab} />
      <Tab.Screen name="Cart" component={CartStackNavigator} />
      <Tab.Screen name="Account" component={AccountStackNavigator} />
    </Tab.Navigator>
  )
}
