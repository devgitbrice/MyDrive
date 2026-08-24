/**
 * Représente un tag
 */
export type Tag = {
  id: string;
  name: string;
  created_at: string;
};

/**
 * Représente une ligne de la table Supabase "MyDrive"
 * Supporte Scan, Doc, Mindmap, Table et Présentation
 */
export interface MyDriveItem {
  id: string;
  title: string;
  image_url: string;    // Vérifiez bien que c'est image_url
  image_path?: string;
  created_at: string;
  observation?: string;
  content?: string;
  type: string;
  doc_type?: string;
  parent_id?: string | null;
  /** Code 3 lettres personnalise. NULL/absent => code derive de l'id. */
  code?: string | null;
  /** Renseigne quand cet element est affiche depuis un miroir : id de la ligne alias. */
  alias_id?: string | null;
  /** true = cet emplacement est un miroir, l'original est range ailleurs. */
  is_mirror?: boolean;
  tags?: Tag[];
}

/**
 * Props communes pour les composants d'affichage MyDrive
 */
export type MyDriveListProps = {
  items: MyDriveItem[];
  allTags: Tag[];
};
