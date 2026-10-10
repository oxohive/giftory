/**
 * `react-native-razorpay` ships no bundled TypeScript types and has no
 * `@types/react-native-razorpay` package on npm, so this feature provides
 * its own ambient module declaration (scoped to this file only — it does
 * not reach outside `src/features/checkout/**`) to typecheck against the
 * native SDK's documented JS surface:
 *
 *   import RazorpayCheckout from 'react-native-razorpay'
 *   RazorpayCheckout.open(options): Promise<RazorpayCheckoutSuccess>
 *
 * `open()` resolves on a successful payment with the three `razorpay_*`
 * fields the backend's `/api/gateway_razorpay/confirm` endpoint expects
 * verbatim, and rejects (with an SDK error object, not a thrown `Error`)
 * when the user cancels the modal or Razorpay itself declines the payment.
 *
 * This declaration is not a substitute for the real package — it only lets
 * this feature's TypeScript compile against the native module's shape before
 * `react-native-razorpay` is actually installed/linked (see this task's
 * report for the exact dependency to add to `apps/mobile/package.json`).
 */
declare module 'react-native-razorpay' {
  export interface RazorpayCheckoutOptions {
    key: string
    order_id: string
    amount: number
    currency: string
    name: string
    description?: string
    image?: string
    prefill?: {
      email?: string
      contact?: string
      name?: string
    }
    theme?: {
      color?: string
    }
    notes?: Record<string, string>
  }

  export interface RazorpayCheckoutSuccess {
    razorpay_payment_id: string
    razorpay_order_id: string
    razorpay_signature: string
  }

  export interface RazorpayCheckoutError {
    code: number
    description: string
    [key: string]: unknown
  }

  interface RazorpayCheckoutStatic {
    open(options: RazorpayCheckoutOptions): Promise<RazorpayCheckoutSuccess>
  }

  const RazorpayCheckout: RazorpayCheckoutStatic
  export default RazorpayCheckout
}
