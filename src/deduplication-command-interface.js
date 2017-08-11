const express = require('express');
const bodyParser = require('body-parser');
const HttpStatus = require('http-status-codes');
const logger = require('melinda-deduplication-common/utils/logger');
const promisify = require('es6-promisify');
const _ = require('lodash');
const MarcRecord = require('marc-record-js');

function createDeduplicationCommandInterface(dataStoreService, onChange) {
  const app = express();
  const listen = promisify(app.listen, app);
  app.use(bodyParser.json({ limit: '1000kb' }));
  app.use((error, req, res, next) => {
    if (error instanceof SyntaxError) {
      logger.log('info', 'The client sent invalid json as request body:', error.message);
      res.sendStatus(error.statusCode);
    } else {
      next();
    }
  });

  app.post('/trigger-change/:base/:id', async function (req, res) {
    const base = req.params.base;
    const rawRecordId = req.params.id;
    const recordId = _.padStart(rawRecordId, 9, '0');

    logger.log('info', 'trigger-change request for record', req.params);

    try {
      const result = await onChange(Array.of({ library: base, recordId }));
      res.send(result);
    } catch(error) {
      res.status(HttpStatus.BAD_REQUEST).send(error.message);
    }
  });


  app.post('/record/read/:base/:id', async function (req, res) {
    const base = req.params.base;
    const rawRecordId = req.params.id;
    const recordId = _.padStart(rawRecordId, 9, '0');

    logger.log('info', 'read request for record', req.params);

    try {
      const record = await dataStoreService.loadRecord(base, recordId);
      res.send(record);
    } catch(error) {
      if (error.name === 'NOT_FOUND') {
        return res.sendStatus(HttpStatus.NOT_FOUND);
      }
      logger.log('error', error);
      res.sendStatus(HttpStatus.INTERNAL_SERVER_ERROR);
    }
  });

  app.post('/record/add/:base/:id', async function (req, res) {
    const base = req.params.base;
    const rawRecordId = req.params.id;
    const recordId = _.padStart(rawRecordId, 9, '0');

    logger.log('info', 'add request for record', req.params);

    try {
      const record = new MarcRecord(req.body);
      await dataStoreService.saveRecord(base, recordId, record);
      res.sendStatus(HttpStatus.OK);
    } catch(error) {
      if (error.name === 'NOT_FOUND') {
        return res.sendStatus(HttpStatus.NOT_FOUND);
      }
      logger.log('error', error);
      res.sendStatus(HttpStatus.INTERNAL_SERVER_ERROR);
    }
  });

  app.post('/record/read/:base/:id/version/:timestamp', async function (req, res) {
    const base = req.params.base;
    const rawRecordId = req.params.id;
    const recordId = _.padStart(rawRecordId, 9, '0');
    const timestamp = parseInt(req.params.timestamp);

    logger.log('info', 'read request for specific version of record', req.params);

    try {
      const record = await dataStoreService.loadRecordByTimestamp(base, recordId, timestamp);
      res.send(record);
    } catch(error) {
      if (error.name === 'NOT_FOUND') {
        return res.sendStatus(HttpStatus.NOT_FOUND);
      }
      logger.log('error', error);
      res.sendStatus(HttpStatus.INTERNAL_SERVER_ERROR);
    }
  });

  app.post('/record/history/:base/:id', async function (req, res) {
    const base = req.params.base;
    const rawRecordId = req.params.id;
    const recordId = _.padStart(rawRecordId, 9, '0');

    logger.log('info', 'read request of history for record', req.params);

    try {
      const record = await dataStoreService.loadRecordHistory(base, recordId);
      res.send(record);
    } catch(error) {
      if (error.name === 'NOT_FOUND') {
        return res.sendStatus(HttpStatus.NOT_FOUND);
      }
      logger.log('error', error);
      res.sendStatus(HttpStatus.INTERNAL_SERVER_ERROR);
    }
  });

  return {
    listen
  };
}

module.exports = {
  createDeduplicationCommandInterface
};
