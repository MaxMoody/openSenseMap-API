'use strict';

const requestUtils = require('./requestUtils'),
  controllers = require('./controllers'),
  config = require('./utils').config;

const { usersController, statisticsController, boxesController } = controllers;

const initRoutes = function initRoutes (server) {
  // GET
  server.get({ path: config.basePath, version: '0.0.1' }, boxesController.findAllBoxes);
  // explanation for this route:
  // the regex matches strings like 'boxes.blabla' where 'blaba' could be 'geojson' or 'json'
  // this does not work anymore but I might consider reimplementing it..
  server.get({ path: /(boxes)\.([a-z]+)/, version: '0.1.0' }, boxesController.findAllBoxes);
  server.get({ path: `${config.basePath}/:boxId`, version: '0.0.1' }, boxesController.findBox);
  server.get({ path: `${config.basePath}/:boxId/sensors`, version: '0.0.1' }, boxesController.getMeasurements);
  server.get({ path: `${config.basePath}/:boxId/data/:sensorId`, version: '0.0.1' }, boxesController.getData);
  server.get({ path: `${config.basePath}/data`, version: '0.1.0' }, requestUtils.validateBboxParam, boxesController.getDataMulti);
  server.get({ path: '/stats', version: '0.1.0' }, statisticsController.getStatistics);
  server.get({ path: `${config.basePath}/:boxId/:sensorId/submitMeasurement/:value`, version: '0.0.1' }, boxesController.postNewMeasurement);

  // POST
  server.post({ path: config.basePath, version: '0.0.1' }, requestUtils.checkContentType, boxesController.postNewBox);
  server.post({ path: `${config.basePath}/:boxId/:sensorId`, version: '0.0.1' }, requestUtils.checkContentType, boxesController.postNewMeasurement);
  server.post({ path: `${config.basePath}/:boxId/data`, version: '0.1.0' }, boxesController.postNewMeasurements);
  server.post({ path: `${config.basePath}/data`, version: '0.1.0' }, requestUtils.validateBboxParam, boxesController.getDataMulti);

  // Secured (needs authorization through apikey)

  // attach a function to secured requests to validate api key and box id
  server.use(requestUtils.validateAuthenticationRequest);

  // GET
  server.get({ path: `${config.userPath}/:boxId`, version: '0.0.1' }, usersController.validApiKey);
  server.get({ path: `${config.basePath}/:boxId/script`, version: '0.1.0' }, boxesController.getScript);

  // PUT
  server.put({ path: `${config.basePath}/:boxId`, version: '0.1.0' }, requestUtils.checkContentType, boxesController.updateBox);

  // DELETE
  server.del({ path: `${config.basePath}/:boxId`, version: '0.1.0' }, boxesController.deleteBox);
};

module.exports = initRoutes;

