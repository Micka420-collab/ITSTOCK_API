# Fix npm ci error

## Problème
`npm ci` échoue sans package-lock.json

## Solution
Ajout du package-lock.json généré localement.

## Si ça ne marche toujours pas

Remplacez dans Dockerfile :
```dockerfile
RUN npm ci
```

Par :
```dockerfile
RUN npm install
```

Ou utilisez Nixpacks (sans Dockerfile) :
1. Supprimez le Dockerfile du repo
2. Railway détectera automatiquement Node.js
3. Le build utilisera Nixpacks au lieu de Docker
