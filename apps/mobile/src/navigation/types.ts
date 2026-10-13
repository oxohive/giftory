export type RootTabParamList = {
  Home: undefined
  Products: { occasion?: string; category?: string } | undefined
  Cart: undefined
  Account: undefined
}

export type CatalogStackParamList = {
  Home: undefined
  ProductList: { occasion?: string; category?: string; search?: string } | undefined
  ProductDetail: { handle: string }
}

export type CheckoutStackParamList = {
  Address: undefined
  Shipping: undefined
  Payment: undefined
  Confirmation: { orderId: string }
}

export type AccountStackParamList = {
  Account: undefined
  Addresses: undefined
  OrderDetail: { orderId: string }
}

/**
 * Implementation-only type, NOT part of the contract above. The bottom-tab
 * "Cart" screen renders a single native-stack navigator that holds the Cart
 * screen itself plus the full checkout flow, so a placeholder action on
 * `CartScreen` can push straight into `CheckoutStackParamList`'s routes
 * (see acceptance criteria in TASK-01). Feature tasks should keep using
 * `CheckoutStackParamList` directly — this is just the param list of the
 * concrete navigator instance that hosts those routes alongside `Cart`.
 */
export type CartStackParamList = {
  Cart: undefined
} & CheckoutStackParamList
