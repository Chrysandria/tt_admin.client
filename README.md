# Tiako dia Tiako — espace admin

Interface Next.js responsive pour gérer la boutique : tableau de bord,
commandes, inventaire et comptes utilisateurs administrateurs.

## Démarrage

```bash
npm install
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000). Démarrer aussi l’API
NestJS dans `../server` et configurer son accès PostgreSQL, `JWT_SECRET` et
`CSRF_SECRET` (voir le README du serveur).

L’application utilise des routes dédiées, accessibles directement et sans
rechargement complet :

- `/dashboard` : tableau de bord
- `/commandes` : suivi des commandes
- `/produits` : suivi des produits
- `/facebook` : publication et automatisations de la Page, réservées aux administrateurs
- `/utilisateurs` : gestion des comptes, réservée aux administrateurs

Chaque produit peut aussi recevoir des mots-clés ou variantes de nom
séparés par des virgules. Le moteur de commandes Messenger reconnaît le nom et
ces variantes dans un message, accepte une quantité avant ou après le nom, et
peut réserver plusieurs produits dans une même commande si les correspondances
sont non ambiguës et le stock disponible.

La rubrique Facebook permet aussi de publier immédiatement un texte (5 000
caractères maximum) avec une image JPEG ou PNG (8 Mio maximum). L’option de lien
Messenger ajoute à la publication un lien ouvrant directement une conversation
avec la Page ; Facebook ne propose pas de bouton natif de messagerie sur les
publications organiques. La rubrique permet aussi de configurer le message privé
envoyé après un commentaire ou un message Messenger sans produit reconnu
(2 000 caractères maximum). Les images produit acceptent JPEG, PNG ou WebP
jusqu’à 5 Mio. Les limites des mots-clés sont de 30 variantes par produit et
80 caractères par variante.

Une commande peut contenir plusieurs produits. Dans le formulaire, ajoutez des
lignes de produits et leurs quantités ; une commande existante peut ensuite
être modifiée pour ajuster les quantités ou ajouter des produits.

La racine `/` affiche la connexion. Après authentification, l’utilisateur est
redirigé vers `/dashboard`.

Par défaut, le frontend appelle `http://localhost:5000`. Pour une autre adresse,
définir `NEXT_PUBLIC_API_URL` dans `client/.env.local`, par exemple :

```env
NEXT_PUBLIC_API_URL=http://localhost:5000
```

Le backend doit autoriser l’origine du frontend et les cookies inter-origines.
L’authentification utilise le cookie HTTP-only du backend et les mutations
récupèrent un jeton CSRF avant chaque requête.

Les images produits sont envoyées à l’API NestJS et conservées dans son dossier
`uploads`; la base ne contient que leur URL relative.

Les comptes dont `type` vaut `admin` peuvent consulter et gérer les comptes
utilisateurs. Cette autorisation est aussi contrôlée par l’API NestJS.

## Vérification

```bash
npm run lint
npm run build
```
