# ITStock API - License Server

API de gestion des licences ITStock - Connexion directe Supabase sans Prisma.

## 🚀 Déploiement Rapide

### 1. Créer compte Railway
https://railway.app

### 2. New Project → Deploy from GitHub repo → Sélectionnez ITSTOCK_API

### 3. Variables d'environnement

```env
SUPABASE_URL=https://azwtzuqfyxfltqzrunmf.supabase.co
SUPABASE_SERVICE_ROLE_KEY=votre_clé_ici
JWT_SECRET=générez_avec_node_crypto
PORT=3000
```

Générer JWT_SECRET :
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Deploy ! 🎉

---

## 📡 API Endpoints

### Health Check
```
GET /health
```

### Licences
```
POST /api/v1/licenses/validate    # Valider une licence
POST /api/v1/licenses/activate    # Activer sur un device
POST /api/v1/licenses/deactivate  # Désactiver
POST /api/v1/licenses/heartbeat   # Ping de vie
```

### Auth
```
POST /api/v1/auth/login           # Connexion
```

### Plans
```
GET /api/v1/plans                 # Liste des plans
```

---

## 🧪 Test

```bash
# Health
curl https://votre-url.up.railway.app/health

# Validate license
curl -X POST https://votre-url.up.railway.app/api/v1/licenses/validate \
  -H "Content-Type: application/json" \
  -d '{"licenseKey":"ITSTOCK-U5US-41U8-7DM3-P6CL-A88B","hardwareId":"PC-123"}'
```

---

## 🔑 Identifiants de test

| Email | Mot de passe | Rôle |
|-------|-------------|------|
| admin@itstock.com | admin123 | Admin |
| demo@itstock.com | demo123 | Client |

---

## 📝 Clés de licence valides

```
ITSTOCK-U5US-41U8-7DM3-P6CL-A88B  (Active)
```

---

## 🛠️ Stack Technique

- Node.js 20
- Express.js
- Supabase (PostgreSQL)
- bcryptjs (hash)
- JWT (auth)
- Docker (deploy)

---

## 🐛 Debug

Si erreur de build :
```bash
# Vérifier package-lock.json présent
git add package-lock.json
git commit -m "Add lock file"
git push origin main
```

---

Made with ❤️ by Nextendo
