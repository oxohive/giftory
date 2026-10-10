import { createNativeStackNavigator } from '@react-navigation/native-stack'
import AccountScreen from '../features/account/screens/AccountScreen'
import AddressesScreen from '../features/account/screens/AddressesScreen'
import OrderDetailScreen from '../features/orders/screens/OrderDetailScreen'
import type { AccountStackParamList } from './types'

const Stack = createNativeStackNavigator<AccountStackParamList>()

/** Hosts Account -> Addresses and Account -> OrderDetail. */
export default function AccountStackNavigator() {
  return (
    <Stack.Navigator initialRouteName="Account">
      <Stack.Screen name="Account" component={AccountScreen} options={{ title: 'Account' }} />
      <Stack.Screen name="Addresses" component={AddressesScreen} options={{ title: 'Addresses' }} />
      <Stack.Screen name="OrderDetail" component={OrderDetailScreen} options={{ title: 'Order' }} />
    </Stack.Navigator>
  )
}
