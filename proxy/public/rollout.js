// Compass rollout switch for the site-wide loader (widget/hivebrite-site-loader.html).
// Pages with their own Compass HTML block are not affected by this file.
// Paths match by prefix ("/page/careers" also covers "/page/careers/..."). A change
// goes live within about 5 minutes of the push.
window.__CMP_ROLLOUT__ = {
  site_wide: false,   // true = Compass on every page except "exclude"
  pages: [],          // while site_wide is false, turn it on for just these pages
  exclude: ['/admin', '/users/sign_in', '/users/sign_up', '/login', '/signup']
};
