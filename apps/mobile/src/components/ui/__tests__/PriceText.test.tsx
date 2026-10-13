import React from 'react'
import { render, screen } from '@testing-library/react-native'
import { PriceText } from '../PriceText'

describe('PriceText', () => {
  it('formats a known INR amount using the en-IN/INR convention', () => {
    render(<PriceText amountMajor={499} />)
    // en-IN Intl.NumberFormat renders the rupee sign with no space before
    // the digits, e.g. "₹499.00".
    expect(screen.getByText('₹499.00')).toBeTruthy()
  })

  it('formats a different currency code when passed explicitly', () => {
    render(<PriceText amountMajor={10} currencyCode="USD" />)
    expect(screen.getByText('$10.00')).toBeTruthy()
  })

  it('formats a decimal amount correctly', () => {
    render(<PriceText amountMajor={1234.5} />)
    expect(screen.getByText('₹1,234.50')).toBeTruthy()
  })
})
