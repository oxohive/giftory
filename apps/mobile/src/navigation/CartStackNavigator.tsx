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
 */
export default function CartStackNavigator() {
  return (
    <Stack.Navigator initialRouteName="Cart">
      <Stack.Screen name="Cart" component={CartScreen} options={{ title: 'Cart' }} />
      <Stack.Screen name="Address" component={AddressScreen} options={{ title: 'Address' }} />
      <Stack.Screen name="Shipping" component={ShippingScreen} options={{ title: 'Shipping' }} />
      <Stack.Screen name="Payment" component={PaymentScreen} options={{ title: 'Payment' }} />
      <Stack.Screen name="Confirmation" component={ConfirmationScreen} options={{ title: 'Confirmation' }} />
    </Stack.Navigator>
  )
}
