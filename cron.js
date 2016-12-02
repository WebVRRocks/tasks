'use strict';

var path = require('path');

var concurrentTransform = require('concurrent-transform');
var firequeue = require('firequeue');
var streamUtil = require('stream-util');

var logger = require('./logger')(__filename);
var tasks = require('./tasks/');

if (firequeue.default) {
  firequeue = firequeue.default;
}

var loggerStream = function (fn) {
  return streamUtil.throughSync(function (data) {
    logger.verbose(fn(data));
    this.push(data);
 });
};

var init = module.exports.init = function () {
  var queue = firequeue.init('https://webvr-6345b.firebaseio.com/webvrrocks/queue');

  // Start queue engine.
  queue.start().pipe(
    loggerStream(function (result) {
      var task = result.task;
      var key = result.key;
      var state = result.state;
      return 'Task: ' + task + ', job: ' + key + ', state: ' + state;
    })
  );

  var taskNum = {
    airtable_webvr_scenes: 0
  };

  var startJobAirtableWebVRScenes = function (delay) {
    var taskName = 'tasks:airtable:webvr_scenes:' + taskNum.airtable_webvr_scenes++;

    delay = delay || '0s';

    // Create jobs and listen to job updates.
    var jobAirtableWebVRScenes = queue.jobs.push({
      task: taskName,
      data: {
        name: 'airtable:webvr_scenes',
        source: 'airtable',
        sheet: 'webvr_scenes'
      },
      delayed: delay
    });

    jobAirtableWebVRScenes.child('state')
      .on('value', function (s) {
        var state = s.val();
        logger.verbose('Job changed state: ' + state);
        if (state === 'completed') {
          return startJobAirtableWebVRScenes(
            tasks.airtable_webvr_scenes.options.interval
          );
        }
      });

    var task = processTask(
      queue,
      taskName,
      tasks.airtable_webvr_scenes.run,
      tasks.airtable_webvr_scenes.options
    );

    // removeCompletedTask(queue, task);

    return task;
  };

  startJobAirtableWebVRScenes();

  // Remove failed jobs after 1 day.
  // removeFailedJobs(queue, '1d');
};

var stop = module.exports.stop = function (queue) {
  return queue.stop().then(function () {
    logger.info('Queue stopped');
  });
};

var processTask = module.exports.processTask = function (queue, taskName, taskFunction, options) {
  options = options || {};

  var maxAttempts = options.maxAttempts;
  var backoff = options.backoff;
  var concurrency = options.concurrency;

  if (typeof maxAttempts === 'undefined') {
    maxAttempts = 2;
  }
  if (typeof backoff === 'undefined') {
    backoff = '2s';  // Wait 2s before retrying.
  }
  if (typeof concurrency === 'undefined') {
    concurrency = 1;
  }

  var work = queue.process(function (job) {
    var attempts = job.child('attempts').val() || 0;
    logger.info('Processing task "%s" (attempt #%d)', job.key(), (attempts + 1), job.val());
    return attempts < maxAttempts ? taskFunction() : Promise.reject();
  }, concurrency);

  if (concurrency > 1) {
    concurrency = concurrentTransform(work, concurrency);
  }

  var task = queue.read(taskName)
    .pipe(queue.maxAttempts(maxAttempts))
    .pipe(queue.backoff(backoff))  // Wait for some amount before retrying.
    .pipe(work);

  return task;
};

var removeCompletedTask = module.exports.removeCompletedTask = function (queue, task) {
  // Remove completed jobs.
  return streamUtil.concat(task)
    .pipe(queue.clean('completed'))
    .pipe(
      loggerStream(function (result) {
        var task = result.task;
        var key = result.key;
        var state = result.state;
        return 'Removed completed task: ' + task + ', job: ' + key + ', state: ' + state;
      })
    );
};

var removeFailedJobs = module.exports.removeFailedJobs = function (queue, timespan) {
  return queue.readJobsByStateWithDelay('failed', timespan)
    .on('data', function (snap) {
      return snap.ref().remove();
    });
};

init();
