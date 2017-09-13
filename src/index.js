// @flow

import type { Change } from 'types/change.flow';

const logger = require('melinda-deduplication-common/utils/logger');
logger.log('info', 'Starting melinda-deduplication-listener');

const oracledb = require('oracledb');
oracledb.outFormat = oracledb.OBJECT;

const amqp = require('amqplib');

const AlephChangeListener = require('aleph-change-listener');
const MelindaRecordService = require('melinda-deduplication-common/utils/melinda-record-service');
const CandidateQueueConnector = require('melinda-deduplication-common/utils/candidate-queue-connector');
const DataStoreConnector = require('melinda-deduplication-common/utils/datastore-connector');

const utils = require('melinda-deduplication-common/utils/utils');
const OnChangeService = require('./onchange-service');
const DeduplicationCommandInterface = require('./deduplication-command-interface');

const Z106_BASES = utils.readArrayEnvironmentVariable('Z106_BASES', ['FIN01']);
const Z115_BASE = utils.readEnvironmentVariable('Z115_BASE', 'USR00');
const POLL_INTERVAL_MS = utils.readEnvironmentVariable('POLL_INTERVAL_MS', 5000);
const CURSOR_FILE = utils.readEnvironmentVariable('CURSOR_FILE', '.aleph-changelistener-cursors.json');
const Z106_STASH_PREFIX = utils.readEnvironmentVariable('Z106_STASH_PREFIX', '.z106_stash');
const CHANGES_QUEUE_FILE = utils.readEnvironmentVariable('CHANGES_QUEUE_FILE', '.aleph-changelistener-changesqueue');

const changeListenerOptions = {
  Z106Bases: Z106_BASES,
  Z115Base: Z115_BASE,
  pollIntervalMs: POLL_INTERVAL_MS,
  cursorSaveFile: CURSOR_FILE,
  Z106StashPrefix: Z106_STASH_PREFIX,
  changesQueueSaveFile: CHANGES_QUEUE_FILE,
  logger: logger
};

const dbConfig = {
  user: utils.readEnvironmentVariable('ORACLE_USER'),
  password: utils.readEnvironmentVariable('ORACLE_PASS'),
  connectString: utils.readEnvironmentVariable('ORACLE_CONNECT_STRING')
};

const CANDIDATE_QUEUE_AMQP_URL = utils.readEnvironmentVariable('CANDIDATE_QUEUE_AMQP_URL');
const ADMIN_INTERFACE_HTTP_PORT = utils.readEnvironmentVariable('ADMIN_INTERFACE_HTTP_PORT', 3001);

const XServerUrl = utils.readEnvironmentVariable('X_SERVER');
const melindaEndpoint = utils.readEnvironmentVariable('MELINDA_API', 'http://libtest1.csc.fi:8992/API');
const datastoreAPI = utils.readEnvironmentVariable('DATASTORE_API', 'http://localhost:8080');

const alephRecordService = MelindaRecordService.createMelindaRecordService(melindaEndpoint, XServerUrl);
const dataStoreConnector = DataStoreConnector.createDataStoreConnector(datastoreAPI);

process.on('unhandledRejection', error => {
  logger.log('error', 'unhandledRejection', error.message, error.stack);
  process.exit(1);
});

start().catch(error => { 
  logger.log('error', error.message, error);
  process.exit(1);
});

async function start() {
  logger.log('info', 'Connecting to oracle');
  const connection = await oracledb.getConnection(dbConfig);

  const candidateQueueConnection = await utils.waitAndRetry(() => amqp.connect(CANDIDATE_QUEUE_AMQP_URL));
  const channel = await candidateQueueConnection.createChannel();
  const candidateQueueService = CandidateQueueConnector.createCandidateQueueConnector(channel);
  const onChangeService = new OnChangeService(alephRecordService, dataStoreConnector, candidateQueueService);

  const deduplicationCommandInterface = DeduplicationCommandInterface.createDeduplicationCommandInterface(dataStoreConnector, onChange);

  await deduplicationCommandInterface.listen(ADMIN_INTERFACE_HTTP_PORT);

  logger.log('info', 'Creating aleph changelistener');
  const alephChangeListener = await AlephChangeListener.create(connection, changeListenerOptions, onChange);
  
  logger.log('info', 'Starting aleph changelistener');
  alephChangeListener.start();

  process.on('SIGTERM', () => {
    logger.log('info', 'SIGTERM received. Stopping aleph changelistener');
    alephChangeListener.stop();
  });
  
  logger.log('info', 'Changelistener ready. Waiting for changes.');
  
  async function onChange(changes: Array<Change>) {
    if (changes.length > 0) {
      logger.log('info', `Handling ${changes.length} changes.`);
    }

    for (const change of changes) {
      try {
        switch(change.library) {
          case 'FIN01': await onChangeService.handle(change); break;
          default: logger.log('warn', `Could not find handler for base ${change.library}`);
        }
      } catch(error) {
        
        logger.log('error', error.message, error);
        
        if (error.code === 'ECONNREFUSED') {
          throw error;
        }
      }
    }
  }
}
