# ITStock API

Serveur API pour le système de licence ITStock.

## 🚀 Déploiement

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/zIQMdC?referralCode=your-code)

Ou manuellement :
1. Fork ce repo
2. Créer un projet sur [Railway](https://railway.app)
3. Connecter le repo
4. Ajouter les variables d'environnement

## ⚙️ Variables d'environnement

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | URL Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service role Supabase |
| `JWT_SECRET` | Secret JWT (min 32 caractères) |
| `PORT` | Port (default: 3000) |

## 📡 Endpoints

```
GET  /health
POST /api/v1/licenses/validate
POST /api/v1/licenses/activate
POST /api/v1/licenses/deactivate
POST /api/v1/licenses/heartbeat
POST /api/v1/auth/login
GET  /api/v1/plans
```

## 🧪 Test

```bash
curl https://your-app.up.railway.app/health
```

## 📄 License

UNLICENSED
