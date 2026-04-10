/**
 * back-nav.js — smart "Back" link for demo + blog pages
 *
 * Problem it solves: every demo page has an "← Back" link hardcoded to `/demos/`
 * (the gallery). When someone navigates from the landing page into a demo, they
 * expect "Back" to return to the landing page, not dump them in the gallery.
 *
 * Behavior:
 *  - Targets any `.demo-bar-back` link and any element with `[data-back-nav]`.
 *  - On click: if `document.referrer` is a URL on the same host AND browser
 *    history has more than one entry, prevent default and `history.back()`.
 *  - Otherwise fall through to the element's `href` attribute (which stays
 *    as `/demos/` — the safety net for direct loads, shared links, bookmarks,
 *    and search-engine arrivals).
 *
 * This is non-breaking: JS disabled → original `href` behavior still works.
 *
 * No dependencies. No framework. Ships as a plain <script src="/js/back-nav.js" defer>.
 */
(function () {
  'use strict';

  function init() {
    var links = document.querySelectorAll('.demo-bar-back, [data-back-nav]');
    if (!links.length) return;

    links.forEach(function (link) {
      link.addEventListener('click', function (e) {
        var ref = document.referrer || '';
        var sameHost = false;
        if (ref) {
          try {
            sameHost = new URL(ref).host === window.location.host;
          } catch (err) {
            sameHost = false;
          }
        }
        if (sameHost && window.history.length > 1) {
          e.preventDefault();
          window.history.back();
        }
        // Else: fall through to the hardcoded href (fallback).
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
