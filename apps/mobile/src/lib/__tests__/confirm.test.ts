import { Alert } from 'react-native'
import { confirmDestructive } from '../confirm'

describe('confirmDestructive', () => {
  it('calls Alert.alert with the title, message, and cancel/confirm buttons', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    const onConfirm = jest.fn()

    confirmDestructive({
      title: 'Remove item?',
      message: 'This cannot be undone.',
      onConfirm,
    })

    expect(alertSpy).toHaveBeenCalledTimes(1)
    const [title, message, buttons] = alertSpy.mock.calls[0]
    expect(title).toBe('Remove item?')
    expect(message).toBe('This cannot be undone.')
    expect(buttons).toHaveLength(2)
    expect(buttons?.[0]).toMatchObject({ text: 'Cancel', style: 'cancel' })
    expect(buttons?.[1]).toMatchObject({ text: 'Confirm', style: 'destructive' })

    alertSpy.mockRestore()
  })

  it('invokes onConfirm when the destructive button is pressed', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    const onConfirm = jest.fn()

    confirmDestructive({ title: 'Delete address?', onConfirm, confirmLabel: 'Delete' })

    const buttons = alertSpy.mock.calls[0][2]
    buttons?.[1].onPress?.()

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(buttons?.[1]).toMatchObject({ text: 'Delete' })

    alertSpy.mockRestore()
  })
})
