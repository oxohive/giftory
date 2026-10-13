import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { IconButton } from '../IconButton'

describe('IconButton', () => {
  it('renders with the required accessibilityLabel', () => {
    render(<IconButton icon="cart" accessibilityLabel="Cart" onPress={() => {}} />)
    expect(screen.getByLabelText('Cart')).toBeTruthy()
  })

  it('calls onPress when tapped', () => {
    const onPress = jest.fn()
    render(<IconButton icon="cart" accessibilityLabel="Cart" onPress={onPress} />)
    fireEvent.press(screen.getByLabelText('Cart'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('renders a badge count when badgeCount > 0', () => {
    render(<IconButton icon="cart" accessibilityLabel="Cart" onPress={() => {}} badgeCount={3} />)
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('caps the badge display at "99+"', () => {
    render(<IconButton icon="cart" accessibilityLabel="Cart" onPress={() => {}} badgeCount={150} />)
    expect(screen.getByText('99+')).toBeTruthy()
  })

  it('omits the badge when badgeCount is 0', () => {
    render(<IconButton icon="cart" accessibilityLabel="Cart" onPress={() => {}} badgeCount={0} />)
    expect(screen.queryByText('0')).toBeNull()
  })
})
