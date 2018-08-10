// @flow
import debug from 'debug';
import type {OnChangeService} from './onchange-service.flow';
import {Types, Utils as UtilsIndex} from '@natlibfi/melinda-deduplication-common';

const {Logger} = UtilsIndex;
const debugLog = debug('changelistener-onchange');

function constructor(melindaRecordService: Types.MelindaRecordService, dataStoreConnector: Types.DataStoreConnector, candidateQueueConnector: Types.CandidateQueueConnector): OnChangeService {
	async function handle(change) {
		// Read from aleph
		Logger.log('info', `Reading record (${change.library})${change.recordId} from Aleph`);
		const loadRecordOptions = {handle_deleted: 1, no_rerouting: 1}; // eslint-disable-line camelcase
		const record = await melindaRecordService.loadRecord(change.library, change.recordId, loadRecordOptions);

		debugLog(`Record is:\n ${record.toString()}`);

		// Save to datastore
		Logger.log('info', `Saving record (${change.library})${change.recordId} to data store`);
		await dataStoreConnector.saveRecord(change.library, change.recordId, record);

		// Read candidates from datastore
		Logger.log('info', `Reading duplicate candidates for record (${change.library})${change.recordId} from data store`);
		const duplicateCandidates = await dataStoreConnector.getDuplicateCandidates(change.library, change.recordId);
		debugLog(`Candidates are:\n ${JSON.stringify(duplicateCandidates)}`);

		// Push candidates to queue
		Logger.log('info', `Pushing ${duplicateCandidates.length} duplicate candidates for record (${change.library})${change.recordId} to the candidate queue`);
		await candidateQueueConnector.pushCandidates(duplicateCandidates);

		Logger.log('info', 'Change was handled succesfully');
	}

	async function triggerCandidateChecks(library, recordIdList) {
		Logger.log('info', `Candidate check triggered for ${recordIdList.length} records in ${library}`);

		let amount = 0;
		for (const recordId of recordIdList) {
			const duplicateCandidates = await dataStoreConnector.getDuplicateCandidates(library, recordId); // eslint-disable-line no-await-in-loop
			await candidateQueueConnector.pushCandidates(duplicateCandidates); // eslint-disable-line no-await-in-loop
			amount += duplicateCandidates.length;
		}
		Logger.log('info', `${amount} Candidates pushed to queue for ${recordIdList.length} records in ${library}`);
	}

	return {
		handle,
		triggerCandidateChecks
	};
}

module.exports = constructor;
