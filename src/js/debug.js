require('jquery-modal');

const Track = require('./track.js');
const Reporting = require('./reporting.js');


const sortedFields = Track.fields.slice();
function compareByLabel(a, b) {
  const aName = a.label.toLowerCase();
  const bName = b.label.toLowerCase();
  return ((aName < bName) ? -1 : ((aName > bName) ? 1 : 0)); // eslint-disable-line no-nested-ternary
}
sortedFields.sort(compareByLabel);

function main() {
  Reporting.reportHit('debug.js');
  $('#submit').click(e => {
    e.preventDefault();

    const query = $('#debugQuery').val();


    chrome.runtime.sendMessage({action: 'debugQuery', query}, response => {
      const columns = [];
      const datetimeRender = val => new Date(val / 1000).toLocaleString();
      Track.fields.forEach(field => {
        const column = {data: field.name, title: field.label};
        if (field.is_datetime) {
          column.render = datetimeRender;
        }
        column.visible = (field.name === 'title' || field.name === 'artist' || field.name === 'album');
        columns.push(column);
      });

      if ($.fn.DataTable.isDataTable('#query-result')) {
        // option destroy: true does not work when changing the number of columns,
        // so clear the table and the dom manually.
        $('#query-result').dataTable().fnDestroy();
        $('#query-result').empty();
      }

      $('#query-result').DataTable({ // eslint-disable-line new-cap
        autoWidth: true,
        dom: 'Bfrtip',
        data: response.tracks,
        columns,
        aaSorting: [],
        buttons: [
          {
            extend: 'colvis',
            collectionLayout: 'fixed two-column',
          },
        ],
      });
      $('#query-modal').modal();
    });
  });
}

$(main);
