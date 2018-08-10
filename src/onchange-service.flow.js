// @flow
import {Types} from '@natlibfi/melinda-deduplication-common';

export type OnChangeService = {
    handle: (change: Types.Change) => Promise<any>
};
