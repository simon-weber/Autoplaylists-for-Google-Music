'use strict';
const Raven = require('raven-js');
const Analytics = require('analytics'); // eslint-disable-line import/no-unresolved,import/no-extraneous-dependencies

const Context = require('./context');

const limiter = {};

Raven
.config('https://ea691c5833f34aa085df5e5aee9a46f3@app.getsentry.com/66349', {
  release: chrome.runtime.getManifest().version,
  shouldSendCallback: data => {
    // rate limit error sending to sentry, but duplicate to GA.
    // source: https://github.com/getsentry/raven-js/issues/435#issuecomment-183021031

    exports.reportGAError(data);

    if (data.message in limiter) {
      return false;
    }

    limiter[data.message] = true;

    setTimeout(() => {
      delete limiter[data.message];
    }, 1000 * 60 * 30);

    return true;
  },
})
.install();
exports.Raven = Raven;

window.addEventListener('unhandledrejection', event => {
  Raven.captureException(event.reason);
});

const GAService = Analytics.getService('autoplaylists');
const GATracker = GAService.getTracker('UA-71628085-3');
exports.GAService = GAService;
exports.GATracker = GATracker;

let cachedContext = null;

// action is 'success' or 'failure'
// type is 'Playlist' or 'Entry'
// value is the number of mutations being sent
exports.reportNewSync = function reportNewSync(action, type, value) {
  if (!cachedContext) {
    // setContext should make this available very quickly after loading.
    setTimeout(reportNewSync, 1000, action, type, value);
  } else {
    const category = 'newSync' + type;
    const sync = Analytics.EventBuilder.builder()
    .category(category)
    .action(action)
    .value(value);

    GATracker.send(sync);
  }
};

// type is 'playlist' or 'entry'
// mutations is a list of mutations
exports.reportMutationBatch = function reportMutationBatch(type, mutations) {
  if (!cachedContext) {
    setTimeout(reportMutationBatch, 1000, type, mutations);
  } else {
    const category = type + 'MutationBatch';
    const counts = getMutationCounts(mutations);

    for (const mutationType in counts) {
      const count = counts[mutationType];
      if (count === 0) {
        // I'm not entirely sure if this is the best way to report this.
        // It makes comparing batch breakdown a bit harder (the denominator differs across averages),
        // but gives slightly more information (how often there are no mutations of a type).
        continue;
      }

      const batch = Analytics.EventBuilder.builder()
      .category(category)
      .action(mutationType)
      .value(count);

      GATracker.send(batch);
    }
  }
};

function getMutationCounts(mutations) {
  const counts = {
    'create': 0,
    'update': 0,
    'delete': 0,
  };
  mutations.forEach(mutation => {
    // Mutations will only have one key at the top level.
    const type = Object.keys(mutation)[0];
    counts[type]++;
  });

  return counts;
}

// num is the number of mixed reorders present in the sync.
exports.reportMixedReorders = function reportMixedReorders(num) {
  if (!cachedContext) {
    setTimeout(reportMixedReorders, 1000, num);
  } else if (num > 0) {
    const reorders = Analytics.EventBuilder.builder()
    .category('mixedReorders')
    .action('present')
    .value(num);

    GATracker.send(reorders);
  }
};


// action is one of 'valid' or 'invalid'.
exports.reportActivation = function reportActivation(action) {
  if (!cachedContext) {
    setTimeout(reportActivation, 1000, action);
  } else {
    const activation = Analytics.EventBuilder.builder()
    .category('activation')
    .action(action);

    GATracker.send(activation);
  }
};

// action is one of 'valid' or 'invalid'.
// label describes what triggered the prompt and whether it was interactive, eg startupN, licenseI.
exports.reportAuth = function reportAuth(action, label) {
  if (!cachedContext) {
    setTimeout(reportAuth, 1000, action, label);
  } else {
    const auth = Analytics.EventBuilder.builder()
    .category('oauth')
    .action(action)
    .label(label);

    GATracker.send(auth);
  }
};

exports.reportHit = function reportHit(view) {
  if (!cachedContext) {
    setTimeout(reportHit, 1000, view);
  } else {
    GATracker.sendAppView(view);
  }
};

// Send a sentry error to GA.
exports.reportGAError = function reportGAError(sentryData) {
  if (!cachedContext) {
    setTimeout(reportGAError, 1000, sentryData);
  } else {
    const error = Analytics.EventBuilder.builder()
    .category('error')
    .action(sentryData.message)
    .label(sentryData.message);

    GATracker.send(error);
  }
};


// FIXME there's a race between doing reporting and setting the context.
// It won't be attached for very early messages.
function setContext(isBackground, context) {
  console.log('setting context:', isBackground, context);

  cachedContext = context;

  GATracker.set('userId', context.reportingUUID);
  GATracker.set('dimension1', context.tags.hasFullVersion ? 'full' : 'free');
  GATracker.set('dimension2', context.tags.isDeveloper ? 'yes' : 'no');

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
