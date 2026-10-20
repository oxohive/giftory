import { useEffect, useState } from 'react'
import NetInfo from '@react-native-community/netinfo'

/**
 * Live network-connectivity status (checklist section 7: "Define offline
 * behavior"). Starts `true` (assume online) until the first native check
 * resolves, then tracks live changes for the lifetime of the app.
 *
 * `isConnected` alone can be `true` on a Wi-Fi network with no real
 * internet (captive portal, etc.) — `isInternetReachable` is the stronger
 * signal where the platform can determine it; fall back to `isConnected`
 * when the platform reports `null` (unknown) for reachability.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const reachable = state.isInternetReachable
      setOnline(reachable === null || reachable === undefined ? !!state.isConnected : reachable)
    })
    return () => unsubscribe()
  }, [])

  return online
}
