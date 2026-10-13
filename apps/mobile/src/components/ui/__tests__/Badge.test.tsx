import React from 'react'
import { render, screen } from '@testing-library/react-native'
import { Badge } from '../Badge'

describe('Badge', () => {
  it('renders its label', () => {
    render(<Badge label="New" />)
    expect(screen.getByText('New')).toBeTruthy()
  })

  it.each(['info', 'success', 'warning', 'danger'] as const)(
    'renders the %s tone without crashing',
    (tone) => {
      expect(() => render(<Badge label="Status" tone={tone} />)).not.toThrow()
    }
  )
})
