
const Raven = require('raven-js');

const Context = require('./context.js');

Raven
.config('https://ea691c5833f34aa085df5e5aee9a46f3@app.getsentry.com/66349', {
  release: chrome.runtime.getManifest().version,
})
.install();
exports.Raven = Raven;

const GAService = analytics.getService('autoplaylists');
const GATracker = GAService.getTracker('UA-71628085-3');
exports.GAService = GAService;
exports.GATracker = GATracker;

let cachedContext = null;

// action is one of 'success', 'retry', or 'failure'.
// label is optional, and can be something like 'gave-up' or 'failed-reorder'.
exports.reportSync = function reportSync(action, label) {
  // Note that due to GA's serverside rate limiting, this can drop bursty events.
  // If this becomes a problem, consider something like http://stackoverflow.com/a/9340290/1231454.

  if (!cachedContext) {
    // setContext should make this available very quickly after loading.
    setTimeout(reportSync, 5000);
  } else {
    let sync = analytics.EventBuilder.builder()
    .category('sync')
    .action(action);

    if (arguments.length === 2) {
      sync = sync.label(label);
    }

    GATracker.send(sync);
  }
};


// FIXME there's a race between doing reporting and setting the context.
// It won't be attached for very early messages.
function setContext(isBackground, context) {
  console.log('setting context:', isBackground, context);

  cachedContext = context;

  GATracker.set('userId', context.reportingUUID);
  GATracker.set('dimension1', cachedContext.hasFullVersion ? 'full' : 'free');
  GATracker.set('dimension2', cachedContext.isDeveloper ? 'yes' : 'no');

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
