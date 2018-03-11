'use strict';

const Qs = require('qs');
const moment = require('moment');

const License = require('./license');
const Reporting = require('./reporting');

function main() {
  const userId = Qs.parse(location.search.substring(1)).userId;
  const manifest = chrome.runtime.getManifest();

  const $version = $('#version');
  if ($version) {
    $version.text('v' + manifest.version);
  }

  const $sub = $('#subscription');
  if ($sub) {
    License.getLicenseStatus(false, licenseStatus => {
      let statusText;
      if (licenseStatus.state === 'FULL' || licenseStatus.state === 'FULL_FORCED') {
        statusText = 'full';
        $('#upgrade-wrapper').hide();
      } else if (licenseStatus.state === 'FREE_TRIAL') {
        const expiresRepr = moment().to(moment(licenseStatus.expiresMs));
        statusText = `trial (expires ${expiresRepr})`;
      } else {
        statusText = 'free';
      }

      $sub.text(statusText);
    });
  }

  $('#brand-nav').attr('href', `/html/playlists.html?${Qs.stringify({userId})}`);
  $('#settings-nav').attr('href', `/html/settings.html?${Qs.stringify({userId})}`);

  $('#check-license').click(e => {
    e.preventDefault();
    License.getLicenseStatus(true, licenseStatus => {
      let reportAction = 'invalid';
      let msg = 'Sorry, either the Chrome licensing api is unavailable' +
       " or it reported that you haven't purchased the full version.";
      if (licenseStatus.state === 'FULL') {
        reportAction = 'valid';
        msg = "Thanks for purchasing the full version! You've been upgraded." +
          ' Please consider rating the extension if you like it.';
      }

      Reporting.reportActivation(reportAction);
      alert(msg);

      if (licenseStatus.state === 'FULL') {
        // don't upsell users who downgrade later on
        Storage.setShouldNotUpsell(true, () => {
          location.reload(true);
        });
      }
    });
  });

  License.getDevStatus(devStatus => {
    if (devStatus.isDev) {
      let verb = 'enable';
      if (devStatus.isFullForced) {
        verb = 'disable';
      }

      $('#dev-tools').append(
        $(`<button class="btn btn-default" id="force-full-license" class="">${verb} full license</button>`)
        .click(e => {
          e.preventDefault();
          License.setFullForced(!devStatus.isFullForced, () => {
            document.location.reload(true);
          });
        })
      );
    }
  });
}

$(main);
