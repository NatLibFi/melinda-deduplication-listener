// @flow
import type { Change } from 'types/change.flow';

export type OnChangeService = {
    handle: (change: Change) => Promise<any>
};
