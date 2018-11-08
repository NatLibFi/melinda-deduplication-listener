// @flow

import oracledb from 'oracledb';
import amqp from 'amqplib';

import OnChangeService from './onchange-service';
import DeduplicationCommandInterface from './deduplication-command-interface';
import AlephChangeListener from '@natlibfi/aleph-change-listener';
import {Utils as UtilsIndex, Types} from '@natlibfi/melinda-deduplication-common';

const {MelindaRecordService, CandidateQueueConnector, DataStoreConnector, Utils, Logger, createTimer} = UtilsIndex;

oracledb.outFormat = oracledb.OBJECT;

const Z106_BASES = Utils.readArrayEnvironmentVariable('Z106_BASES', ['FIN01']);
const Z115_BASE = Utils.readEnvironmentVariable('Z115_BASE', 'USR00');
const POLL_INTERVAL_MS = Utils.readEnvironmentVariable('POLL_INTERVAL_MS', 5000);
const CURSOR_FILE = Utils.readEnvironmentVariable('CURSOR_FILE', '.aleph-changelistener-cursors.json');
const Z106_STASH_PREFIX = Utils.readEnvironmentVariable('Z106_STASH_PREFIX', '.z106_stash');
const CHANGES_QUEUE_FILE = Utils.readEnvironmentVariable('CHANGES_QUEUE_FILE', '.aleph-changelistener-changesqueue');

const CANDIDATE_QUEUE_AMQP_URL = Utils.readEnvironmentVariable('CANDIDATE_QUEUE_AMQP_URL');
const ADMIN_INTERFACE_HTTP_PORT = Utils.readEnvironmentVariable('ADMIN_INTERFACE_HTTP_PORT', 3001);

const XServerUrl = Utils.readEnvironmentVariable('X_SERVER');
const melindaEndpoint = Utils.readEnvironmentVariable('MELINDA_API');
const datastoreAPI = Utils.readEnvironmentVariable('DATASTORE_API');

const dbConfig = {
	user: Utils.readEnvironmentVariable('ORACLE_USER'),
	password: Utils.readEnvironmentVariable('ORACLE_PASS'),
	connectString: Utils.readEnvironmentVariable('ORACLE_CONNECT_STRING')
};

const changeListenerOptions = {
	Z106Bases: Z106_BASES,
	Z115Base: Z115_BASE,
	pollIntervalMs: POLL_INTERVAL_MS,
	cursorSaveFile: CURSOR_FILE,
	Z106StashPrefix: Z106_STASH_PREFIX,
	changesQueueSaveFile: CHANGES_QUEUE_FILE,
	Logger: Logger
};

Logger.log('info', 'Starting Melinda change information processor');

const alephRecordService = MelindaRecordService.createMelindaRecordService(melindaEndpoint, XServerUrl);
const dataStoreConnector = DataStoreConnector.createDataStoreConnector(datastoreAPI);

process.on('unhandledRejection', error => {
	Logger.log('error', 'unhandledRejection', error.message, error.stack);
	process.exit(1);
});

const ONLINE = Utils.readEnvironmentVariable('ONLINE', '00:00-21:45, 22:30-24:00');
const service = createService();
const onlinePoller = createTimer(ONLINE, service, Logger);

process.on('SIGTERM', async () => {
	Logger.log('info', 'SIGTERM received. Stopping aleph changelistener');
	service.stop();
	clearInterval(onlinePoller);
});

function createService() {
	let alephChangeListener;
	let httpServer;
	let connection;
	let channel;
	let candidateQueueConnection;

	async function start() {
		Logger.log('info', 'Connecting to oracle');
		connection = await oracledb.getConnection(dbConfig);

		Logger.log('info', 'Connecting to message queue');
		candidateQueueConnection = await Utils.waitAndRetry(() => amqp.connect(CANDIDATE_QUEUE_AMQP_URL));
		channel = await candidateQueueConnection.createChannel();
		const candidateQueueService = CandidateQueueConnector.createCandidateQueueConnector(channel);
		const onChangeService = new OnChangeService(alephRecordService, dataStoreConnector, candidateQueueService);

		const deduplicationCommandInterface = DeduplicationCommandInterface.createDeduplicationCommandInterface(dataStoreConnector, onChangeService);

		httpServer = deduplicationCommandInterface.listen(ADMIN_INTERFACE_HTTP_PORT);

		Logger.log('info', 'Creating aleph changelistener');
		alephChangeListener = await AlephChangeListener.create(connection, changeListenerOptions, onChange);

		Logger.log('info', 'Starting aleph changelistener');
		alephChangeListener.start();

		Logger.log('info', 'Changelistener ready. Waiting for changes.');

		async function onChange(changes: Array<Types.Change>) {
			if (changes.length > 0) {
				Logger.log('info', `Handling ${changes.length} changes.`);
			}

			for (const change of changes) {
				try {
					switch (change.library) {
						case 'FIN01':
							await onChangeService.handle(change); // eslint-disable-line no-await-in-loop
							break;
						default:
							Logger.log('warn', `Could not find handler for base ${change.library}`);
					}
				} catch (error) {
					Logger.log('error', error.name, error.message, error.stack);

					if (error.code === 'ECONNREFUSED') {
						throw error;
					}
				}
			}
		}
	}

	async function stop() {
		await alephChangeListener.stop();
		httpServer.close();

		connection.release();
		await channel.close();
		await candidateQueueConnection.close();
		Logger.log('info', 'Connections released.');
	}

	return {start, stop};
}
