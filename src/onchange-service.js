// @flow
import type { OnChangeService } from './onchange-service.flow';
import type { AlephRecordService } from 'types/aleph-record-service.flow';
import type { DataStoreConnector } from 'types/datastore-connector.flow';
import type { CandidateQueueConnector } from 'types/candidate-queue-connector.flow';

const logger = require('melinda-deduplication-common/utils/logger');
const debug = require('debug')('changelistener-onchange');

function constructor(alephRecordService: AlephRecordService, dataStoreConnector: DataStoreConnector, candidateQueueConnector: CandidateQueueConnector): OnChangeService {

  async function handle(change) {

    // read from aleph
    logger.log('info', `Reading record (${change.library})${change.recordId} from Aleph`);
    
    const record = await alephRecordService.loadRecord(change.library, change.recordId);
    debug(`Record is:\n ${record.toString()}`);
    

    // save to datastore
    logger.log('info', `Saving record (${change.library})${change.recordId} to data store`);
    await dataStoreConnector.saveRecord(change.library, change.recordId, record);

    // read candidates from datastore
    logger.log('info', `Reading duplicate candidates for record (${change.library})${change.recordId} from data store`);
    const duplicateCandidates = await dataStoreConnector.getDuplicateCandidates(change.library, change.recordId);
    debug(`Candidates are:\n ${JSON.stringify(duplicateCandidates)}`);
    
    // push candidates to queue
    logger.log('info', `Pushing duplicate candidates for record (${change.library})${change.recordId} to the candidate queue`);
    await candidateQueueConnector.pushCandidates(duplicateCandidates);
    
    logger.log('info', 'Change was handled succesfully');
  }

  return {
    handle
  };
}

module.exports = constructor;
