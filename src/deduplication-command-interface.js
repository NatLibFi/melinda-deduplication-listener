import express from 'express';
import bodyParser from 'body-parser';
import HttpStatus from 'http-status-codes';
import _ from 'lodash';
import MarcRecord from 'marc-record-js';
import {Utils as UtilsIndex} from '@natlibfi/melinda-deduplication-common';

const {Logger} = UtilsIndex;

function createDeduplicationCommandInterface(dataStoreConnector, onChangeService) {
	const app = express();

	app.use(bodyParser.json({limit: '1000kb'}));
	app.use((error, req, res, next) => {
		if (error instanceof SyntaxError) {
			Logger.log('info', 'The client sent invalid json as request body:', error.message);
			res.sendStatus(error.statusCode);
		} else {
			next();
		}
	});

	app.post('/trigger-change/:base/:id', async (req, res) => {
		const base = req.params.base;
		const rawRecordId = req.params.id;
		const recordId = _.padStart(rawRecordId, 9, '0');

		Logger.log('info', 'trigger-change request for record', req.params);

		try {
			const result = await onChangeService.handle({library: base, recordId});
			res.send(result);
		} catch (error) {
			res.status(HttpStatus.BAD_REQUEST).send(error.message);
		}
	});

	app.post('/trigger-check/:base/:from/:to', async (req, res) => {
		const base = req.params.base;
		const recordFrom = parseInt(req.params.from, 10); // eslint-disable-line radix
		const recordTo = parseInt(req.params.to, 10); // eslint-disable-line radix

		const recordIdList = _.range(recordFrom, recordTo).map(id => _.padStart(id, 9, '0'));

		Logger.log('info', 'trigger-check request for records', req.params);

		try {
			onChangeService.triggerCandidateChecks(base, recordIdList);
			res.send('OK');
		} catch (error) {
			res.status(HttpStatus.BAD_REQUEST).send(error.message);
		}
	});

	app.post('/record/read/:base/:id', async (req, res) => {
		const base = req.params.base;
		const rawRecordId = req.params.id;
		const recordId = _.padStart(rawRecordId, 9, '0');

		Logger.log('info', 'read request for record', req.params);

		try {
			const record = await dataStoreConnector.loadRecord(base, recordId);
			res.send(record);
		} catch (error) {
			if (error.name === 'NOT_FOUND') {
				return res.sendStatus(HttpStatus.NOT_FOUND);
			}
			Logger.log('error', error);
			res.sendStatus(HttpStatus.INTERNAL_SERVER_ERROR);
		}
	});

	app.post('/record/add/:base/:id', async (req, res) => {
		const base = req.params.base;
		const rawRecordId = req.params.id;
		const recordId = _.padStart(rawRecordId, 9, '0');

		Logger.log('info', 'add request for record', req.params);

		try {
			const record = new MarcRecord(req.body);
			await dataStoreConnector.saveRecord(base, recordId, record);
			res.sendStatus(HttpStatus.OK);
		} catch (error) {
			if (error.name === 'NOT_FOUND') {
				return res.sendStatus(HttpStatus.NOT_FOUND);
			}
			if (error.name === 'INVALID_RECORD') {
				return res.status(HttpStatus.BAD_REQUEST).send(error.message);
			}
			Logger.log('error', error);
			res.sendStatus(HttpStatus.INTERNAL_SERVER_ERROR);
		}
	});

	app.post('/record/read/:base/:id/version/:timestamp', async (req, res) => {
		const base = req.params.base;
		const rawRecordId = req.params.id;
		const recordId = _.padStart(rawRecordId, 9, '0');
		const timestamp = parseInt(req.params.timestamp); // eslint-disable-line radix

		Logger.log('info', 'read request for specific version of record', req.params);

		try {
			const record = await dataStoreConnector.loadRecordByTimestamp(base, recordId, timestamp);
			res.send(record);
		} catch (error) {
			if (error.name === 'NOT_FOUND') {
				return res.sendStatus(HttpStatus.NOT_FOUND);
			}
			Logger.log('error', error);
			res.sendStatus(HttpStatus.INTERNAL_SERVER_ERROR);
		}
	});

	app.post('/record/history/:base/:id', async (req, res) => {
		const base = req.params.base;
		const rawRecordId = req.params.id;
		const recordId = _.padStart(rawRecordId, 9, '0');

		Logger.log('info', 'read request of history for record', req.params);

		try {
			const record = await dataStoreConnector.loadRecordHistory(base, recordId);
			res.send(record);
		} catch (error) {
			if (error.name === 'NOT_FOUND') {
				return res.sendStatus(HttpStatus.NOT_FOUND);
			}
			Logger.log('error', error);
			res.sendStatus(HttpStatus.INTERNAL_SERVER_ERROR);
		}
	});

	return app;
}

module.exports = {
	createDeduplicationCommandInterface
};
