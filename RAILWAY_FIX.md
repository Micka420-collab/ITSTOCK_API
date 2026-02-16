# Fix Railway - Variables d'environnement

## ❌ Problème
Les variables d'environnement ne sont pas reconnues par l'application.

## ✅ Solutions

### Solution 1: Redémarrer le service

Dans Railway Dashboard:
1. Cliquez sur votre service
2. Cliquez sur **"Restart"** ou **"Redeploy"**

Les variables sont parfois chargées seulement au redémarrage.

### Solution 2: Vérifier les noms des variables

Dans Railway Dashboard → Variables, vérifiez:
- ✅ `SUPABASE_URL` (pas `SUPABASEURL`)
- ✅ `SUPABASE_SERVICE_ROLE_KEY` (bien avec underscore)
- ✅ Pas d'espaces avant/après

### Solution 3: Raw Editor

Dans Variables, cliquez sur **"Raw Editor"** et collez:
```
SUPABASE_URL=https://azwtzuqfyxfltqzrunmf.supabase.co
SUPABASE_SERVICE_ROLE_KEY=votre_clé_ici
JWT_SECRET=votre_secret_ici
PORT=3000
```

### Solution 4: Ajouter NODE_ENV

Ajoutez aussi:
```
NODE_ENV=production
```

### Solution 5: Redeploy complet

1. Dans Deployments
2. Cliquez sur les 3 points du dernier deployment
3. **"Clear Cache and Redeploy"**

---

## 🔍 Debug

Après le déploiement, allez dans **Logs** et cherchez:
```
🔍 ENV VARS DEBUG:
PORT: 3000
SUPABASE_URL exists: true
SUPABASE_SERVICE_ROLE_KEY exists: true
```

Si vous voyez `false`, les variables ne sont pas chargées.

---

## 🆘 Si rien ne marche

Créez un nouveau projet Railway propre:
1. Supprimez l'ancien projet
2. New Project → Deploy from GitHub
3. Ajoutez les variables AVANT le premier deploy
