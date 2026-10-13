import { ScrollView, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { CheckoutStackParamList } from '../../../navigation/types'
import { useTheme } from '../../../theme'
import { AddressForm } from '../components/AddressForm'
import { ScreenHeader } from '../../../components/ui/ScreenHeader'
import { KeyboardAwareScreen } from '../../../components/ui/KeyboardAwareScreen'
import { useCheckoutSession } from '../hooks/useCheckoutSession'

type Props = NativeStackScreenProps<CheckoutStackParamList, 'Address'>

export default function AddressScreen({ navigation }: Props) {
  const theme = useTheme()
  const session = useCheckoutSession()

  return (
    <KeyboardAwareScreen style={{ backgroundColor: theme.colors.background }}>
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <ScreenHeader title="Delivery address" onBack={navigation.goBack} />
        <ScrollView contentContainerStyle={{ padding: theme.spacing(2) }} keyboardShouldPersistTaps="handled">
          <AddressForm
            initialEmail={session.email}
            initialAddress={session.address}
            onSubmit={({ email, address }) => {
              session.setEmail(email)
              session.setAddress(address)
              navigation.navigate('Shipping')
            }}
          />
        </ScrollView>
      </View>
    </KeyboardAwareScreen>
  )
}
