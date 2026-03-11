(function bootstrap() {
  // Apply saved theme before first paint to prevent flicker.
  try {
    var theme = localStorage.getItem('wolf_theme');
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    }
  } catch (_err) {
    // Ignore localStorage or matchMedia access issues.
  }

  // Reveal material symbols once the font is ready.
  var revealIcons = function () {
    document.documentElement.classList.add('fonts-loaded');
  };

  var timeoutId = setTimeout(revealIcons, 4000);
  try {
    document.fonts
      .load('400 1em "Material Symbols Outlined"')
      .then(function () {
        clearTimeout(timeoutId);
        revealIcons();
      })
      .catch(function () {
        clearTimeout(timeoutId);
        revealIcons();
      });
  } catch (_err) {
    clearTimeout(timeoutId);
    revealIcons();
  }
})();
