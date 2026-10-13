import * as Haptics from 'expo-haptics'

/**
 * Thin wrapper around `expo-haptics` so call sites say `haptics.light()` /
 * `haptics.success()` / `haptics.error()` instead of importing `expo-haptics`
 * directly everywhere. Haptics are inherently best-effort (unsupported on
 * some devices/platforms, and unavailable in Expo Go on some older Android
 * devices) — every call swallows its own failure so a missing/unsupported
 * haptic engine never breaks the action it's attached to.
 */
export const haptics = {
  /** Button presses. */
  light: (): void => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
  },
  /** Order confirmed, item added. */
  success: (): void => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
  },
  /** A mutation failed. */
  error: (): void => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
  },
}
