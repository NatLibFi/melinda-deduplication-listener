// @flow

import type { Change } from 'types/change.flow';

const logger = require('melinda-deduplication-common/utils/logger');
logger.log('info', 'Starting melinda-deduplication-listener');

const oracledb = require('oracledb');
oracledb.outFormat = oracledb.OBJECT;
const _ = require('lodash');
const amqp = require('amqplib');

const AlephChangeListener = require('aleph-change-listener');
const MelindaRecordService = require('melinda-deduplication-common/utils/melinda-record-service');
const CandidateQueueService = require('melinda-deduplication-common/utils/candidate-queue-service');
const DataStoreService = require('melinda-deduplication-common/utils/data-store-service');

const utils = require('melinda-deduplication-common/utils/utils');
const OnChangeService = require('./onchange-service');

const Z106_BASES = utils.readArrayEnvironmentVariable('Z106_BASES', ['FIN01']);
const Z115_BASE = utils.readEnvironmentVariable('Z115Base', 'USR00');
const POLL_INTERVAL_MS = utils.readEnvironmentVariable('POLL_INTERVAL_MS', 5000);
const CURSOR_FILE = utils.readEnvironmentVariable('CURSOR_FILE', '.aleph-changelistener-cursors.json');
const Z106_STASH_PREFIX = utils.readEnvironmentVariable('Z106_STASH_PREFIX', '.z106_stash');

const options = {
  Z106Bases: Z106_BASES,
  Z115Base: Z115_BASE,
  pollIntervalMs: POLL_INTERVAL_MS,
  cursorSaveFile: CURSOR_FILE,
  Z106StashPrefix: Z106_STASH_PREFIX
};

const dbConfig = {
  user: utils.readEnvironmentVariable('ORACLE_USER'),
  password: utils.readEnvironmentVariable('ORACLE_PASS'),
  connectString: utils.readEnvironmentVariable('ORACLE_CONNECT_STRING')
};

const CANDIDATE_QUEUE_AMQP_HOST = utils.readEnvironmentVariable('CANDIDATE_QUEUE_AMQP_HOST');

const XServerUrl = utils.readEnvironmentVariable('X_SERVER');
const melindaEndpoint = utils.readEnvironmentVariable('MELINDA_API', 'http://libtest1.csc.fi:8992/API');
const datastoreAPI = utils.readEnvironmentVariable('DATASTORE_API', 'http://localhost:8080');

const alephRecordService = MelindaRecordService.createMelindaRecordService(melindaEndpoint, XServerUrl);
const dataStoreService = DataStoreService.createDataStoreService(datastoreAPI);

start().catch(error => { 
  logger.log('error', error.message, error);
});

async function start() {
  logger.log('info', 'Connecting to oracle');
  const connection = await oracledb.getConnection(dbConfig);

  const candidateQueueConnection = await amqp.connect(CANDIDATE_QUEUE_AMQP_HOST);
  const channel = await candidateQueueConnection.createChannel();
  const candidateQueueService = CandidateQueueService.createCandidateQueueService(channel);
  const onChangeService = new OnChangeService(alephRecordService, dataStoreService, candidateQueueService);


  logger.log('info', 'Creating aleph changelistener');
  const alephChangeListener = await AlephChangeListener.create(connection, options, onChange);
  
  logger.log('info', 'Starting aleph changelistener');
  alephChangeListener.start();
  
  logger.log('info', 'Waiting for changes');

  if (process.env.NODE_ENV == 'dev') {
    const randomChange = () => ({library: 'FIN01', recordId: _.padStart(10000 + Math.round(Math.random()*300000), 9, '0')});
    onChange([randomChange()]);
    setInterval(() => {
      onChange([randomChange()]);
    }, 5000);
  }

  function onChange(changes: Array<Change>) {
    logger.log('verbose', `Handling ${changes.length} changes.`);

    for (const change of changes) {
      try {
        switch(change.library) {
          case 'FIN01': return onChangeService.handle(change);
          default: return Promise.reject(new Error(`Could not find handler for base ${change.library}`));
        }
      } catch(error) {
        logger.log('error', error.message, error);
      }
    }
  }
}
