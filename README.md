# Tiako dia Tiako — interface d’administration

Frontend Next.js pour gérer les produits, le stock, les commandes, les comptes
et les publications Facebook.

## Démarrage

Prérequis : Node.js et l’API du dossier `../server` démarrée.

```bash
npm install
npm run dev
```

Ouvrir <http://localhost:3000>. Par défaut, le frontend utilise l’API sur
`http://localhost:5000`. Pour modifier cette adresse, créer `client/.env.local` :

```env
NEXT_PUBLIC_API_URL=http://localhost:5000
```

## Fonctions principales

- `/dashboard` : résumé des ventes, commandes et stocks à surveiller.
- `/produits` : catalogue, stock, images et mots-clés utilisés pour reconnaître
  les commandes reçues via Facebook. Les administrateurs peuvent y publier un
  produit immédiatement après son enregistrement, ou créer une publication.
- `/commandes` : suivi des commandes et de leurs statuts.
- `/utilisateurs` : gestion des comptes, réservée aux administrateurs.
- `/facebook` : configuration du message d’accueil automatique. La création de
  publications Facebook se fait depuis `/produits`.

Les demandes Facebook reconnues peuvent créer une commande multi-produits et
réserver le stock. Les paiements ne sont pas traités par l’application.

## Vérification

```bash
npm run lint
npm run build
```

L’authentification et les droits sont contrôlés par l’API. Ne placez aucun
secret Meta dans le frontend.
