import { createNativeStackNavigator } from '@react-navigation/native-stack'
import CartScreen from '../features/cart/screens/CartScreen'
import AddressScreen from '../features/checkout/screens/AddressScreen'
import ShippingScreen from '../features/checkout/screens/ShippingScreen'
import PaymentScreen from '../features/checkout/screens/PaymentScreen'
import ConfirmationScreen from '../features/checkout/screens/ConfirmationScreen'
import type { CartStackParamList } from './types'

const Stack = createNativeStackNavigator<CartStackParamList>()

/**
 * Hosts the Cart screen plus the full checkout flow (Address -> Shipping ->
 * Payment -> Confirmation) in one native stack, so the "Cart" bottom tab can
 * push straight through checkout. The checkout screens themselves are typed
 * against `CheckoutStackParamList` (the contract TASK-07 depends on) in
 * their own files; this navigator just mounts them alongside `Cart`.
 *
 * Native header disabled stack-wide — every screen renders its own
 * `ScreenHeader` instead; see CatalogStackNavigator for why.
 */
export default function CartStackNavigator() {
  return (
    <Stack.Navigator initialRouteName="Cart" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Cart" component={CartScreen} />
      <Stack.Screen name="Address" component={AddressScreen} />
      <Stack.Screen name="Shipping" component={ShippingScreen} />
      <Stack.Screen name="Payment" component={PaymentScreen} />
      <Stack.Screen name="Confirmation" component={ConfirmationScreen} />
    </Stack.Navigator>
  )
}
