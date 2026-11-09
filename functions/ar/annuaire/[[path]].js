// Annuaire Kiwi, ar : every page under /ar/annuaire/ (functions/api/_directory-page.js).
import { directoryPage } from '../../api/_directory-page.js';

export const onRequest = (context) => directoryPage(context, 'ar');
