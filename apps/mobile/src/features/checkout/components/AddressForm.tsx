import { useEffect, useRef } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { StyleSheet, TextInput, View } from 'react-native'
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

/**
 * TASK-15: combined form schema for `react-hook-form` + `zodResolver`. Reuses
 * `addressSchema` and `emailSchema` verbatim (no re-implemented validation) —
 * `country` is fixed to 'IN' below rather than left for the user to pick.
 */
const formSchema = z.object({
  email: emailSchema,
  fullName: addressSchema.shape.fullName,
  phone: addressSchema.shape.phone,
  line1: addressSchema.shape.line1,
  line2: addressSchema.shape.line2,
  city: addressSchema.shape.city,
  state: addressSchema.shape.state,
  postalCode: addressSchema.shape.postalCode,
})

type FormValues = z.infer<typeof formSchema>

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

/**
 * Address entry form for the checkout flow. Reuses TASK-04's `addressSchema`
 * (from `src/lib/api/addresses.ts`) for India phone/PIN validation rather
 * than re-implementing those regexes — per this task's spec. Country is
 * fixed to 'IN' (guest checkout here is India-only; no country picker).
 *
 * Every field but `line2` is required (marked via `Input`'s `required`
 * prop) and chained via refs so the keyboard's Next/Done action moves focus
 * field-to-field instead of requiring a manual tap each time, ending with
 * `postalCode`'s "Done" submitting the form directly.
 */
export function AddressForm(props: AddressFormProps): JSX.Element {
  const { initialEmail = '', initialAddress = null, submitting = false, submitLabel = 'Continue', onSubmit } = props
  const theme = useTheme()

  const {
    control,
    handleSubmit,
    getValues,
    trigger,
    formState: { errors, isValid },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: 'onChange',
    defaultValues: {
      email: initialEmail,
      fullName: initialAddress?.fullName ?? '',
      phone: initialAddress?.phone ?? '',
      line1: initialAddress?.line1 ?? '',
      line2: initialAddress?.line2 ?? '',
      city: initialAddress?.city ?? '',
      state: initialAddress?.state ?? '',
      postalCode: initialAddress?.postalCode ?? '',
    },
  })

  // `formState.isValid` stays `false` until the first validation pass. With
  // `mode: 'onChange'`, that pass only happens once the user edits a field —
  // so re-opening this form with an already-valid `initialAddress` (editing
  // an existing address, not entering a new one) would otherwise show the
  // submit button permanently disabled until the user touched something,
  // even though the loaded data is already valid. Trigger one validation
  // pass on mount so `isValid` reflects the actual initial data immediately.
  useEffect(() => {
    trigger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fullNameRef = useRef<TextInput>(null)
  const phoneRef = useRef<TextInput>(null)
  const line1Ref = useRef<TextInput>(null)
  const line2Ref = useRef<TextInput>(null)
  const cityRef = useRef<TextInput>(null)
  const stateRef = useRef<TextInput>(null)
  const postalCodeRef = useRef<TextInput>(null)

  const onValid = (values: FormValues): void => {
    // Preserve the original behavior exactly: an empty (zero-length, untrimmed)
    // line2 becomes `undefined` rather than `''`. `values.line2` here is the
    // zod-validated (and thus already-trimmed) output; `getValues('line2')`
    // reads the raw, untransformed text the user typed (react-hook-form does
    // not mutate form state with resolver transforms), matching the original
    // `line2.length > 0 ? line2 : undefined` pre-validation check.
    const rawLine2 = getValues('line2') ?? ''
    onSubmit({
      email: values.email,
      address: {
        fullName: values.fullName,
        phone: values.phone,
        line1: values.line1,
        line2: rawLine2.length > 0 ? values.line2 : undefined,
        city: values.city,
        state: values.state,
        postalCode: values.postalCode,
        country: 'IN',
      },
    })
  }

  const submit = handleSubmit(onValid)

  return (
    <View style={styles.container}>
      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <Input
            label="Email"
            required
            value={field.value}
            onChangeText={field.onChange}
            error={errors.email?.message}
            keyboardType="email-address"
            placeholder="you@example.com"
            returnKeyType="next"
            onSubmitEditing={() => fullNameRef.current?.focus()}
          />
        )}
      />
      <Controller
        control={control}
        name="fullName"
        render={({ field }) => (
          <Input
            ref={fullNameRef}
            label="Recipient name"
            required
            value={field.value}
            onChangeText={field.onChange}
            error={errors.fullName?.message}
            placeholder="Full name"
            returnKeyType="next"
            onSubmitEditing={() => phoneRef.current?.focus()}
          />
        )}
      />
      <Controller
        control={control}
        name="phone"
        render={({ field }) => (
          <Input
            ref={phoneRef}
            label="Mobile number"
            required
            value={field.value}
            onChangeText={field.onChange}
            error={errors.phone?.message}
            keyboardType="phone-pad"
            placeholder="10-digit mobile number"
            maxLength={13}
            returnKeyType="next"
            onSubmitEditing={() => line1Ref.current?.focus()}
          />
        )}
      />
      <Controller
        control={control}
        name="line1"
        render={({ field }) => (
          <Input
            ref={line1Ref}
            label="Address line 1"
            required
            value={field.value}
            onChangeText={field.onChange}
            error={errors.line1?.message}
            placeholder="House / flat, street"
            returnKeyType="next"
            onSubmitEditing={() => line2Ref.current?.focus()}
          />
        )}
      />
      <Controller
        control={control}
        name="line2"
        render={({ field }) => (
          <Input
            ref={line2Ref}
            label="Address line 2 (optional)"
            value={field.value ?? ''}
            onChangeText={field.onChange}
            placeholder="Landmark, area"
            returnKeyType="next"
            onSubmitEditing={() => cityRef.current?.focus()}
          />
        )}
      />
      <Controller
        control={control}
        name="city"
        render={({ field }) => (
          <Input
            ref={cityRef}
            label="City"
            required
            value={field.value}
            onChangeText={field.onChange}
            error={errors.city?.message}
            placeholder="City"
            returnKeyType="next"
            onSubmitEditing={() => stateRef.current?.focus()}
          />
        )}
      />
      <Controller
        control={control}
        name="state"
        render={({ field }) => (
          <Input
            ref={stateRef}
            label="State"
            required
            value={field.value}
            onChangeText={field.onChange}
            error={errors.state?.message}
            placeholder="State"
            returnKeyType="next"
            onSubmitEditing={() => postalCodeRef.current?.focus()}
          />
        )}
      />
      <Controller
        control={control}
        name="postalCode"
        render={({ field }) => (
          <Input
            ref={postalCodeRef}
            label="PIN code"
            required
            value={field.value}
            onChangeText={field.onChange}
            error={errors.postalCode?.message}
            keyboardType="numeric"
            placeholder="6-digit PIN code"
            maxLength={6}
            returnKeyType="done"
            onSubmitEditing={() => submit()}
          />
        )}
      />
      <View style={{ marginTop: theme.spacing(1) }}>
        <Button title={submitLabel} onPress={submit} loading={submitting} disabled={!isValid} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
})
