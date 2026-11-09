// Annuaire Kiwi, fr : every page under /fr/annuaire/ (functions/api/_directory-page.js).
import { directoryPage } from '../../api/_directory-page.js';

export const onRequest = (context) => directoryPage(context, 'fr');
