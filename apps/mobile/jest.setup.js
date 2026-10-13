// Adds @testing-library/react-native's custom Jest matchers (toBeDisabled,
// toHaveTextContent, etc.) on top of the native-module mocks jest-expo's own
// preset setup already installs (expo-font, expo-haptics, and friends).
require('@testing-library/react-native/extend-expect');
