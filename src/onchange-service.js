// @flow
import type { OnChangeService } from './onchange-service.flow';
import type { AlephRecordService } from 'types/aleph-record-service.flow';
import type { DataStoreService } from 'types/data-store-service.flow';
import type { CandidateQueueService } from 'types/candidate-queue-service.flow';

const logger = require('melinda-deduplication-common/utils/logger');

function constructor(alephRecordService: AlephRecordService, dataStoreService: DataStoreService, candidateQueueService: CandidateQueueService): OnChangeService {

  async function handle(change) {

    // read from aleph
    logger.log('info', `Reading record (${change.library})${change.recordId} from Aleph`);
    const record = await alephRecordService.loadRecord(change.library, change.recordId);

    // save to datastore
    logger.log('info', `Saving record (${change.library})${change.recordId} to data store`);
    await dataStoreService.addRecord(change.library, change.recordId, record);

    // read candidates from datastore
    logger.log('info', `Reading duplicate candidates for record (${change.library})${change.recordId} from data store`);
    const duplicateCandidates = await dataStoreService.getDuplicateCandidates(change.library, change.recordId);

    // push candidates to queue
    logger.log('info', `Pushing duplicate candidates for record (${change.library})${change.recordId} to the candidate queue`);
    await candidateQueueService.pushCandidates(duplicateCandidates);
    
  }

  return {
    handle
  };
}

module.exports = constructor;
