-- Code court à 3 lettres, modifiable, pour chaque dossier / fichier MyDrive.
--
-- La colonne est facultative : quand elle vaut NULL, l'application affiche un
-- code dérivé automatiquement de l'id. Dès qu'une valeur est saisie, elle
-- prend le dessus et devient le code officiel de l'élément.
--
-- A executer dans Supabase : SQL Editor > New query > coller > Run.

alter table "MyDrive"
  add column if not exists code text;

-- Format impose : exactement 3 lettres majuscules (AAA -> ZZZ).
alter table "MyDrive"
  drop constraint if exists mydrive_code_format;

alter table "MyDrive"
  add constraint mydrive_code_format
  check (code is null or code ~ '^[A-Z]{3}$');

-- Unicite des codes personnalises. Les NULL restent autorises en nombre
-- illimite : seuls les codes reellement saisis sont contraints.
create unique index if not exists mydrive_code_unique
  on "MyDrive" (code)
  where code is not null;

comment on column "MyDrive".code is
  'Code court a 3 lettres (A-Z) affiche dans MyDrive. NULL = code derive automatiquement de l''id.';
