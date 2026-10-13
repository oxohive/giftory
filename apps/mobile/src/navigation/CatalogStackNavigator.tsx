import { createNativeStackNavigator } from '@react-navigation/native-stack'
import HomeScreen from '../features/catalog/screens/HomeScreen'
import ProductListScreen from '../features/catalog/screens/ProductListScreen'
import ProductDetailScreen from '../features/catalog/screens/ProductDetailScreen'
import type { CatalogStackParamList } from './types'

const Stack = createNativeStackNavigator<CatalogStackParamList>()

type Props = {
  initialRouteName?: keyof CatalogStackParamList
}

/**
 * Hosts the catalog browsing flow (Home -> ProductList -> ProductDetail).
 * Rendered twice by the bottom-tab navigator: once per tab ("Home" and
 * "Products"), each with a different `initialRouteName`, so both tabs share
 * one typed stack instead of duplicating screens.
 *
 * Native header disabled stack-wide — every screen renders its own
 * `ScreenHeader` instead, so they share Home's exact header structure
 * (icon buttons, padding, safe-area handling) rather than React
 * Navigation's platform header, which can never fully match a custom one.
 */
export default function CatalogStackNavigator({ initialRouteName = 'Home' }: Props) {
  return (
    <Stack.Navigator initialRouteName={initialRouteName} screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="ProductList" component={ProductListScreen} />
      <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
    </Stack.Navigator>
  )
}
