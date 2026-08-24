-- Dossiers / fichiers miroirs.
--
-- Un miroir est une ligne « alias » : elle n'a pas de contenu propre, elle
-- pointe vers un element existant via target_id et se trouve dans un autre
-- dossier (parent_id). L'application resout l'alias a l'affichage, si bien
-- que l'original et ses miroirs sont le meme fichier : une modification
-- faite d'un cote est visible de l'autre, puisqu'il n'y a qu'un contenu.
--
-- A executer dans Supabase : SQL Editor > New query > coller > Run.

alter table "MyDrive"
  add column if not exists target_id uuid;

-- Supprimer l'original supprime automatiquement tous ses miroirs.
alter table "MyDrive"
  drop constraint if exists mydrive_target_fk;

alter table "MyDrive"
  add constraint mydrive_target_fk
  foreign key (target_id) references "MyDrive"(id) on delete cascade;

-- Un element ne peut pas se pointer lui-meme.
alter table "MyDrive"
  drop constraint if exists mydrive_target_not_self;

alter table "MyDrive"
  add constraint mydrive_target_not_self
  check (target_id is null or target_id <> id);

-- Un seul miroir d'un meme element par dossier.
create unique index if not exists mydrive_mirror_unique
  on "MyDrive" (target_id, parent_id)
  where target_id is not null;

create index if not exists mydrive_target_id_idx
  on "MyDrive" (target_id)
  where target_id is not null;

comment on column "MyDrive".target_id is
  'Non NULL = cette ligne est un miroir (type=alias) pointant vers l''element cible.';
