# Month-end dossier: legal-source review

Reviewed before implementation on 2026-10-04. This is an implementation boundary, not a legal opinion or certification.

## Current sources

- [DGI CGI 2026, official CRI copy](https://casainvest.ma/sites/default/files/2026-02/Code%20impo%CC%82ts%202026.pdf), articles 145, 146 and 211, printed pages 271-276 and 374. The [Ministry publication](https://www.finances.gov.ma/Publication/dgi/2025/CGI-2026-FR.pdf) timed out; its current edition was confirmed in the Ministry's publication listing. The complete DGI document was also downloaded from APSF for text inspection.
- [Law 9-88, AMMC legal collection](https://www.jurismaroc.com/recueil_ammc/dfr.php?id=115), cross-checked against the [AMDIE consolidated text including Law 44-03](https://amdie.gov.ma/wp-content/uploads/2024/01/Obligations-comptables-commercants.pdf). AMDIE direct download returned 403; indexed text was available. Relevant provisions: articles 1, 5, 9-11, 14 and 22.

## Design implications

CGI 145 addresses accounting records, inventories, continuous invoice references, identity, transaction detail and VAT presentation. Article 146 concerns supporting purchase documents; article 211 concerns preservation of accounting and supporting records, including electronic records. These justify explicit references, gap detection, inventory detail and absent-document warnings. They do not make a management PDF a statutory accounting file, electronic accounting system certification, tax return or compliant substitute for the underlying records.

Law 9-88 requires chronological transaction evidence, supporting references, inventory and annual financial statements. A monthly collection of POS receipts cannot establish annual accrual accounts, assets, liabilities or a certified result. Sales receipts are not automatically earned revenue, purchases are not automatically consumption, and cash movements are not automatically expenses.

No tax rate, legal threshold, filing date, tax liability or retention period is hard-coded into the feature. Frozen transaction/invoice tax information takes precedence. An owner may add dated tax configuration separately; an undated current receipt setting is never applied backwards. Missing tax/cost/supporting evidence remains unknown. Generation reads original ledgers only and neither closes cash sessions nor writes accounting transactions.

The required English notice is reproduced exactly in every PDF. The dossier is intended for review by the establishment and its qualified accountant, not filing.
