var crypto = require('crypto');
var fs = require('fs');
var path = require('path');

var firebase = require('firebase');
var request = require('request-promise');

var logger = require('../logger')(__filename);

var settings = module.exports.settings = {
  database: {
    dir: process.argv[2] || path.join(__dirname, '..')
  },
  airtable: {
    appId: 'app08C2f6KbFHvaAA',
    bearerToken: 'keyMJq1gSRuwMTZ8r'
  },
  firebase: {
    enabled: false,  // Toggle to sync changes to Firebase database.
    credentials: {
      apiKey: 'AIzaSyCfMvL2DsldNeLy3LMC6gFrMD_HAFOLT-M',
      authDomain: 'webvr-6345b.firebaseapp.com',
      databaseURL: 'https://webvr-6345b.firebaseio.com',
      storageBucket: 'webvr-6345b.appspot.com',
      messagingSenderId: '689640619063'
    },
    ref: 'webvrrocks'
  }
};

var cache = {};
var firebaseApp;
var firebaseRef;
if (settings.firebase.enabled) {
  firebaseApp = firebase.initializeApp(settings.firebase.credentials);
  firebaseRef = firebaseApp.database().ref(settings.firebase.ref);
}

function md5 (str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

module.exports.options = {
  maxAttempts: 50,
  backoff: '10s',
  concurrency: 1,
  interval: '10s'
};

function requestAirtableList (opts, offset) {
  var tableName = opts.name;
  var formData = opts.params;
  var req = function (records, offset) {
    offset = offset || '';
    return request({
      uri: 'https://api.airtable.com/v0/' + settings.airtable.appId + '/' + tableName + '?offset=' + offset,
      json: true,
      queryParams: {offset: offset},
      body: formData,
      auth: {
        bearer: settings.airtable.bearerToken
      }
    }).then(function (data) {
      if (data.records && data.records.length) {
        records = records.concat(data.records);
      }
      if (data.offset) {
        return req(records, data.offset);
      } else {
        return records;
      }
    });
  };
  return req([]);
}

module.exports.run = function (opts) {
  var tableName = opts.name;
  return function () {
    return requestAirtableList(opts).then(function (records) {
      records = JSON.stringify(records);

      var hash = md5(records);

      var tablePath = path.resolve(opts.dir || settings.database.dir, 'data', tableName + '.json');
      var tablePathRelative = path.relative('..', tablePath);

      logger.info('Table "%s" has hash "%s"', tableName, hash);

      if (cache[tableName] === hash) {
        logger.info('Skipping "%s" (data unchanged)', tablePathRelative);
        return;
      }

      cache[tableName] = hash;

      logger.info('Writing to "%s"', tablePathRelative);
      fs.createWriteStream(tablePath).write(records);

      // firebaseRef.child(tableName).on('child_changed', function (snapshot) {
      //   snapshot.ref().off('child_changed');
      //   var val = snapshot.val();
      //   logger.info('Firebase database "%s" changed', settings.database.ref);
      //   logger.info('Writing to "%s"', tablePathRelative);
      //   fs.createWriteStream(tablePath).write(data);
      // });
      //
      // logger.info('Updating Firebase database "%s"', settings.firebase.ref);
      // if (dataObj) {
      //   firebaseRef.set(dataObj);
      // }
    }).catch(function (err) {
      // API call failed.
      logger.error(err);
      throw err;
    });
  };
};
