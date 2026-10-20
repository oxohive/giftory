import { createNativeStackNavigator } from '@react-navigation/native-stack'
import AccountScreen from '../features/account/screens/AccountScreen'
import AddressesScreen from '../features/account/screens/AddressesScreen'
import OrderDetailScreen from '../features/orders/screens/OrderDetailScreen'
import type { AccountStackParamList } from './types'

const Stack = createNativeStackNavigator<AccountStackParamList>()

/**
 * Hosts Account -> Addresses and Account -> OrderDetail.
 *
 * Native header disabled stack-wide — every screen renders its own
 * `ScreenHeader` instead; see CatalogStackNavigator for why.
 */
export default function AccountStackNavigator() {
  return (
    <Stack.Navigator initialRouteName="Account" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Account" component={AccountScreen} />
      <Stack.Screen name="Addresses" component={AddressesScreen} />
      <Stack.Screen name="OrderDetail" component={OrderDetailScreen} />
    </Stack.Navigator>
  )
}
