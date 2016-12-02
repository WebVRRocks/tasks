var fs = require('fs');
var path = require('path');

var request = require('request-promise');

var logger = require('../logger')(__filename);

var AIRTABLE_WEBVR_SCENES_FILENAME = 'webvr_scenes.json';
var AIRTABLE_WEBVR_SCENES_PATH = path.resolve(
  __dirname, '..', 'data', AIRTABLE_WEBVR_SCENES_FILENAME
);
var AIRTABLE_WEBVR_SCENES_RELATIVE_TO_ROOT_PATH = path.relative(
  '..', AIRTABLE_WEBVR_SCENES_PATH
);

module.exports.options = {
  maxAttempts: 50,
  backoff: '10s',
  concurrency: 1,
  interval: '10s'
};

module.exports.run = function () {
  return request({
    uri: 'https://api.airtable.com/v0/app08C2f6KbFHvaAA/webvr_scenes',
    headers: {
      'Authorization': 'Bearer keyMJq1gSRuwMTZ8r'
    }
  }).then(function (data) {
    logger.info('Writing to %s', AIRTABLE_WEBVR_SCENES_RELATIVE_TO_ROOT_PATH);

    // TODO: Push to Firebase!

    fs.createWriteStream(AIRTABLE_WEBVR_SCENES_PATH).write(data);
  }).catch(function (err) {
    // API call failed.
    logger.error(err);
    throw err;
  });
};
