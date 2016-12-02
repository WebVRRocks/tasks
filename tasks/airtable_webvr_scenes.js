var fs = require('fs');
var path = require('path');

var firebase = require('firebase');
var request = require('request-promise');

var logger = require('../logger')(__filename);

var AIRTABLE_WEBVR_SCENES_FILENAME = 'webvr_scenes.json';
var AIRTABLE_WEBVR_SCENES_PATH = path.resolve(
  __dirname, '..', 'data', AIRTABLE_WEBVR_SCENES_FILENAME
);
var AIRTABLE_WEBVR_SCENES_RELATIVE_TO_ROOT_PATH = path.relative(
  '..', AIRTABLE_WEBVR_SCENES_PATH
);

var settings = module.exports.settings = {
  firebase: {
    credentials: {
      apiKey: 'AIzaSyCfMvL2DsldNeLy3LMC6gFrMD_HAFOLT-M',
      authDomain: 'webvr-6345b.firebaseapp.com',
      databaseURL: 'https://webvr-6345b.firebaseio.com',
      storageBucket: 'webvr-6345b.appspot.com',
      messagingSenderId: '689640619063'
    },
    ref: 'webvrrocks/webvr_scenes'
  }
};

var firebaseApp = firebase.initializeApp(settings.firebase.credentials);

var firebaseRef = firebaseApp.database().ref(settings.firebase.ref);

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
    var dataObj = null;
    try {
      dataObj = JSON.parse(data);
    } catch (e) {
      logger.warn('Could not parse data as JSON', data);
    }

    logger.info('Updating Firebase database "%s"', settings.firebase.ref);
    if (dataObj) {
      firebaseRef.set(dataObj);
    }

    // logger.info('Writing to "%s"', AIRTABLE_WEBVR_SCENES_RELATIVE_TO_ROOT_PATH);
    // fs.createWriteStream(AIRTABLE_WEBVR_SCENES_PATH).write(data);
  }).catch(function (err) {
    // API call failed.
    logger.error(err);
    throw err;
  });
};
