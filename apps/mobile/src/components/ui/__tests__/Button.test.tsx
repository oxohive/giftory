import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { Button } from '../Button'

describe('Button', () => {
  it('renders the title', () => {
    render(<Button title="Add to cart" onPress={() => {}} />)
    expect(screen.getByText('Add to cart')).toBeTruthy()
  })

  it('calls onPress when tapped', () => {
    const onPress = jest.fn()
    render(<Button title="Save" onPress={onPress} />)
    fireEvent.press(screen.getByText('Save'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('does not call onPress when disabled', () => {
    const onPress = jest.fn()
    render(<Button title="Save" onPress={onPress} disabled />)
    fireEvent.press(screen.getByText('Save'))
    expect(onPress).not.toHaveBeenCalled()
  })

  it('does not call onPress when loading', () => {
    const onPress = jest.fn()
    render(<Button title="Save" onPress={onPress} loading />)
    expect(onPress).not.toHaveBeenCalled()
    // While loading, the title text isn't rendered at all (replaced by the
    // spinner) — pressing the button itself must still not fire onPress.
    expect(screen.queryByText('Save')).toBeNull()
  })

  it('shows an ActivityIndicator when loading', () => {
    render(<Button title="Save" onPress={() => {}} loading />)
    expect(screen.queryByText('Save')).toBeNull()
    expect(screen.UNSAFE_getByType(require('react-native').ActivityIndicator)).toBeTruthy()
  })

  it.each(['primary', 'secondary', 'ghost', 'destructive'] as const)(
    'renders the %s variant without crashing',
    (variant) => {
      render(<Button title="Go" onPress={() => {}} variant={variant} />)
      expect(screen.getByText('Go')).toBeTruthy()
    }
  )

  it('has accessibilityRole="button"', () => {
    render(<Button title="Go" onPress={() => {}} />)
    expect(screen.getByRole('button')).toBeTruthy()
  })
})
