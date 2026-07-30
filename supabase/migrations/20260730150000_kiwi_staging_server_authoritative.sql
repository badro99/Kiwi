-- Kiwi Supabase staging · le navigateur n'écrit plus rien lui-même.
--
-- La fondation précédente accordait `insert, update` au rôle `authenticated`
-- sur les ventes, les commandes, les clients, les cartes et les fiches. C'était
-- un CHANGEMENT DE MODÈLE DE CONFIANCE déguisé en portage.
--
-- Ce que fait Kiwi aujourd'hui sur D1 : le navigateur ne touche JAMAIS la base.
-- Il parle à une fonction Cloudflare, et c'est la fonction qui écrit — dans la
-- même requête que la trace. Annuler une vente passe par functions/api/… qui
-- pose la ligne `sale_audit` en même temps que le `void_ts`. Les deux gestes
-- sont indissociables parce qu'un seul code peut les poser.
--
-- Avec le `grant update on public.sales to authenticated`, ce lien se rompait :
-- un onglet portant le jeton du commerçant pouvait réécrire `amount` et
-- `void_ts` en direct, alors que `sale_audit` reste — à juste titre — fermé au
-- navigateur. Le chiffre d'affaires devenait modifiable SANS trace. Ce n'est
-- pas une permission trop large, c'est la seule invariante comptable du produit
-- qui tombe.
--
-- La règle retenue, et elle est explicite : les écritures appartiennent au
-- `service_role`, c'est-à-dire aux fonctions Cloudflare. RLS n'est pas la porte,
-- c'est le second tour de clé — ce qui reste vrai le jour où une politique est
-- mal écrite ou une clé publiable fuite.
--
-- Purement restrictif. Aucune table, aucune colonne, aucune donnée touchée.
-- Rejouable : chaque `drop … if exists` précède son éventuel remplaçant.

begin;

-- ── 1. Le rôle du membre compte enfin ──────────────────────────────────────
-- `account_users.role` existait, portait une contrainte CHECK, et n'était lu
-- par AUCUNE politique. Un membre 'staff' voyait donc exactement ce que voyait
-- le propriétaire. Deux lectures ne sont pas au même niveau : ce qu'on encaisse
-- aujourd'hui, tout le comptoir le voit ; le plan tarifaire, le MRR et les
-- modules activés de l'établissement, non.
create or replace function private.manages_merchant(target_merchant text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.merchant_config mc
    join public.account_users au on au.account_id = mc.account_id
    where mc.merchant = target_merchant
      and au.auth_user_id = auth.uid()
      and au.role in ('owner', 'manager')
  );
$$;

revoke all on function private.manages_merchant(text) from public;
grant execute on function private.manages_merchant(text) to authenticated, service_role;

-- ── 2. Les politiques d'écriture disparaissent ─────────────────────────────
-- Elles deviendraient de toute façon inatteignables une fois les `grant` levés
-- au point 4. Une politique qu'aucun droit ne peut plus déclencher est pire
-- qu'inutile : elle donne à lire un modèle d'accès qui n'existe plus.
drop policy if exists sales_insert_own on public.sales;
drop policy if exists sales_update_own on public.sales;
drop policy if exists menus_insert_own on public.menus;
drop policy if exists menus_update_own on public.menus;
drop policy if exists orders_insert_own on public.orders;
drop policy if exists orders_update_own on public.orders;
drop policy if exists catalogs_insert_own on public.catalogs;
drop policy if exists catalogs_update_own on public.catalogs;
drop policy if exists store_docs_insert_own on public.store_docs;
drop policy if exists store_docs_update_own on public.store_docs;
drop policy if exists clients_insert_own on public.clients;
drop policy if exists clients_update_own on public.clients;
drop policy if exists table_sessions_update_own on public.table_sessions;

-- ── 3. Les codes du personnel sortent du navigateur ────────────────────────
-- `staff_pins.pin` est un secret à quatre chiffres en clair. La politique
-- précédente le donnait à lire à quiconque appartenait à l'établissement —
-- `private.owns_merchant()` ne regardant pas le rôle, un membre 'staff'
-- récupérait la liste ENTIÈRE, y compris le code du patron. Un code qu'un
-- serveur peut lire n'authentifie plus le serveur.
--
-- Les codes ne quittent plus le serveur du tout : c'est functions/api/… qui les
-- compare, jamais le navigateur qui les reçoit.
drop policy if exists staff_pins_select_own on public.staff_pins;
revoke all on public.staff_pins from anon, authenticated;

-- ── 4. Plus aucune écriture navigateur, sur aucune table ───────────────────
-- Formulé en `all tables` plutôt qu'en liste : la table ajoutée le mois
-- prochain hérite du refus sans que personne ait à y penser. Une liste écrite à
-- la main vieillit mal, et c'est du côté permissif qu'elle vieillit.
revoke insert, update, delete, truncate, references, trigger
  on all tables in schema public from anon, authenticated;

-- ── 5. `merchant_config` passe en lecture encadrement ──────────────────────
-- Plan, MRR, ville, modules actifs : la fiche commerciale de l'établissement.
drop policy if exists merchant_config_select_own on public.merchant_config;
create policy merchant_config_select_own
  on public.merchant_config for select to authenticated
  using (private.manages_merchant(merchant));

-- ── 6. Les droits qui restent, énoncés en entier ───────────────────────────
-- Réaffirmés ici plutôt que supposés hérités : ce bloc est la réponse complète
-- à « que peut lire un navigateur ». `menus` pour anon est le seul accès
-- anonyme voulu — c'est la carte publiée, déjà servie telle quelle par
-- functions/api/menu.js au client qui scanne le QR de sa table.
grant select on public.menus to anon;
grant select on public.account_users, public.merchant_config,
  public.pairings, public.order_desk, public.sales, public.menus,
  public.orders, public.catalogs, public.store_docs, public.clients,
  public.table_sessions to authenticated;

grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;

commit;
