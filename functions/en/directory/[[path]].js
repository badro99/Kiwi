// Annuaire Kiwi, en : every page under /en/directory/ (functions/api/_directory-page.js).
import { directoryPage } from '../../api/_directory-page.js';

export const onRequest = (context) => directoryPage(context, 'en');
