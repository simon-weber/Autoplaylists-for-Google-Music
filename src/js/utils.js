'use strict';

const Qs = require('qs');

const Reporting = require('./reporting');

/* eslint-disable */
// Source: https://gist.github.com/jed/982883.
exports.uuidV1 = function uuidV1(a){
  return a?(a^Math.random()*16>>a/4).toString(16):([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, uuidV1)
}
/* eslint-enable */

function unlessError(func, onError) {
  // Decorate chrome callbacks to notice errors.
  // If an error occurs, call onError.

  return function unlessErrorWrapper() {
    // can't use an arrow function here because we need our own `this`.
    if (chrome.extension.lastError) {
      console.error('unlessError:', chrome.extension.lastError.message);
      Reporting.Raven.captureMessage(chrome.extension.lastError.message, {
        tags: {
          funcName: func.name,
        },
        extra: {
          func,
          location: 'utils.unlessError',
          error: chrome.extension.lastError,
          this: this,
          arguments: arguments,  // eslint-disable-line object-shorthand
        },
        stacktrace: true,
      });
      if (typeof onError !== 'undefined') {
        onError(chrome.extension.lastError);
      }
    } else {
      func.apply(this, arguments);
    }
  };
}

exports.unlessError = unlessError;

exports.focusOrCreateExtensionTab = function focusOrCreateExtensionTab(url) {
  chrome.tabs.create({url, active: true}, unlessError(t => console.debug('created', t)));

  // There seems to be a bug in Chrome preventing tabs.query from working as expected.
  // chrome.tabs.query({url}, unlessError(tabs => {
  //   console.info('tab query for', url, 'yields', JSON.stringify(tabs, null, '\t'));
  //   if (tabs.length) {
  //     chrome.tabs.update(tabs[0].id, {active: true}, unlessError(t => console.log('selected', t)));
  //   } else {
  //     chrome.tabs.create({url, active: true}, unlessError(t => console.log('created', t)));
  //   }
  // }));
};

exports.goToManager = function goToManager(userId) {
  window.location.href = `/html/playlists.html?${Qs.stringify({userId})}`;
};

exports.maximumIncreasingSubsequenceIndices = function maximumIncreasingSubsequence(a) {
  if (a.length === 0) {
    return [];
  }
  return findSequence(a, findIndex(a));
};

// Source below here: https://rosettacode.org/wiki/Longest_increasing_subsequence#JavaScript
function range(len) {
  const a = [];
  for (let i = 0; i < len; i++) {
    a.push(1);
  }
  return a;
}

/* eslint-disable */
function findIndex(input) {
  var len = input.length;
  var maxSeqEndingHere = range(len).map(function() {
    return 1;
  });
  for (var i = 0; i < len; i++)
    for (var j = i - 1; j >= 0; j--)
      if (input[i] > input[j] && maxSeqEndingHere[j] >= maxSeqEndingHere[i])
        maxSeqEndingHere[i] = maxSeqEndingHere[j] + 1;
  return maxSeqEndingHere;
}

function findSequence(input, result) {
  var maxValue = Math.max.apply(null, result);
  // I'm not actually sure if using lastIndexOf here makes a noticeable difference.
  // It just controls which entry we move when we could pick from multiple.
  var maxIndex = result.lastIndexOf(maxValue);
  var output = [];
  output.push(maxIndex);
  for (var i = maxIndex; i >= 0; i--) {
    if (maxValue == 0) break;
    if (input[maxIndex] > input[i] && result[i] == maxValue - 1) {
      output.push(i);
      maxValue--;
    }
  }
  output.reverse();
  return output;
}
/* eslint-enable */
