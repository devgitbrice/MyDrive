/**
 * Contenu des modules de la formation, dans l'ordre du programme.
 *
 * Chaque module devient un document MyDrive : `blocs` correspond aux blocs de
 * l'éditeur (ils seront joints par le séparateur ||BLOCK||), `resume` alimente
 * l'observation affichée sur la carte.
 */

export type Module = {
  titre: string;
  resume: string;
  blocs: string[];
};

/** Raccourci : titre + intro, objectifs, déroulé, puis une section libre. */
function module(
  titre: string,
  resume: string,
  intro: string,
  objectifs: string[],
  deroule: string[],
  pratique: { titre: string; contenu: string }
): Module {
  return {
    titre,
    resume,
    blocs: [
      `<h1>${titre}</h1><p>${intro}</p>`,
      `<h2>Objectifs</h2><ul>${objectifs.map((o) => `<li>${o}</li>`).join("")}</ul>`,
      `<h2>Déroulé</h2><ol>${deroule.map((d) => `<li>${d}</li>`).join("")}</ol>`,
      `<h2>${pratique.titre}</h2>${pratique.contenu}`,
      `<h2>Notes</h2><p><em>À compléter pendant la préparation du cours.</em></p>`,
    ],
  };
}

const COLAB = `<p>Support de travail : <a href="https://colab.research.google.com" target="_blank" rel="noopener noreferrer">Google Colab</a> — aucun installation locale, GPU gratuit selon disponibilité.</p>`;

