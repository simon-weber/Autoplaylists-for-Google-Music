'use strict';

const Raven = require('raven-js');

const Context = require('./context.js');

Raven
.config('https://ea691c5833f34aa085df5e5aee9a46f3@app.getsentry.com/66349', {
  release: chrome.runtime.getManifest().version,
})
.install();

// FIXME there's a race between using Raven and setting the context.
// It won't be attached for very early errors.
function setContext(isBackground, context) {
  console.log('setting context:', isBackground, context);

  Raven.setUserContext(context.user);

  context.tags.isBackground = isBackground; // eslint-disable-line no-param-reassign
  Raven.setTagsContext(context.tags);
}

if (chrome.identity && chrome.management) {
  // If we're the background script, we can get the context directly.
  Context.get(context => {
    setContext(true, context);
  });
} else {
  chrome.runtime.sendMessage({action: 'getContext'}, context => {
    setContext(false, context);
  });
}

module.exports = Raven;
