import { Alert } from 'react-native'

export interface ConfirmOptions {
  title: string
  message?: string
  /** Defaults to "Confirm". Styled as the alert's destructive action. */
  confirmLabel?: string
  /** Defaults to "Cancel". */
  cancelLabel?: string
  onConfirm: () => void
}

/**
 * The one confirmation pattern every destructive action in the app should
 * use, instead of calling `Alert.alert` directly with ad hoc button copy
 * per screen (checklist section 4: "Use an Alert Dialog for decisions
 * requiring the user's attention" / "Confirm consequential or destructive
 * actions"). Wraps React Native's built-in `Alert.alert` — there's no
 * custom themed modal here, since `Alert.alert` already renders as the
 * correct native platform dialog on both iOS and Android, which a custom
 * JS modal can't fully replicate (same reasoning `ScreenHeader` documents
 * for why it replaced native-stack headers, in reverse: here the *native*
 * component is the more correct one to keep using).
 */
export function confirmDestructive(options: ConfirmOptions): void {
  const { title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', onConfirm } = options
  Alert.alert(title, message, [
    { text: cancelLabel, style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ])
}
