/**
 * @licstart  The following is the entire license notice for the JavaScript code in this file. 
 *
 * Copyright 2017 University Of Helsinki (The National Library Of Finland)
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *     http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @licend  The above is the entire license notice
 * for the JavaScript code in this page.
*/

// @flow
import type { OnChangeService } from './onchange-service.flow';
import type { MelindaRecordService } from '@natlibfi/melinda-deduplication-common/types/melinda-record-service.flow';
import type { DataStoreConnector } from '@natlibfi/melinda-deduplication-common/types/datastore-connector.flow';
import type { Change } from '@natlibfi/melinda-deduplication-common/types/change.flow';
import type { CandidateQueueConnector } from '@natlibfi/melinda-deduplication-common/types/candidate-queue-connector.flow';

const logger = require('@natlibfi/melinda-deduplication-common/utils/logger');
const debug = require('debug')('changelistener-onchange');

function constructor(melindaRecordService: MelindaRecordService, dataStoreConnector: DataStoreConnector, candidateQueueConnector: CandidateQueueConnector): OnChangeService {

  async function handle(change) {
    // read from aleph
    logger.log('info', `Reading record (${change.library})${change.recordId} from Aleph`);
    const loadRecordOptions = {handle_deleted:1, no_rerouting: 1};
    const record = await melindaRecordService.loadRecord(change.library, change.recordId, loadRecordOptions);
    const { changeType, changeTimestamp } = getChangeMetadata(change);
    
    debug(`Record is:\n ${record.toString()}`);
    
    // save to datastore
    logger.log('info', `Saving record (${change.library})${change.recordId} to data store`);
    await dataStoreConnector.saveRecord(change.library, change.recordId, record, changeType, changeTimestamp);

    // read candidates from datastore
    logger.log('info', `Reading duplicate candidates for record (${change.library})${change.recordId} from data store`);
    const duplicateCandidates = await dataStoreConnector.getDuplicateCandidates(change.library, change.recordId);
    debug(`Candidates are:\n ${JSON.stringify(duplicateCandidates)}`);
    
    // push candidates to queue
    logger.log('info', `Pushing ${duplicateCandidates.length} duplicate candidates for record (${change.library})${change.recordId} to the candidate queue`);
    await candidateQueueConnector.pushCandidates(duplicateCandidates);
    
    logger.log('info', 'Change was handled succesfully');
    
    function getChangeMetadata(change: Change) {
      const Z106 = change.meta.Z106;
      const Z115 = change.meta.Z115;
      if (Z106 && Z115) {
        return { changeType: 'CONTENT_AND_METADATA', changeTimestamp: Z106.date.isSameOrAfter(Z115.date) ? Z106.date : Z115.date };
      } else if (Z106) {
        return { changeType: 'CONTENT', changeTimestamp: Z106.date };
      } else {
        return { changeType: 'METADATA', changeTimestamp: Z115.date };
      }
    }
  }

  async function triggerCandidateChecks(library, recordIdList) {
    logger.log('info', `Candidate check triggered for ${recordIdList.length} records in ${library}`);

    let amount = 0;
    for (const recordId of recordIdList) {
      const duplicateCandidates = await dataStoreConnector.getDuplicateCandidates(library, recordId);
      await candidateQueueConnector.pushCandidates(duplicateCandidates);
      amount = amount + duplicateCandidates.length;
    }
    logger.log('info', `${amount} Candidates pushed to queue for ${recordIdList.length} records in ${library}`);
        
  }

  return {
    handle,
    triggerCandidateChecks
  };
}

module.exports = constructor;
