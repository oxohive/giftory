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
      : theme.colors.text

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.container,
            {
              bottom: insets.bottom + theme.spacing(3),
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radii.md,
              borderColor: toneColor,
              paddingVertical: theme.spacing(1.5),
              paddingHorizontal: theme.spacing(2),
              opacity,
            },
          ]}
        >
          <Text
            style={[theme.typography.body, { color: theme.colors.text }]}
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
    borderWidth: 1,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
})
