'use strict';

// Inject some javascript (as a string) into the DOM.
exports.injectCode = function injectCode(code) {
  const script = document.createElement('script');
  script.textContent = code;
  (document.head || document.documentElement).appendChild(script);
  script.parentNode.removeChild(script);
};
