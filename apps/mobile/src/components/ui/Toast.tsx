import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Animated, Pressable, StyleSheet, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme } from '../../theme'
import { useReducedMotion } from '../../lib/useReducedMotion'

export type ToastVariant = 'success' | 'error' | 'info'

export interface ToastAction {
  label: string
  onPress: () => void
}

interface ToastState {
  id: number
  message: string
  variant: ToastVariant
  action?: ToastAction
}

interface ToastContextValue {
  /** `options.action` adds a tappable action (e.g. "Undo") alongside the
   * message — checklist section 4: "Use a Snackbar action such as Undo when
   * an undo operation is available." Tapping it also dismisses the toast. */
  show: (message: string, variant?: ToastVariant, options?: { action?: ToastAction }) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const AUTO_DISMISS_MS = 3000

/**
 * Lightweight, non-blocking feedback: a single toast visible at a time,
 * auto-dismissing after ~3s. No queue/history — firing a new toast while
 * one is visible replaces it outright and resets the dismiss timer.
 */
export function ToastProvider(props: { children: React.ReactNode }): JSX.Element {
  const { children } = props
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const reducedMotion = useReducedMotion()
  const [toast, setToast] = useState<ToastState | null>(null)
  const opacity = useRef(new Animated.Value(0)).current
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seqRef = useRef(0)

  const dismiss = useCallback(() => {
    Animated.timing(opacity, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setToast(null)
    })
  }, [opacity])

  const show = useCallback(
    (message: string, variant: ToastVariant = 'info', options?: { action?: ToastAction }) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      seqRef.current += 1
      setToast({ id: seqRef.current, message, variant, action: options?.action })
      opacity.setValue(0)
      Animated.timing(opacity, {
        toValue: 1,
        duration: reducedMotion ? 0 : theme.motion.fast,
        useNativeDriver: true,
      }).start()
      timerRef.current = setTimeout(() => {
        dismiss()
      }, AUTO_DISMISS_MS)
    },
    [dismiss, opacity],
  )

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const value = useMemo<ToastContextValue>(() => ({ show }), [show])

  const toneColor =
    toast?.variant === 'success'
      ? theme.colors.success
      : toast?.variant === 'error'
      ? theme.colors.danger
      : theme.colors.primary

  const toneIcon =
    toast?.variant === 'success'
      ? 'checkmark-circle'
      : toast?.variant === 'error'
      ? 'alert-circle'
      : 'information-circle'

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        // Anchored to the TOP of the screen, not the bottom. Every screen
        // in this app has something different sitting at the bottom — a
        // CTA button, the floating tab bar, a sticky footer — and a
        // bottom-anchored toast kept landing on top of whichever one was
        // there (confirmed on-device: it rendered directly over the "Add to
        // cart" button). Nothing occupies this top strip on any screen, so
        // it can't collide with anything, on any screen, ever.
        <Animated.View
          // `box-none` when there's a tappable action (so it reaches through
          // to the action button but not the background), `none` otherwise —
          // a plain confirmation toast must stay non-blocking.
          pointerEvents={toast.action ? 'box-none' : 'none'}
          style={[
            styles.container,
            {
              top: insets.top + theme.spacing(1.5),
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radii.pill,
              ...theme.elevation.md,
              paddingVertical: theme.spacing(1.25),
              paddingHorizontal: theme.spacing(2),
              opacity,
            },
          ]}
        >
          <Ionicons name={toneIcon} size={theme.sizes.icon.sm} color={toneColor} />
          <Text
            style={[theme.typography.body, styles.message, { color: theme.colors.text, fontWeight: '600' }]}
            accessibilityLiveRegion="polite"
          >
            {toast.message}
          </Text>
          {toast.action ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={toast.action.label}
              onPress={() => {
                toast.action?.onPress()
                dismiss()
              }}
              hitSlop={8}
            >
              <Text style={[theme.typography.label, { color: theme.colors.primary, textTransform: 'uppercase' }]}>
                {toast.action.label}
              </Text>
            </Pressable>
          ) : null}
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  )
}

/** Fire-and-forget toast feedback. Must be used within a `<ToastProvider>`. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast() must be used within a <ToastProvider>')
  }
  return ctx
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  message: {
    flexShrink: 1,
  },
})
