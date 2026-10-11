module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    // react-native-reanimated (pulled in by @gorhom/bottom-sheet, TASK-14) requires
    // its Babel plugin to be listed last.
    plugins: ['react-native-reanimated/plugin'],
  }
}
