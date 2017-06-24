'use strict';

const Qs = require('qs');
// const Analytics = require('./vendor/google-analytics-bundle');

const Contentutils = require('./contentutils');
// const Reporting = require('./reporting');

// Prevent our messages from going to other instances of the content script.
const ID = Date.now().toString();

// This only exists in a multi-login session.
const USER_INDEX = Qs.parse(location.search.substring(1)).u || '0';

function getInjectCode(id) {
  // potentially useful: context[12] is the email for authenticated users.
  /* eslint-disable prefer-template,no-undef */
  const code = '(' + function inject() {
    if (window.USER_CONTEXT[12] !== '') {
      window.postMessage(
        {contentScriptId: contentScriptIdRepr,
          userId: window.USER_ID,
          tier: window.USER_CONTEXT[13],
          gaiaId: window.USER_CONTEXT[32],
          xt: window._GU_getCookie('xt')},
        '*');
    }
  } + ')()';
  /* eslint-enable prefer-template,no-undef */

  // We need to actually get the value of our variable into the string, not a reference to it.
  return code.replace('contentScriptIdRepr', `'${id}'`);
}

function eventListener(event) {
  // We only accept messages from ourselves
  if (event.source !== window || event.data.contentScriptId !== ID) {
    return;
  }

  console.log('(new) received from page', event.data);

  const userId = event.data.userId;
  const tier = event.data.tier;
  const xt = event.data.xt;
  const gaiaId = event.data.gaiaId;

  window.removeEventListener('message', eventListener);

  chrome.runtime.sendMessage({
    action: 'showPageAction',
    tier,
    xt,
    gaiaId,
    userId: `${userId}`,
    userIndex: parseInt(USER_INDEX, 10),
  });
}

function main() {
  window.addEventListener('message', eventListener);
  Contentutils.injectCode(getInjectCode(ID));
}

main();
