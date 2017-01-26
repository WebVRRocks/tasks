'use strict';

var concurrentTransform = require('concurrent-transform');
var firequeue = require('firequeue');
var streamUtil = require('stream-util');

var logger = require('./logger')(__filename);
var tasks = require('./tasks/');

var TASK_DATA = {
  airtable_webvr_rocks: [
    {
      name: 'webvr_scenes',
      params: {
        pageSize: 100
      }
    },
    {
      name: 'compat_reports',
      params: {
        pageSize: 100
      }
    }
  ]
};

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
  var taskNums = {};

  // Start queue engine.
  queue.start().pipe(
    loggerStream(function (result) {
      var task = result.task;
      var key = result.key;
      var state = result.state;
      return 'Task: ' + task + ', job: ' + key + ', state: ' + state;
    })
  );

  var startAirtableWebVRRocksJob = function (opts, delay) {
    if (!('airtable_webvr_rocks' in taskNums)) {
      taskNums.airtable_webvr_rocks = {};
    }
    if (!(opts.name in taskNums.airtable_webvr_rocks)) {
      taskNums.airtable_webvr_rocks[opts.name] = 0;
    }
    var taskName = 'tasks:airtable:webvr_rocks:' + taskNums.airtable_webvr_rocks[opts.name]++;

    delay = delay || '0s';

    // Create jobs and listen to job updates.
    var jobAirtableWebVRScenes = queue.jobs.push({
      task: taskName,
      data: {
        name: 'airtable:webvr_rocks',
        source: 'airtable',
        sheet: opts.name
      },
      delayed: delay
    });

    jobAirtableWebVRScenes.child('state')
      .on('value', function (s) {
        var state = s.val();
        logger.verbose('Job changed state: ' + state);
        if (state === 'completed') {
          return startAirtableWebVRRocksJob(
            opts,
            tasks.airtable_webvr_rocks.options.interval
          );
        }
      });

    var task = processTask(
      queue,
      taskName,
      tasks.airtable_webvr_rocks.run(opts),
      tasks.airtable_webvr_rocks.options
    );

    removeCompletedTask(queue, task);

    return task;
  };

  TASK_DATA.airtable_webvr_rocks.forEach(function (opts) {
    startAirtableWebVRRocksJob(opts);
  });

  // Remove failed jobs after 1 day.
  removeFailedJobs(queue, '30s');
};

module.exports.stop = function (queue) {
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

if (require.main === module) {
  init();
}
