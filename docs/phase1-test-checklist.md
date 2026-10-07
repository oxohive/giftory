# Phase 1 Test Checklist

| App | URL | Login |
|---|---|---|
| Storefront (shop) | http://localhost:3100 | create an account in section 4 |
| Admin backend | http://localhost:3000/login | `admin@acme.com` / `secret` |

**Start the servers** (if they aren't running):

```bash
cd apps/mercato && yarn dev:classic     # backend + admin, port 3000
cd apps/storefront && npm run dev       # storefront, port 3100
```

> No email provider is configured, so sign-up and verification emails are not sent. Verify a test customer's email by hand in the admin under **Customer accounts**.

---

## 1. Storefront: browsing (no login)

- [x] The home page loads with the hero, the "Shop by occasion" tiles and featured products
- [x] `/products` lists the 12 gift products with INR (₹) prices
- [x] Filters work: category, occasion, price range, search, sorting -- feedback, price range mandatorilty requires the max/min value to  if no ui No UI violation then Error occurs 
- [x] **Personalised Photo Mug**: switching 11 oz / 15 oz changes the price (₹399 / ₹499)
- [x] The mug page shows the "Customizable — 3D designer coming soon" badge
- [x] The gift wrap option and gift message box appear on the product page
- [x] Mobile-width window works
- [x] Dark mode works

## 2. Cart

- [x] Add the mug with gift wrap and a gift message; the cart total is correct
- [x] Change the quantity; the total updates
- [x] Edit the gift message on a cart line
- [x] Remove a line
- [x] "Empty cart" clears everything
- [x] A gift message over 250 characters shows an inline error
- [x] Reload the page; the cart is still there (stored on the server)

## 3. Checkout (guest)

- [ ] An invalid 6-digit PIN code is rejected
- [ ] A non-Indian mobile number is rejected
- [ ] Standard (₹49) and Express (₹149) delivery appear, and the total updates
- [ ] Choose Stripe or Razorpay and place the order
- [ ] **Without payment keys:** "We could not start the payment. Your order is saved" appears, with a "Complete your payment" panel (expected)
- [ ] Clicking retry does **not** create a second order (check the order count in the admin)

## 4. Customer account

- [ ] Register at `/account/register`
- [ ] Verify the customer's email in the admin (**Customer accounts**)
- [ ] Log in on the storefront
- [ ] Add items as a guest, then log in; the guest cart merges into the account
- [ ] `/account/addresses`: add an address
- [ ] Edit an address
- [ ] Delete an address
- [ ] Set a default address
- [ ] Place an order while logged in; it appears under `/account/orders`
- [ ] The order detail page shows the lines, gift options, delivery and totals
- [ ] Log out; `/account/orders` no longer shows orders

## 5. Admin backend

- [ ] **Sales → Orders**: test orders show the correct lines, quantities and prices
- [ ] Each order line shows its gift message and gift wrap
- [ ] Shipping and the grand total are correct; payment status is "pending"
- [ ] **Customers**: each storefront shopper appears as a person, linked to their orders
- [ ] **Catalog → Products → edit**: the **Gift profile** card is visible
- [ ] Change the occasions in the Gift profile; the storefront reflects it
- [ ] Turn off gift wrap in the Gift profile; the storefront hides the option
- [ ] **Gift occasions** page: add an occasion
- [ ] Edit an occasion
- [ ] Deactivate an occasion; the storefront home page tiles update
- [ ] Change a product's price; the cart shows the new price (prices are recalculated on the server)

## 6. Payments (needs test keys)

Add test keys to `apps/mercato/.env`, then restart the backend:

```env
OM_INTEGRATION_STRIPE_PUBLISHABLE_KEY=pk_test_...
OM_INTEGRATION_STRIPE_SECRET_KEY=sk_test_...
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
```

**Stripe**

- [ ] Pay with card `4242 4242 4242 4242` (any future expiry, any CVC); the order becomes paid
- [ ] Declined card `4000 0000 0000 0002` shows an error; retry on the same order
- [ ] The retry doesn't create a duplicate order

**Razorpay**

- [ ] Pay with UPI `success@razorpay` or a Razorpay test card; you land on the order confirmation page
- [ ] Close the payment popup, then retry; no duplicate order is created
- [ ] After payment, the admin shows the order as paid

**Webhooks** (the payment provider confirming the payment)

- [ ] Only testable when the backend is reachable at a public HTTPS address. Webhook paths:
  - Stripe: `/api/payment_gateways/webhook/stripe`
  - Razorpay: `/api/payment_gateways/webhook/razorpay`

---

## Expected oddities (not bugs)

- 4 non-gift demo products from the Open Mercato starter template still appear
- Orders `ORDER-20261006-00001` to `00004` already exist from earlier testing
- Account emails (verification, password reset) are not sent, and their links would point at Open Mercato's built-in portal, not the storefront
- Delivery charges are flat (Standard / Express); no live courier rates
- No GST rates are configured yet

## Reporting issues

For each failure, note:

- the page URL
- the steps you took
- what you expected
- what happened (with a screenshot if possible)
