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
- `/utilisateurs` : gestion des comptes, réservée aux administrateurs

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