export const COURS: Module[] = [
  // ---------------------------------------------------------------- Partie 1
  module(
    "Machine Learning avec test Google Colab",
    "Fondamentaux du ML et premier modèle entraîné en direct.",
    "Point de départ de la formation : ce qu'est réellement l'apprentissage automatique, en quoi il diffère d'un programme classique, et à quoi ressemble un premier modèle entraîné de bout en bout.",
    [
      "Distinguer programmation classique et apprentissage à partir de données",
      "Comprendre les trois familles : supervisé, non supervisé, par renforcement",
      "Savoir lire les métriques de base (accuracy, précision, rappel)",
      "Entraîner et évaluer un premier modèle soi-même",
    ],
    [
      "Le vocabulaire : données, features, labels, modèle, entraînement, inférence",
      "Le cycle de vie : préparation des données → entraînement → évaluation → prédiction",
      "Surapprentissage et sous-apprentissage : les reconnaître sur une courbe",
      "Découpage train / validation / test et pourquoi il est non négociable",
    ],
    {
      titre: "Test en direct",
      contenu:
        COLAB +
        `<p>Exercice : classification sur un jeu de données tabulaire simple avec scikit-learn.</p><pre><code>from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2)
model = RandomForestClassifier().fit(X_train, y_train)
print(classification_report(y_test, model.predict(X_test)))</code></pre>`,
    }
  ),

  module(
    "Deep Learning expliqué avec test",
    "Réseaux de neurones : intuition, architecture et entraînement.",
    "Ce qui change quand on passe du machine learning classique aux réseaux de neurones : la capacité à apprendre les représentations elles-mêmes, au prix de plus de données et de calcul.",
    [
      "Comprendre neurone, couche, fonction d'activation et poids",
      "Saisir l'intuition de la rétropropagation sans le formalisme",
      "Identifier quand le deep learning est pertinent — et quand il ne l'est pas",
      "Construire et entraîner un petit réseau",
    ],
    [
      "Du perceptron au réseau multicouche",
      "Descente de gradient et rétropropagation : l'idée en images",
      "Les grandes familles : CNN pour l'image, RNN puis Transformers pour les séquences",
      "Le coût réel : données, GPU, temps, énergie",
    ],
    {
      titre: "Test en direct",
      contenu:
        COLAB +
        `<p>Exercice : un réseau dense sur un jeu d'images simple, puis observation de l'effet du nombre de couches et du taux d'apprentissage sur la courbe de perte.</p>`,
    }
  ),

  module(
    "NLP expliqué avec test Google Colab",
    "Du texte brut aux embeddings, jusqu'aux modèles de langue.",
    "Comment une machine traite du texte : la chaîne qui va de la chaîne de caractères au vecteur numérique, puis aux modèles de langue actuels.",
    [
      "Comprendre tokenisation, vocabulaire et embeddings",
      "Saisir ce qu'apporte l'attention et l'architecture Transformer",
      "Mesurer la similarité entre deux textes",
      "Faire tourner un modèle de langue depuis un notebook",
    ],
    [
      "Prétraitement historique (sacs de mots, TF-IDF) et ses limites",
      "Embeddings : représenter le sens dans un espace vectoriel",
      "Le mécanisme d'attention, brique des Transformers",
      "Les tâches classiques : classification, extraction, résumé, génération",
    ],
    {
      titre: "Test en direct",
      contenu:
        COLAB +
        `<p>Exercice : calculer des embeddings de phrases, mesurer leur similarité cosinus, et constater que la proximité vectorielle correspond à la proximité de sens. Base de la partie RAG plus loin.</p>`,
    }
  ),

  module(
    "Les différentes phases de développement d'une IA générative",
    "Vue d'ensemble : de la collecte de données au modèle en production.",
    "Le panorama complet avant d'entrer dans le détail. Chaque phase de ce module correspond à un focus dédié dans les modules suivants.",
    [
      "Situer chaque phase dans la chaîne complète",
      "Comprendre ce qui coûte cher, et où",
      "Savoir à quelle phase se situe un besoin métier donné",
    ],
    [
      "Collecte et curation des données",
      "Pré-entraînement : le gros du calcul",
      "Post-entraînement : finetuning, alignement, préférences humaines",
      "Évaluation et garde-fous",
      "Déploiement, supervision et itération",
    ],
    {
      titre: "À retenir",
      contenu: `<p>La plupart des projets d'entreprise ne touchent jamais au pré-entraînement : ils se jouent sur le prompt, le RAG et, plus rarement, le finetuning. Les trois modules qui suivent détaillent ces leviers dans l'ordre de coût croissant.</p>`,
    }
  ),

  module(
    "Focus sur l'entraînement",
    "Ce qui se passe pendant le pré-entraînement d'un grand modèle.",
    "Le pré-entraînement est la phase la plus lourde et la moins accessible. La comprendre reste utile : elle explique les forces et les angles morts des modèles qu'on utilise ensuite.",
    [
      "Comprendre l'objectif d'entraînement d'un modèle de langue",
      "Situer les ordres de grandeur : données, calcul, durée",
      "Comprendre pourquoi un modèle « sait » certaines choses et pas d'autres",
    ],
    [
      "Prédiction du token suivant : un objectif simple, des effets complexes",
      "Corpus : volume, qualité, filtrage, questions de droits",
      "Lois d'échelle : plus de données, plus de paramètres, plus de calcul",
      "Date de coupure des connaissances et ses conséquences pratiques",
    ],
    {
      titre: "Discussion",
      contenu: `<p>Pourquoi une entreprise n'a presque jamais intérêt à pré-entraîner son propre modèle — et les rares cas où la question se pose vraiment (domaine très spécifique, contraintes de souveraineté).</p>`,
    }
  ),

  module(
    "Focus sur le finetuning",
    "Spécialiser un modèle existant sur ses propres données.",
    "Le finetuning ajuste un modèle déjà entraîné pour une tâche ou un style précis. Puissant, mais souvent choisi trop vite : ce module aide à décider s'il est vraiment nécessaire.",
    [
      "Distinguer finetuning complet, LoRA et adaptateurs légers",
      "Savoir constituer un jeu de données d'entraînement propre",
      "Arbitrer entre finetuning, RAG et prompt",
    ],
    [
      "Quand le finetuning est justifié : format de sortie, ton, tâche répétitive",
      "Quand il ne l'est pas : ajouter des connaissances factuelles (préférer le RAG)",
      "Préparer les données : quantité, équilibre, qualité des exemples",
      "Évaluer le modèle finetuné contre le modèle de base",
      "Oubli catastrophique et régression : les surveiller",
    ],
    {
      titre: "Atelier",
      contenu: `<p>Construire un petit jeu d'exemples au format instruction / réponse, lancer un finetuning léger (LoRA), puis comparer les sorties avant / après sur un jeu de test tenu à l'écart.</p>`,
    }
  ),

  module(
    "Focus sur le prompt",
    "Le levier le moins cher et le plus sous-exploité.",
    "Avant de finetuner ou de monter un RAG, l'essentiel des gains vient souvent d'un prompt bien construit. Ce module traite le prompt comme une discipline d'ingénierie, pas comme une formule magique.",
    [
      "Structurer un prompt : rôle, contexte, tâche, format attendu, contraintes",
      "Utiliser les exemples (few-shot) à bon escient",
      "Fiabiliser les sorties structurées",
      "Mettre en place une évaluation de ses prompts",
    ],
    [
      "Anatomie d'un prompt efficace",
      "Zero-shot, few-shot, décomposition de la tâche",
      "Imposer un format de sortie exploitable par du code",
      "Itérer méthodiquement : jeu de tests, comparaison, non-régression",
      "Les pièges : instructions contradictoires, contexte trop long, sur-spécification",
    ],
    {
      titre: "Atelier",
      contenu: `<p>Prendre une tâche métier réelle, écrire trois variantes de prompt, les évaluer sur dix cas de test, puis mesurer l'écart. C'est le module le plus directement rentable de la formation.</p>`,
    }
  ),

  module(
    "Focus sur les RAG",
    "Donner à un modèle accès à vos propres documents.",
    "Retrieval-Augmented Generation : au lieu d'entraîner le modèle sur vos données, on lui fournit les bons extraits au moment de la question. C'est la réponse standard au besoin « que l'IA connaisse mes documents ».",
    [
      "Comprendre la chaîne complète : découpage, indexation, recherche, génération",
      "Choisir une stratégie de découpage adaptée à ses documents",
      "Évaluer la qualité d'un RAG (et pas seulement celle du modèle)",
    ],
    [
      "Pourquoi le RAG plutôt que le finetuning pour des connaissances factuelles",
      "Découpage : taille des morceaux, recouvrement, respect de la structure",
      "Base vectorielle : indexation et recherche par similarité",
      "Recherche hybride : vectoriel + mots-clés",
      "Citer ses sources et limiter les réponses inventées",
    ],
    {
      titre: "Atelier",
      contenu: `<p>Monter un RAG complet sur un corpus de documents internes, puis diagnostiquer les erreurs : viennent-elles de la recherche (mauvais extraits) ou de la génération (bons extraits, mauvaise réponse) ? La distinction est la clé du débogage.</p>`,
    }
  ),

  module(
    "Diffuser son modèle d'IA avec son API — FastAPI",
    "Exposer un modèle derrière une API propre et documentée.",
    "Un modèle qui tourne dans un notebook n'est pas un produit. Ce module couvre le passage à une API utilisable par d'autres applications.",
    [
      "Exposer un modèle derrière un endpoint HTTP",
      "Valider les entrées et gérer les erreurs proprement",
      "Comprendre les contraintes de production : latence, charge, coût",
    ],
    [
      "Pourquoi FastAPI : validation automatique, documentation générée, asynchrone",
      "Structurer l'API : schémas d'entrée / sortie, codes d'erreur",
      "Chargement du modèle au démarrage plutôt qu'à chaque requête",
      "Streaming des réponses pour les modèles génératifs",
      "Authentification, quotas, journalisation",
      "Conteneurisation et déploiement",
    ],
    {
      titre: "Atelier",
      contenu:
        `<p>Documentation : <a href="https://fastapi.tiangolo.com" target="_blank" rel="noopener noreferrer">fastapi.tiangolo.com</a></p><pre><code>from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class Requete(BaseModel):
    texte: str

@app.post("/predire")
def predire(r: Requete):
    return {"resultat": modele(r.texte)}</code></pre>`,
    }
  ),

  // ---------------------------------------------------------------- Partie 2
  module(
    "Introduction au vibe coding",
    "Développer en dialoguant avec une IA : principes et limites.",
    "Le vibe coding consiste à décrire ce qu'on veut plutôt qu'à écrire chaque ligne. Ce module pose ce que la pratique change réellement, et ce qu'elle ne dispense pas de savoir.",
    [
      "Comprendre le déplacement : de l'écriture vers la spécification et la revue",
      "Savoir formuler une demande qui produit du code juste",
      "Identifier les tâches où l'approche excelle et celles où elle échoue",
    ],
    [
      "D'où vient le terme, et ce qu'il recouvre en pratique",
      "Le cycle : intention → génération → vérification → correction",
      "Ce qui reste indispensable : lire du code, tester, comprendre l'architecture",
      "Les risques : code plausible mais faux, dette invisible, dépendance",
    ],
    {
      titre: "Discussion",
      contenu: `<p>La question centrale de toute la partie 2 : qu'est-ce qu'on garde sous contrôle humain ? Réponse défendue dans cette formation — l'architecture et les décisions, pas la frappe.</p>`,
    }
  ),

  module(
    "Les différents outils de vibe coding du marché",
    "Panorama comparatif des outils et de leurs usages.",
    "Tour d'horizon des familles d'outils, avec ce qui les distingue vraiment : l'endroit où ils s'exécutent et l'étendue de ce qu'ils peuvent toucher.",
    [
      "Classer les outils par famille plutôt que par marque",
      "Choisir selon le contexte : prototype, code existant, production",
      "Comprendre les implications de confidentialité",
    ],
    [
      "Complétion dans l'éditeur : suggestion ligne à ligne",
      "Agents en terminal : accès aux fichiers, aux commandes, au dépôt",
      "Plateformes web : de la description à l'application déployée",
      "Critères de choix : accès au code existant, exécution des tests, revue des diffs",
    ],
    {
      titre: "Grille de comparaison",
      contenu: `<p>Tableau à remplir ensemble pendant le cours : outil, périmètre d'accès, gestion du contexte projet, intégration Git, coût, confidentialité des données.</p>`,
    }
  ),

  module(
    "Introduction au vibe coding avec Claude Code",
    "Prise en main de l'agent en terminal.",
    "Claude Code travaille directement dans un dépôt : il lit les fichiers, exécute des commandes, propose des modifications. Ce module couvre la prise en main et les bonnes habitudes.",
    [
      "Installer et lancer l'outil sur un projet existant",
      "Formuler des demandes qui aboutissent du premier coup",
      "Contrôler ce qui est modifié avant de valider",
    ],
    [
      "Installation et premier lancement",
      "Donner du contexte projet durable (fichier de consignes à la racine)",
      "Le cycle de travail : demander, lire le diff, tester, committer",
      "Gestion des permissions : ce que l'agent peut exécuter",
      "Travailler par branches pour garder une porte de sortie",
    ],
    {
      titre: "Atelier",
      contenu: `<p>Reprendre un projet existant, demander une petite fonctionnalité, relire le diff ligne à ligne, lancer les tests, committer. L'objectif est d'installer le réflexe de revue — la partie que l'IA ne fait pas à votre place.</p>`,
    }
  ),

  module(
    "Création d'une web app",
    "Du dossier vide à l'application qui tourne.",
    "Le fil rouge de la partie 2 : construire une application web complète, qui servira de support aux modules d'intégration suivants.",
    [
      "Choisir une stack et comprendre pourquoi",
      "Poser une structure de projet qui tienne dans la durée",
      "Déployer une première version en ligne",
    ],
    [
      "Cadrer le besoin avant d'écrire quoi que ce soit",
      "Choix de la stack : rendu serveur, client, ou mixte",
      "Structure des dossiers, conventions, découpage en composants",
      "Premier déploiement, dès le premier jour",
      "Itérer par petites étapes vérifiables",
    ],
    {
      titre: "Projet fil rouge",
      contenu: `<p>L'application construite ici sert de base aux modules suivants : on y branchera successivement une base de données, une IA, puis des services tiers.</p>`,
    }
  ),

  module(
    "Intégration d'API de base de données",
    "Persister les données de l'application.",
    "Une application sans persistance ne va pas loin. Ce module branche une base de données et pose les questions de sécurité qui vont avec.",
    [
      "Connecter une base et modéliser ses données",
      "Effectuer les opérations de lecture / écriture depuis l'application",
      "Protéger l'accès aux données",
    ],
    [
      "Choisir : base gérée ou auto-hébergée",
      "Modélisation : tables, relations, index",
      "Variables d'environnement et clés : ce qui est public, ce qui ne l'est jamais",
      "Règles d'accès et cloisonnement par utilisateur",
      "Migrations : faire évoluer le schéma sans casser l'existant",
    ],
    {
      titre: "Atelier",
      contenu: `<p>Ajouter une table au projet fil rouge, écrire la migration, brancher lecture et écriture, puis vérifier qu'un utilisateur ne peut pas atteindre les données d'un autre.</p>`,
    }
  ),

  module(
    "Intégration d'API d'IA",
    "Brancher un modèle dans son application.",
    "Passer de « l'IA dans un chat » à « l'IA dans mon produit » : appel serveur, streaming, gestion des coûts et des erreurs.",
    [
      "Appeler un modèle depuis le back-end en sécurité",
      "Streamer une réponse vers l'interface",
      "Maîtriser coûts, latence et échecs",
    ],
    [
      "Toujours côté serveur : une clé d'API ne part jamais dans le navigateur",
      "Requête, réponse, et affichage progressif",
      "Gestion des erreurs : limites de débit, dépassements, indisponibilité",
      "Suivi de la consommation et plafonds",
      "Mise en cache de ce qui est stable",
    ],
    {
      titre: "Atelier",
      contenu: `<p>Ajouter une fonctionnalité d'IA au projet fil rouge, avec streaming à l'écran et repli propre en cas d'erreur — le repli fait partie de la fonctionnalité, pas d'un raffinement ultérieur.</p>`,
    }
  ),

  module(
    "Intégration d'API supplémentaires",
    "Connecter des services tiers : paiement, e-mail, stockage, données.",
    "Toute application finit par dépendre de services externes. Ce module traite l'intégration comme un motif répétable plutôt que comme une série de cas particuliers.",
    [
      "Lire une documentation d'API et l'intégrer proprement",
      "Gérer authentification, quotas et pannes du service tiers",
      "Isoler les dépendances externes du reste du code",
    ],
    [
      "Modes d'authentification : clé, OAuth, jeton signé",
      "Encapsuler chaque service dans un module dédié",
      "Webhooks : recevoir des événements et les vérifier",
      "Réessais, temporisation, circuit ouvert",
      "Que faire quand le service tiers tombe",
    ],
    {
      titre: "Atelier",
      contenu: `<p>Intégrer un service au choix (envoi d'e-mail ou stockage de fichiers) en respectant la règle du module : le reste de l'application ne doit jamais appeler le service directement.</p>`,
    }
  ),

  module(
    "Adaptation d'une app web sur iPhone",
    "Rendre l'application utilisable et installable sur iOS.",
    "Une application web bien conçue peut s'installer sur l'écran d'accueil et se comporter comme une application native. Ce module traite les spécificités iOS.",
    [
      "Rendre l'interface confortable au doigt",
      "Rendre l'application installable depuis Safari",
      "Connaître les limites d'iOS et les contourner",
    ],
    [
      "Adaptation de l'affichage : points de rupture, zones sûres, encoche",
      "Cibles tactiles, gestes, défilement",
      "Manifeste et icônes pour l'installation sur l'écran d'accueil",
      "Ce qu'iOS restreint (notifications, arrière-plan) et les contournements",
      "Tester sur un vrai appareil, pas seulement dans le simulateur",
    ],
    {
      titre: "Atelier",
      contenu: `<p>Rendre le projet fil rouge installable, l'ajouter à l'écran d'accueil d'un iPhone et parcourir chaque écran au doigt. Les défauts d'ergonomie tactile ne se voient pas à la souris.</p>`,
    }
  ),

  module(
    "Adaptation d'une app web sur Android",
    "Installation, notifications et distribution côté Android.",
    "Android est plus permissif qu'iOS pour les applications web. Ce module exploite cette marge et traite la mise sur le Play Store.",
    [
      "Rendre l'application installable sur Android",
      "Mettre en place les notifications",
      "Connaître la voie vers le Play Store",
    ],
    [
      "Différences concrètes avec iOS",
      "Invite d'installation et comportement en plein écran",
      "Notifications : permission, service worker, envoi",
      "Mode hors ligne et mise en cache",
      "Empaqueter une application web pour le Play Store",
    ],
    {
      titre: "Atelier",
      contenu: `<p>Installer le projet fil rouge sur un appareil Android, activer une notification de test, puis couper le réseau pour vérifier le comportement hors ligne.</p>`,
    }
  ),

  module(
    "Focus : vibe coding pour la structure vs pour le contenu",
    "Où déléguer, où garder la main — le module de synthèse.",
    "Module de recul sur toute la partie 2. La distinction structure / contenu est la ligne de partage la plus utile pour savoir quoi confier à l'IA.",
    [
      "Distinguer décisions structurantes et travail de remplissage",
      "Adapter son niveau de contrôle à l'enjeu",
      "Éviter la dette technique invisible",
    ],
    [
      "Structure : schéma de données, découpage, contrats d'interface, sécurité — décisions coûteuses à défaire, à garder sous contrôle humain",
      "Contenu : composants d'interface, formulaires, transformations, tests, migrations — répétitif, vérifiable, délégable",
      "Le vrai critère : le coût de l'erreur et la facilité de la détecter",
      "Relire ce qui touche à la sécurité et aux données, systématiquement",
    ],
    {
      titre: "Synthèse",
      contenu: `<p>Reprendre le projet fil rouge et classer chaque décision prise depuis le module « Création d'une web app » : structure ou contenu ? Qu'aurait-il fallu relire de plus près ?</p>`,
    }
  ),

  // ---------------------------------------------------------------- Partie 3
  module(
    "Introduction à l'open source / open weight",
    "Ce que « ouvert » veut dire pour un modèle d'IA.",
    "Le vocabulaire est trompeur : la plupart des modèles dits open source sont en réalité open weight. La distinction a des conséquences juridiques et pratiques.",
    [
      "Distinguer open source, open weight et poids diffusés sous licence restrictive",
      "Lire une licence de modèle avant de l'utiliser en production",
      "Arbitrer entre modèle fermé par API et modèle ouvert auto-hébergé",
    ],
    [
      "Les degrés d'ouverture : code, poids, données d'entraînement, recette",
      "Licences courantes et leurs restrictions réelles",
      "Avantages du modèle ouvert : contrôle, confidentialité, coût à l'usage, pas de dépendance",
      "Inconvénients : infrastructure, maintenance, écart de performance selon les tâches",
    ],
    {
      titre: "Grille de décision",
      contenu: `<p>Construire ensemble une grille : sensibilité des données, volume de requêtes, budget, compétences internes, exigence de qualité. Elle servira pour les modules suivants.</p>`,
    }
  ),

  module(
    "Présentation de Hugging Face",
    "La plateforme centrale de l'écosystème ouvert.",
    "Hugging Face héberge modèles, jeux de données et démonstrations. Savoir s'y repérer est un prérequis à toute la partie 3.",
    [
      "Trouver et évaluer un modèle sur la plateforme",
      "Charger un modèle depuis du code",
      "Publier son propre modèle ou jeu de données",
    ],
    [
      "Le Hub : modèles, jeux de données, Spaces",
      "Lire une fiche de modèle : licence, taille, langues, limites annoncées",
      "La bibliothèque transformers : charger et exécuter un modèle",
      "Formats de poids et quantisation : quel fichier prendre",
      "Publier : versionnage, fiche de modèle, mode privé",
    ],
    {
      titre: "Atelier",
      contenu: `<p>Site : <a href="https://huggingface.co" target="_blank" rel="noopener noreferrer">huggingface.co</a></p><p>Choisir un modèle de petite taille, lire sa fiche en entier, le charger et le faire tourner dans un notebook.</p>`,
    }
  ),

  module(
    "Open source avec Llama",
    "La famille Llama : caractéristiques et mise en œuvre.",
    "Llama, développé par Meta, est l'une des familles de modèles ouverts les plus répandues et l'écosystème d'outils autour est le plus fourni.",
    [
      "Connaître les variantes et les tailles disponibles",
      "Comprendre les conditions de la licence",
      "Faire tourner un modèle Llama en local",
    ],
    [
      "Historique et positionnement de la famille",
      "Choisir sa taille selon le matériel disponible",
      "Points d'attention de la licence pour un usage commercial",
      "Format de prompt attendu par les versions instruct",
      "Outils de l'écosystème",
    ],
    {
      titre: "Atelier",
      contenu: `<p>Faire tourner un modèle Llama de petite taille en local, mesurer la vitesse de génération, puis comparer avec une variante plus quantisée.</p>`,
    }
  ),

  module(
    "Open source avec Qwen",
    "La famille Qwen : forces et cas d'usage.",
    "Qwen, développé par Alibaba, est l'autre grande famille ouverte, souvent citée pour ses performances multilingues et ses variantes spécialisées.",
    [
      "Situer Qwen par rapport à Llama",
      "Identifier les variantes spécialisées disponibles",
      "Choisir entre les deux familles selon le besoin",
    ],
    [
      "Panorama de la famille et de ses tailles",
      "Points forts constatés, notamment en multilingue",
      "Variantes spécialisées (code, vision, raisonnement)",
      "Conditions de licence",
      "Comparaison directe avec Llama sur une même tâche",
    ],
    {
      titre: "Atelier",
      contenu: `<p>Soumettre la même série de requêtes à un modèle Llama et à un modèle Qwen de taille comparable, puis comparer sorties, vitesse et consommation mémoire.</p>`,
    }
  ),

  module(
    "L'open source sur son ordinateur",
    "Faire tourner un modèle en local, sans rien envoyer à l'extérieur.",
    "L'exécution locale offre confidentialité totale et coût marginal nul. Ce module traite des contraintes matérielles réelles et des compromis de qualité.",
    [
      "Installer un environnement d'exécution local",
      "Choisir un modèle compatible avec sa machine",
      "Comprendre l'effet de la quantisation sur la qualité",
    ],
    [
      "Le matériel qui compte : mémoire vive, mémoire GPU, puces Apple Silicon",
      "Outils d'exécution locale et interfaces graphiques",
      "Quantisation : diviser la taille sans effondrer la qualité",
      "Exposer un serveur local pour ses propres applications",
      "Limites honnêtes : ce qu'un modèle local fait mal",
    ],
    {
      titre: "Atelier",
      contenu: `<p>Outil de référence : <a href="https://ollama.com" target="_blank" rel="noopener noreferrer">Ollama</a></p><p>Installer, télécharger deux modèles de tailles différentes, les interroger, puis brancher le serveur local sur le projet fil rouge de la partie 2.</p>`,
    }
  ),

  module(
    "L'open source sur un serveur",
    "Héberger un modèle pour plusieurs utilisateurs.",
    "Passer du poste de travail au serveur partagé : dimensionnement, coûts et exploitation.",
    [
      "Dimensionner une machine pour un modèle donné",
      "Servir plusieurs requêtes simultanées efficacement",
      "Estimer le coût réel de l'auto-hébergement",
    ],
    [
      "Louer un GPU : fournisseurs, tarifs, disponibilité",
      "Moteurs d'inférence optimisés et traitement par lots",
      "Charge simultanée : file d'attente, débit, latence",
      "Sécurité : authentification, quotas, journalisation",
      "Le calcul honnête : auto-hébergement contre API facturée à l'usage",
    ],
    {
      titre: "Atelier",
      contenu: `<p>Déployer un modèle sur un serveur GPU loué à l'heure, mesurer le débit à plusieurs niveaux de charge, puis calculer le point d'équilibre face à une API commerciale.</p>`,
    }
  ),

  // ---------------------------------------------------------------- Partie 4
  module(
    "Introduction à l'IA agentique",
    "Quand le modèle ne répond plus seulement : il agit.",
    "Un agent utilise des outils, enchaîne des étapes et poursuit un objectif. Ce module pose les concepts communs à tous les frameworks de la partie 4.",
    [
      "Distinguer un appel de modèle d'une boucle agentique",
      "Comprendre l'appel d'outil et la boucle de raisonnement",
      "Identifier les risques propres aux systèmes qui agissent",
    ],
    [
      "De la question-réponse à la boucle : observer, décider, agir, recommencer",
      "L'appel d'outil : donner des capacités au modèle",
      "Mémoire de travail et gestion du contexte",
      "Systèmes multi-agents : quand cela aide, quand cela complique",
      "Garde-fous : validation humaine, périmètre d'action, limites de dépense",
    ],
    {
      titre: "Point de vigilance",
      contenu: `<p>Un agent qui se trompe ne produit pas seulement une mauvaise réponse : il agit à tort. Toute la partie 4 revient à cette question — que peut-il faire sans confirmation humaine ?</p>`,
    }
  ),

  module(
    "IA agentique avec n8n",
    "Automatisation visuelle, sans écrire de code.",
    "n8n permet de construire des automatisations par blocs, avec des étapes d'IA intégrées. C'est souvent l'entrée la plus rapide dans l'agentique.",
    [
      "Construire un flux automatisé de bout en bout",
      "Insérer une étape d'IA dans un flux existant",
      "Savoir quand l'outil visuel montre ses limites",
    ],
    [
      "Concepts : déclencheurs, nœuds, connexions, exécutions",
      "Connecter des services (messagerie, tableur, base de données)",
      "Nœuds d'IA et d'agent",
      "Gestion des erreurs et reprise",
      "Hébergé ou auto-hébergé",
    ],
    {
      titre: "Atelier",
      contenu: `<p>Site : <a href="https://n8n.io" target="_blank" rel="noopener noreferrer">n8n.io</a></p><p>Construire un flux complet : réception d'un e-mail, classification par IA, écriture dans une base, notification.</p>`,
    }
  ),

  module(
    "IA agentique avec Claude Cowork",
    "Déléguer des tâches complètes plutôt que des réponses.",
    "Module d'exploration : prise en main de l'approche « confier un travail » et comparaison avec les frameworks à assembler soi-même.",
    [
      "Comprendre le modèle d'usage proposé",
      "Identifier les tâches qui s'y prêtent",
      "Situer l'outil face aux frameworks à monter soi-même",
    ],
    [
      "Positionnement et principe de fonctionnement",
      "Cadrer une tâche déléguée : contexte, critères de réussite, livrable",
      "Suivi et reprise de la main",
      "Comparaison avec un agent assemblé à la main",
    ],
    {
      titre: "À préparer",
      contenu: `<p>Vérifier l'état de l'offre et les conditions d'accès sur <a href="https://claude.com" target="_blank" rel="noopener noreferrer">claude.com</a> juste avant la session — c'est le module le plus susceptible d'avoir bougé d'ici la formation.</p>`,
    }
  ),

  module(
    "IA agentique avec LlamaIndex",
    "Le framework orienté données et RAG.",
    "LlamaIndex se concentre sur la connexion des modèles aux données : c'est le prolongement naturel du module RAG de la partie 1.",
    [
      "Indexer un corpus et l'interroger",
      "Construire un agent qui puise dans plusieurs sources",
      "Évaluer la qualité des réponses",
    ],
    [
      "Chargeurs de documents et types d'index",
      "Moteurs de requête et de conversation",
      "Agents et outils de recherche",
      "Routage entre plusieurs sources de données",
      "Évaluation intégrée",
    ],
    {
      titre: "Atelier",
      contenu: `<p>Documentation : <a href="https://docs.llamaindex.ai" target="_blank" rel="noopener noreferrer">docs.llamaindex.ai</a></p><p>Reprendre le corpus du module RAG et le réimplémenter ici, puis comparer avec la version montée à la main.</p>`,
    }
  ),

  module(
    "IA agentique avec AutoGen de Microsoft",
    "Conversations entre plusieurs agents.",
    "AutoGen structure des échanges entre agents spécialisés qui se répartissent une tâche.",
    [
      "Définir plusieurs agents aux rôles distincts",
      "Organiser leur conversation",
      "Juger si le multi-agent apporte vraiment quelque chose",
    ],
    [
      "Agents, rôles et messages",
      "Schémas de conversation : deux agents, groupe, hiérarchie",
      "Exécution de code par un agent et bac à sable",
      "Point d'entrée humain dans la boucle",
      "Coût et convergence : le piège des agents qui tournent en rond",
    ],
    {
      titre: "Atelier",
      contenu: `<p>Documentation : <a href="https://microsoft.github.io/autogen" target="_blank" rel="noopener noreferrer">microsoft.github.io/autogen</a></p><p>Monter un trio rédacteur / relecteur / validateur sur une tâche réelle, puis mesurer si le résultat justifie le surcoût face à un agent unique bien guidé.</p>`,
    }
  ),

  module(
    "IA agentique avec LangChain et LangGraph",
    "Chaînes, graphes d'états et orchestration fine.",
    "LangChain est l'écosystème le plus large ; LangGraph y ajoute le contrôle explicite du flux par un graphe d'états — utile dès que la boucle doit être maîtrisée.",
    [
      "Composer une chaîne de traitement",
      "Modéliser un agent comme un graphe d'états",
      "Tracer et déboguer une exécution",
    ],
    [
      "Composants de base et composition",
      "Mémoire et gestion du contexte",
      "LangGraph : nœuds, arêtes, état partagé, cycles",
      "Points d'arrêt et validation humaine",
      "Observabilité : suivre ce que l'agent a réellement fait",
    ],
    {
      titre: "Atelier",
      contenu: `<p>Site : <a href="https://www.langchain.com" target="_blank" rel="noopener noreferrer">langchain.com</a></p><p>Reprendre l'agent du module AutoGen et le réimplémenter en graphe d'états, avec un point d'arrêt pour validation humaine avant toute action irréversible.</p>`,
    }
  ),

  // ---------------------------------------------------------------- Partie 5
  module(
    "MCP, c'est quoi ? À quoi ça sert ?",
    "Le protocole standard entre modèles et outils.",
    "Le Model Context Protocol standardise la connexion entre un modèle et des outils ou sources de données : une intégration écrite une fois fonctionne avec tous les clients compatibles.",
    [
      "Comprendre le problème que MCP résout",
      "Connaître l'architecture client / serveur",
      "Identifier ce qu'un serveur MCP peut exposer",
    ],
    [
      "Avant MCP : une intégration par outil et par application",
      "Architecture : hôte, client, serveur",
      "Ce qu'un serveur expose : outils, ressources, prompts",
      "Transports disponibles",
      "L'écosystème existant : ce qui est déjà disponible",
    ],
    {
      titre: "Ressource",
      contenu: `<p>Spécification et documentation : <a href="https://modelcontextprotocol.io" target="_blank" rel="noopener noreferrer">modelcontextprotocol.io</a></p>`,
    }
  ),

  module(
    "Mettre en place le protocole MCP",
    "Brancher un serveur existant, puis écrire le sien.",
    "Module de clôture, entièrement pratique : connecter un serveur MCP existant, puis en construire un qui expose ses propres outils métier.",
    [
      "Connecter un serveur MCP existant à un client",
      "Écrire un serveur exposant ses propres outils",
      "Sécuriser ce qu'on expose",
    ],
    [
      "Installer et configurer un serveur existant",
      "Vérifier que les outils sont bien vus par le client",
      "Écrire son serveur : définir les outils, leurs paramètres, leurs retours",
      "Décrire un outil pour qu'un modèle l'utilise correctement",
      "Sécurité : périmètre, authentification, ce qu'on n'expose jamais",
      "Distribuer son serveur",
    ],
    {
      titre: "Projet final",
      contenu: `<p>Écrire un serveur MCP qui expose les données du projet fil rouge de la partie 2, le brancher sur un client, et vérifier qu'une demande en langage naturel déclenche bien le bon outil. La boucle de la formation est alors bouclée.</p>`,
    }
  ),
];
