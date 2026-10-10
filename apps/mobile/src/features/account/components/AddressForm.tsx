/**
 * Create/edit form for a saved address. Reuses TASK-04's `addressSchema`
 * (src/lib/api/addresses.ts) for validation rather than re-implementing the
 * phone/PIN-code regex rules — this form only adds the UI around it.
 */
import { useMemo, useState } from 'react'
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
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

function StatePicker(props: {
  value: string
  onChange: (state: string) => void
  error?: string
}): JSX.Element {
  const { value, onChange, error } = props
  const theme = useTheme()
  const [open, setOpen] = useState(false)

  return (
    <View style={styles.fieldSpacing}>
      <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginBottom: theme.spacing(0.5) }]}>
        State
      </Text>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`State${error ? `, error: ${error}` : ''}`}
        style={[
          styles.pickerTrigger,
          {
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
        <View style={styles.modalOverlay}>
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
                  style={{ paddingVertical: theme.spacing(1.25) }}
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
  const [values, setValues] = useState<AddressFormValues>(() => toFormValues(initialValue))
  const [errors, setErrors] = useState<Partial<Record<keyof AddressFormValues, string>>>({})

  const setField = useMemo(
    () =>
      (field: keyof AddressFormValues) =>
      (next: string) => {
        setValues((prev) => ({ ...prev, [field]: next }))
      },
    [],
  )

  const handleSubmit = async () => {
    const candidate = {
      fullName: values.fullName.trim(),
      phone: values.phone.trim(),
      line1: values.line1.trim(),
      line2: values.line2.trim() || undefined,
      city: values.city.trim(),
      state: values.state.trim(),
      postalCode: values.postalCode.trim(),
      country: 'IN' as const,
    }

    const result = addressSchema.safeParse(candidate)
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof AddressFormValues, string>> = {}
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof AddressFormValues | undefined
        if (field && !fieldErrors[field]) {
          fieldErrors[field] = issue.message
        }
      }
      setErrors(fieldErrors)
      return
    }

    setErrors({})
    await onSubmit(result.data)
  }

  return (
    <View>
      <View style={styles.fieldSpacing}>
        <Input
          label="Full name"
          value={values.fullName}
          onChangeText={setField('fullName')}
          error={errors.fullName}
          placeholder="Recipient's full name"
        />
      </View>
      <View style={styles.fieldSpacing}>
        <Input
          label="Phone"
          value={values.phone}
          onChangeText={setField('phone')}
          error={errors.phone}
          placeholder="10-digit mobile number"
          keyboardType="phone-pad"
        />
      </View>
      <View style={styles.fieldSpacing}>
        <Input
          label="Address line 1"
          value={values.line1}
          onChangeText={setField('line1')}
          error={errors.line1}
          placeholder="House / flat and street"
        />
      </View>
      <View style={styles.fieldSpacing}>
        <Input
          label="Address line 2 (optional)"
          value={values.line2}
          onChangeText={setField('line2')}
          error={errors.line2}
          placeholder="Landmark, area"
        />
      </View>
      <View style={styles.fieldSpacing}>
        <Input label="City" value={values.city} onChangeText={setField('city')} error={errors.city} placeholder="City" />
      </View>
      <StatePicker value={values.state} onChange={(state) => setField('state')(state)} error={errors.state} />
      <View style={styles.fieldSpacing}>
        <Input
          label="PIN code"
          value={values.postalCode}
          onChangeText={setField('postalCode')}
          error={errors.postalCode}
          placeholder="6-digit PIN code"
          keyboardType="numeric"
          maxLength={6}
        />
      </View>

      <View style={{ flexDirection: 'row', marginTop: theme.spacing(2) }}>
        <View style={{ flex: 1, marginRight: theme.spacing(1) }}>
          <Button title="Cancel" variant="secondary" onPress={onCancel} disabled={isSubmitting} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title={submitLabel} onPress={handleSubmit} loading={isSubmitting} />
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
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalSheet: {
    maxHeight: '80%',
  },
})
