import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { Input } from '../Input'

describe('Input', () => {
  it('renders the label', () => {
    render(<Input label="Full name" value="" onChangeText={() => {}} />)
    expect(screen.getByText('Full name')).toBeTruthy()
  })

  it('calls onChangeText when typed into', () => {
    const onChangeText = jest.fn()
    render(<Input label="Full name" value="" onChangeText={onChangeText} />)
    fireEvent.changeText(screen.getByLabelText('Full name'), 'Jane Doe')
    expect(onChangeText).toHaveBeenCalledWith('Jane Doe')
  })

  it('shows the error message when error is set', () => {
    render(
      <Input label="Email" value="" onChangeText={() => {}} error="Enter a valid email" />
    )
    expect(screen.getByText('Enter a valid email')).toBeTruthy()
  })

  it('shows a "*" when required is true', () => {
    render(<Input label="Email" value="" onChangeText={() => {}} required />)
    expect(screen.getByText('*')).toBeTruthy()
  })

  it('shows an n/max character count when showCharacterCount + maxLength are set', () => {
    render(
      <Input
        label="Gift message"
        value="Hello"
        onChangeText={() => {}}
        maxLength={20}
        showCharacterCount
      />
    )
    expect(screen.getByText('5/20')).toBeTruthy()
  })

  it('does not show a character count when showCharacterCount is false', () => {
    render(
      <Input label="Gift message" value="Hello" onChangeText={() => {}} maxLength={20} />
    )
    expect(screen.queryByText('5/20')).toBeNull()
  })

  it('includes the error text in the accessibility label when present', () => {
    render(<Input label="Email" value="" onChangeText={() => {}} error="Enter a valid email" />)
    expect(screen.getByLabelText('Email, error: Enter a valid email')).toBeTruthy()
  })
})
