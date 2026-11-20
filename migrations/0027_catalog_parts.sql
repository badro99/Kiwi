-- 0027 · Un catalogue plus grand qu'une ligne D1 (2 Mo). Au-delà de 1,5 Mo, les
-- listes products / variants / moves d'un catalogue sont réparties dans cette
-- table, la ligne `catalogs` gardant une tête qui désigne la génération
-- courante (functions/api/_catalog-parts.js). Sans cette table, les petits
-- catalogues fonctionnent exactement comme avant ; seul l'enregistrement d'un
-- catalogue de plus de 1,5 Mo échoue (le client garde sa copie locale).
CREATE TABLE IF NOT EXISTS catalog_parts (
  merchant TEXT NOT NULL,       -- slugMerchant, comme catalogs.merchant
  gen      TEXT NOT NULL,       -- génération : celle que la tête désigne est la bonne
  part     INTEGER NOT NULL,    -- 0…n-1, dans l'ordre du document
  data     TEXT NOT NULL,       -- {"k":"products|variants|moves","items":[…]}
  PRIMARY KEY (merchant, gen, part)
);
