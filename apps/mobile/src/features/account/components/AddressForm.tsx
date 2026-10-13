/**
 * Create/edit form for a saved address. Reuses TASK-04's `addressSchema`
 * (src/lib/api/addresses.ts) for validation rather than re-implementing the
 * phone/PIN-code regex rules — this form only adds the UI around it.
 */
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { z } from 'zod'
import type { Address } from '../../../lib/api/checkout'
import { addressSchema, INDIAN_STATES } from '../../../lib/api/addresses'
import { useTheme } from '../../../theme'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'

export interface AddressFormValues {
  fullName: string
  phone: string
  line1: string
  line2: string
  city: string
  state: string
  postalCode: string
}

export interface AddressFormProps {
  initialValue?: Address
  submitLabel: string
  isSubmitting?: boolean
  onSubmit: (value: Address) => Promise<void> | void
  onCancel: () => void
}

const EMPTY_VALUES: AddressFormValues = {
  fullName: '',
  phone: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  postalCode: '',
}

function toFormValues(address?: Address): AddressFormValues {
  if (!address) return EMPTY_VALUES
  return {
    fullName: address.fullName,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2 ?? '',
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
  }
}

/**
 * TASK-15: `react-hook-form` + `zodResolver` validate against `addressSchema`
 * directly (same schema as before, now wired through the resolver instead of
 * manual `.safeParse()`). `country` is omitted from the form schema (fixed to
 * 'IN' below, same as before — this form has no country picker) so the form
 * doesn't need a hidden/default field for it. `FormValues` is inferred from
 * the schema (not the public `AddressFormValues`) so `line2`'s
 * optional-after-validation type lines up with the resolver.
 */
const formSchema = addressSchema.omit({ country: true })
type FormValues = z.infer<typeof formSchema>

function StatePicker(props: {
  value: string
  onChange: (state: string) => void
  error?: string
  required?: boolean
}): JSX.Element {
  const { value, onChange, error, required = false } = props
  const theme = useTheme()
  const [open, setOpen] = useState(false)

  return (
    <View style={styles.fieldSpacing}>
      <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginBottom: theme.spacing(0.5) }]}>
        State
        {required ? <Text style={{ color: theme.colors.danger }}> *</Text> : null}
      </Text>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`State${required ? ', required' : ''}${error ? `, error: ${error}` : ''}`}
        style={[
          styles.pickerTrigger,
          {
            minHeight: theme.touchTarget.min,
            borderColor: error ? theme.colors.danger : theme.colors.border,
            borderRadius: theme.radii.sm,
            backgroundColor: theme.colors.surface,
            paddingHorizontal: theme.spacing(1.5),
            paddingVertical: theme.spacing(1),
          },
        ]}
      >
        <Text style={[theme.typography.body, { color: value ? theme.colors.text : theme.colors.textMuted }]}>
          {value || 'Choose a state'}
        </Text>
      </Pressable>
      {error ? (
        <Text style={[theme.typography.caption, { color: theme.colors.danger, marginTop: theme.spacing(0.5) }]}>
          {error}
        </Text>
      ) : null}

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: theme.colors.overlay }]}>
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: theme.colors.background, borderRadius: theme.radii.lg, padding: theme.spacing(2) },
            ]}
          >
            <Text style={[theme.typography.subheading, { color: theme.colors.text, marginBottom: theme.spacing(1) }]}>
              Choose a state
            </Text>
            <FlatList
              data={INDIAN_STATES}
              keyExtractor={(item) => item}
              style={{ maxHeight: 360 }}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    onChange(item)
                    setOpen(false)
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={item}
                  style={{ paddingVertical: theme.spacing(1.25), minHeight: theme.touchTarget.min, justifyContent: 'center' }}
                >
                  <Text style={[theme.typography.body, { color: theme.colors.text }]}>{item}</Text>
                </Pressable>
              )}
            />
            <View style={{ marginTop: theme.spacing(1.5) }}>
              <Button title="Close" variant="secondary" onPress={() => setOpen(false)} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

