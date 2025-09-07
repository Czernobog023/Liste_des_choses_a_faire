# 🚀 Installation et Déploiement

## 📥 Installation Rapide

### 1. Cloner le Repository
```bash
git clone https://github.com/Czernobog023/Liste_des_choses_a_faire.git
cd Liste_des_choses_a_faire
```

### 2. Installer les Dépendances
```bash
npm install
```

### 3. Initialiser les Données
```bash
# Copier le fichier d'exemple comme fichier de données
cp data/tasks.example.json data/tasks.json

# Créer le dossier logs
mkdir -p logs
```

### 4. Démarrer l'Application

#### Mode Développement (simple)
```bash
npm start
```

#### Mode Production (avec PM2)
```bash
# Installer PM2 si nécessaire
npm install -g pm2

# Démarrer l'application
pm2 start ecosystem.config.js

# Vérifier le statut
pm2 status

# Voir les logs
pm2 logs collaborative-task-manager --nostream
```

### 5. Accéder à l'Application
Ouvrez votre navigateur et allez sur : **http://localhost:3000**

## 🌐 Déploiement Web

### Vercel (Recommandé)
1. Connectez votre compte GitHub à Vercel
2. Importez le repository `Liste_des_choses_a_faire`
3. Vercel détectera automatiquement la configuration Node.js
4. Déployez en un clic !

### Heroku
```bash
# Installer Heroku CLI puis :
heroku create votre-app-name
git push heroku main
heroku open
```

### Railway
1. Connectez votre repository GitHub à Railway
2. Sélectionnez le repository `Liste_des_choses_a_faire`
3. Railway déploiera automatiquement l'application

## 🔧 Configuration

### Variables d'Environnement
```bash
PORT=3000          # Port d'écoute (optionnel, défaut: 3000)
NODE_ENV=production   # Mode production (optionnel)
```

### Personnalisation des Utilisateurs
Pour changer les noms d'utilisateurs, modifiez :
1. `server.js` ligne 35 et 52
2. `public/index.html` lignes 20-21
3. `public/js/app.js` ligne 4
4. `data/tasks.example.json` lignes 3-4

## 📱 Utilisation Mobile
L'application est responsive et fonctionne parfaitement sur :
- 📱 Smartphones
- 📱 Tablettes  
- 💻 Desktop

## 🤝 Partage Entre Utilisateurs

### Option 1 : Instance Partagée
Déployez l'application sur un service cloud et partagez l'URL avec votre partenaire.

### Option 2 : Export/Import
1. **Utilisateur A** : Exporte ses données depuis l'onglet "Paramètres"
2. **Utilisateur B** : Importe le fichier JSON dans sa propre instance
3. Continuez à échanger les fichiers d'export régulièrement

## 🔒 Sécurité
⚠️ **Important** : Cette application est conçue pour un usage personnel/familial entre personnes de confiance. Pour un usage professionnel, ajoutez :
- Authentification utilisateur
- Base de données sécurisée
- HTTPS
- Validation d'accès

## 🆘 Support
- 📖 Documentation complète : `README.md`
- 🐛 Problèmes : Créez une issue sur GitHub
- 💡 Suggestions : Pull requests bienvenues !

---
**🎉 Bonne collaboration avec Maya l'abeille et Rayanha !**