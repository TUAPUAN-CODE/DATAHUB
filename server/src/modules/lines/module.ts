import router from './routes';

/**
 * Header / line items (a trolley with several materials): the lines live in their own sheet and are linked with RowLinks
 * (role "contains"). Settings only point to another sheet, so nothing has to be re-mapped when the header sheet is copied.
 */
export default { router };