export function AddressForm(props: AddressFormProps): JSX.Element {
  const { initialValue, submitLabel, isSubmitting = false, onSubmit, onCancel } = props
  const theme = useTheme()

  const {
    control,
    handleSubmit,
    trigger,
    formState: { errors, isValid },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: 'onChange',
    defaultValues: toFormValues(initialValue),
  })

  // See checkout/components/AddressForm.tsx's identical effect for why this
  // is needed: without it, editing an already-valid saved address would
  // show the submit button disabled until the user touched a field.
  useEffect(() => {
    trigger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const phoneRef = useRef<TextInput>(null)
  const line1Ref = useRef<TextInput>(null)
  const line2Ref = useRef<TextInput>(null)
  const cityRef = useRef<TextInput>(null)
  const postalCodeRef = useRef<TextInput>(null)

  const onValid = async (values: FormValues): Promise<void> => {
    // Preserve the original behavior exactly: a blank-or-whitespace-only
    // line2 becomes `undefined` rather than `''`, matching the original
    // `values.line2.trim() || undefined` pre-validation step. `values.line2`
    // here is already the zod-trimmed output, so trimming it again is a
    // no-op; the `|| undefined` fallback is what we need to replicate.
    const line2 = (values.line2 ?? '').trim() || undefined
    const address: Address = {
      fullName: values.fullName,
      phone: values.phone,
      line1: values.line1,
      line2,
      city: values.city,
      state: values.state,
      postalCode: values.postalCode,
      country: 'IN',
    }
    await onSubmit(address)
  }

  const submit = handleSubmit(onValid)

  return (
    <View>
      <View style={styles.fieldSpacing}>
        <Controller
          control={control}
          name="fullName"
          render={({ field }) => (
            <Input
              label="Full name"
              required
              value={field.value}
              onChangeText={field.onChange}
              error={errors.fullName?.message}
              placeholder="Recipient's full name"
              returnKeyType="next"
              onSubmitEditing={() => phoneRef.current?.focus()}
            />
          )}
        />
      </View>
      <View style={styles.fieldSpacing}>
        <Controller
          control={control}
          name="phone"
          render={({ field }) => (
            <Input
              ref={phoneRef}
              label="Phone"
              required
              value={field.value}
              onChangeText={field.onChange}
              error={errors.phone?.message}
              placeholder="10-digit mobile number"
              keyboardType="phone-pad"
              returnKeyType="next"
              onSubmitEditing={() => line1Ref.current?.focus()}
            />
          )}
        />
      </View>
      <View style={styles.fieldSpacing}>
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
              placeholder="House / flat and street"
              returnKeyType="next"
              onSubmitEditing={() => line2Ref.current?.focus()}
            />
          )}
        />
      </View>
      <View style={styles.fieldSpacing}>
        <Controller
          control={control}
          name="line2"
          render={({ field }) => (
            <Input
              ref={line2Ref}
              label="Address line 2 (optional)"
              value={field.value ?? ''}
              onChangeText={field.onChange}
              error={errors.line2?.message}
              placeholder="Landmark, area"
              returnKeyType="next"
              onSubmitEditing={() => cityRef.current?.focus()}
            />
          )}
        />
      </View>
      <View style={styles.fieldSpacing}>
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
              onSubmitEditing={() => postalCodeRef.current?.focus()}
            />
          )}
        />
      </View>
      <Controller
        control={control}
        name="state"
        render={({ field }) => (
          <StatePicker value={field.value} onChange={field.onChange} error={errors.state?.message} required />
        )}
      />
      <View style={styles.fieldSpacing}>
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
              placeholder="6-digit PIN code"
              keyboardType="numeric"
              maxLength={6}
              returnKeyType="done"
              onSubmitEditing={() => submit()}
            />
          )}
        />
      </View>

      <View style={{ flexDirection: 'row', marginTop: theme.spacing(2) }}>
        <View style={{ flex: 1, marginRight: theme.spacing(1) }}>
          <Button title="Cancel" variant="secondary" onPress={onCancel} disabled={isSubmitting} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title={submitLabel} onPress={submit} loading={isSubmitting} disabled={!isValid} />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  fieldSpacing: {
    marginBottom: 16,
  },
  pickerTrigger: {
    borderWidth: 1,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    maxHeight: '80%',
  },
})
