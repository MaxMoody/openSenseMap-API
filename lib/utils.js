'use strict';

const config = require('../config'),
  moment = require('moment'),
  restify = require('restify'),
  mongoose = require('mongoose'),
  request = require('request');

let Honeybadger = {
  notify: function () {}
};

/* eslint-disable global-require */
if (config.honeybadger_apikey && config.honeybadger_apikey !== '') {
  Honeybadger = require('honeybadger').configure({
    apiKey: config.honeybadger_apikey
  });
}
/* eslint-enable global-require */

/**
 * define for Datetype parameters
 * @apiDefine ISO8601Date A ISO8601 formatted timestamp. Will be parsed by MomentJS with enabled strict mode
 */

// time parsing function used throughout the api
const parseTimestamp = function (timestamp) {
  if (timestamp instanceof Date) {
    return moment.utc(timestamp);
  }

  return moment.utc(timestamp, moment.ISO_8601, true);
};

// http://stackoverflow.com/a/23453651
const sanitizeString = function (str) {
  str = str.replace(/[^a-z0-9áéíóúñü \.,_-]/gim, '');

  return str.trim();
};

// checks if the timestamp is not too far in the future
// returns true or false
const timeIsValid = function (timestamp) {
  const nowPlusOneMinute = moment.utc().add(1, 'minutes');
  if (!moment.isMoment(timestamp)) {
    timestamp = parseTimestamp(timestamp);
  }

  return timestamp.isValid() && nowPlusOneMinute.isAfter(timestamp);
};

// returns now as UTC JavaScript Date Object
const utcNowDate = function () {
  return moment.utc().toDate();
};

// function to parse timestamp from request parameter
// allows to specify a default in case of undefined
const parseTimeParameter = function (req, next, paramName, defaultValue) {
  const param = req.params[paramName];
  if (typeof param === 'undefined' || param.trim() === '') {
    return defaultValue;
  }

  const parsedTime = parseTimestamp(param);

  if (!parsedTime.isValid()) {
    return new restify.UnprocessableEntityError(`Invalid date format for parameter ${paramName}`);
  }

  return parsedTime;
};

const validateTimeParameters = function (toDate, fromDate) {
  const now = moment().utc();
  if (toDate.isAfter(now)) {
    return new restify.UnprocessableEntityError('Invalid time frame specified: to-date is in the future');
  }
  if (fromDate.isAfter(now)) {
    return new restify.UnprocessableEntityError('Invalid time frame specified: from-date is in the future');
  }

  if (fromDate.isAfter(toDate)) {
    return new restify.InvalidArgumentError(`Invalid time frame specified: from-date (${fromDate.format()}) is after to-date (${toDate.format()})`);
  }

  if (Math.abs(toDate.diff(fromDate, 'days')) > 31) {
    return new restify.InvalidArgumentError('Please choose a time frame up to 31 days maximum');
  }
};

// use this function to retry if a connection cannot be established immediately
const connectWithRetry = function (success) {
  return mongoose.connect(config.dbconnectionstring, {
    keepAlive: 1
  }, function (err) {
    if (err) {
      console.error('Failed to connect to mongo on startup - retrying in 5 sec', err);
      setTimeout(connectWithRetry, 5000, success);
    } else {
      success();
    }
  });
};

const postToSlack = function (text) {
  if (config.slack_url) {
    request.post({ url: config.slack_url, json: { text: text } });
  }
};


module.exports = {
  config,
  Honeybadger,
  parseTimestamp,
  timeIsValid,
  sanitizeString,
  utcNowDate,
  parseTimeParameter,
  validateTimeParameters,
  connectWithRetry,
  postToSlack,
};
