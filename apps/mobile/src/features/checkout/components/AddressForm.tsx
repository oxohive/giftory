import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { z } from 'zod'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { useTheme } from '../../../theme'
import { addressSchema } from '../../../lib/api/addresses'
import type { Address } from '../../../lib/api/checkout'

/**
 * Guest checkout also needs a contact email (`PlaceOrderInput.email`), which
 * isn't part of TASK-04's `addressSchema` (that schema only covers the
 * shipping-address fields). Validated separately here rather than folded
 * into `addressSchema` since it's out of this task's boundary to edit that
 * shared schema.
 */
const emailSchema = z
  .string()
  .trim()
  .min(1, 'Enter an email address')
  .email('Enter a valid email address')

export interface AddressFormValues {
  email: string
  address: Address
}

export interface AddressFormProps {
  initialEmail?: string
  initialAddress?: Address | null
  submitting?: boolean
  submitLabel?: string
  onSubmit: (values: AddressFormValues) => void
}

type FieldKey = 'email' | 'fullName' | 'phone' | 'line1' | 'line2' | 'city' | 'state' | 'postalCode'
type FieldErrors = Partial<Record<FieldKey, string>>

/**
 * Address entry form for the checkout flow. Reuses TASK-04's `addressSchema`
 * (from `src/lib/api/addresses.ts`) for India phone/PIN validation rather
 * than re-implementing those regexes — per this task's spec. Country is
 * fixed to 'IN' (guest checkout here is India-only; no country picker).
 */
export function AddressForm(props: AddressFormProps): JSX.Element {
  const { initialEmail = '', initialAddress = null, submitting = false, submitLabel = 'Continue', onSubmit } = props
  const theme = useTheme()

  const [email, setEmail] = useState(initialEmail)
  const [fullName, setFullName] = useState(initialAddress?.fullName ?? '')
  const [phone, setPhone] = useState(initialAddress?.phone ?? '')
  const [line1, setLine1] = useState(initialAddress?.line1 ?? '')
  const [line2, setLine2] = useState(initialAddress?.line2 ?? '')
  const [city, setCity] = useState(initialAddress?.city ?? '')
  const [state, setState] = useState(initialAddress?.state ?? '')
  const [postalCode, setPostalCode] = useState(initialAddress?.postalCode ?? '')
  const [errors, setErrors] = useState<FieldErrors>({})

  function handleSubmit(): void {
    const emailResult = emailSchema.safeParse(email)
    const addressResult = addressSchema.safeParse({
      fullName,
      phone,
      line1,
      line2: line2.length > 0 ? line2 : undefined,
      city,
      state,
      postalCode,
      country: 'IN',
    })

    const nextErrors: FieldErrors = {}
    if (!emailResult.success) {
      nextErrors.email = emailResult.error.issues[0]?.message ?? 'Enter a valid email address'
    }
    if (!addressResult.success) {
      for (const issue of addressResult.error.issues) {
        const key = issue.path[0]
        if (typeof key === 'string' && isFieldKey(key) && !(key in nextErrors)) {
          nextErrors[key] = issue.message
        }
      }
    }

    setErrors(nextErrors)
    if (!emailResult.success || !addressResult.success) return

    onSubmit({ email: emailResult.data, address: addressResult.data })
  }

  return (
    <View style={styles.container}>
      <Input
        label="Email"
        value={email}
        onChangeText={setEmail}
        error={errors.email}
        keyboardType="email-address"
        placeholder="you@example.com"
      />
      <Input
        label="Recipient name"
        value={fullName}
        onChangeText={setFullName}
        error={errors.fullName}
        placeholder="Full name"
      />
      <Input
        label="Mobile number"
        value={phone}
        onChangeText={setPhone}
        error={errors.phone}
        keyboardType="phone-pad"
        placeholder="10-digit mobile number"
        maxLength={13}
      />
      <Input
        label="Address line 1"
        value={line1}
        onChangeText={setLine1}
        error={errors.line1}
        placeholder="House / flat, street"
      />
      <Input
        label="Address line 2 (optional)"
        value={line2}
        onChangeText={setLine2}
        placeholder="Landmark, area"
      />
      <Input label="City" value={city} onChangeText={setCity} error={errors.city} placeholder="City" />
      <Input label="State" value={state} onChangeText={setState} error={errors.state} placeholder="State" />
      <Input
        label="PIN code"
        value={postalCode}
        onChangeText={setPostalCode}
        error={errors.postalCode}
        keyboardType="numeric"
        placeholder="6-digit PIN code"
        maxLength={6}
      />
      <View style={{ marginTop: theme.spacing(1) }}>
        <Button title={submitLabel} onPress={handleSubmit} loading={submitting} />
      </View>
    </View>
  )
}

function isFieldKey(key: string): key is FieldKey {
  return key === 'email' || key === 'fullName' || key === 'phone' || key === 'line1' || key === 'line2' || key === 'city' || key === 'state' || key === 'postalCode'
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
})
