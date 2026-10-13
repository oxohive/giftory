import React from 'react'
import { render } from '@testing-library/react-native'
import { Divider } from '../Divider'

describe('Divider', () => {
  it('renders without crashing with the default (horizontal) orientation', () => {
    expect(() => render(<Divider />)).not.toThrow()
  })

  it('renders without crashing in the vertical orientation', () => {
    expect(() => render(<Divider orientation="vertical" />)).not.toThrow()
  })
})
