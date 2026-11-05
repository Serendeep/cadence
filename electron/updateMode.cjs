/**
 * 'install' downloads and swaps the app in place; 'notify' only points the user at the release page.
 * Unsigned macOS builds are refused by Squirrel.Mac, and deb/pacman installs belong to the package manager.
 */
function updateMode(platform, appImagePath) {
  if (platform === 'win32') return 'install'
  if (platform === 'linux' && appImagePath) return 'install'
  return 'notify'
}

module.exports = { updateMode }
