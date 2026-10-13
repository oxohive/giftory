import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Animated, StyleSheet, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme } from '../../theme'

export type ToastVariant = 'success' | 'error' | 'info'

interface ToastState {
  id: number
  message: string
  variant: ToastVariant
}

interface ToastContextValue {
  show: (message: string, variant?: ToastVariant) => void
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
    (message: string, variant: ToastVariant = 'info') => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      seqRef.current += 1
      setToast({ id: seqRef.current, message, variant })
      opacity.setValue(0)
      Animated.timing(opacity, {
        toValue: 1,
        duration: 150,
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
          pointerEvents="none"
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
          <Ionicons name={toneIcon} size={20} color={toneColor} />
          <Text
            style={[theme.typography.body, { color: theme.colors.text, fontWeight: '600' }]}
            accessibilityLiveRegion="polite"
          >
            {toast.message}
          </Text>
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
})
