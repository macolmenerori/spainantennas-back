export type HTTPMethod = 'GET' | 'POST' | 'DELETE' | 'PUT';

// Max items in a comma-separated query filter list (?id=a,b,...)
export const MAX_FILTER_LIST_ITEMS = 100;

// Placements per insertMany call in POST /placement/import
export const IMPORT_BATCH_SIZE = 500;
