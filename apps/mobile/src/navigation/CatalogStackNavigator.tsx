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
 */
export default function CatalogStackNavigator({ initialRouteName = 'Home' }: Props) {
  return (
    <Stack.Navigator initialRouteName={initialRouteName}>
      <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Home' }} />
      <Stack.Screen name="ProductList" component={ProductListScreen} options={{ title: 'Products' }} />
      <Stack.Screen name="ProductDetail" component={ProductDetailScreen} options={{ title: 'Product' }} />
    </Stack.Navigator>
  )
}
