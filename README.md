# 📋 Gestionnaire de Tâches Collaboratif

Une application web moderne pour la gestion collaborative de tâches partagées entre deux utilisateurs avec système de validation bipartite.

## 🚀 Fonctionnalités Principales

### ✨ Gestion Collaborative des Tâches
- **Proposition de tâches** : Chaque utilisateur peut proposer de nouvelles tâches
- **Validation bipartite** : Les tâches ne deviennent actives qu'après validation des deux utilisateurs
- **Gestion complète** : Ajouter, valider, rejeter, terminer et supprimer des tâches
- **Catégorisation** : Organisation des tâches par catégories (Général, Maison, Courses, Travail, Personnel, Urgent)

### 🔄 Synchronisation en Temps Réel
- **WebSocket** : Mises à jour instantanées pour tous les utilisateurs connectés
- **Notifications** : Alertes en temps réel pour les nouvelles tâches, validations, etc.
- **Statut de connexion** : Indicateur visuel de l'état de la connexion

### 📊 Interface Utilisateur Intuitive
- **Design moderne** : Interface responsive avec Material Design
- **Navigation par onglets** : Tâches actives, en attente, terminées et paramètres
- **États visuels** : Codes couleur pour différents statuts de tâches
- **Compteurs dynamiques** : Nombre de tâches en attente visible en temps réel

### 💾 Export/Import de Données
- **Export JSON** : Sauvegarde complète des données au format JSON
- **Import flexible** : Fusion des données importées avec les données existantes
- **Partage facile** : Fichiers facilement partageables entre utilisateurs

## 🛠 Technologies Utilisées

### Backend
- **Node.js** - Runtime JavaScript
- **Express.js** - Framework web
- **Socket.IO** - Communication temps réel
- **fs-extra** - Gestion des fichiers
- **UUID** - Génération d'identifiants uniques

### Frontend
- **HTML5** - Structure sémantique
- **CSS3** - Design moderne avec variables CSS
- **Vanilla JavaScript** - Logique côté client
- **Font Awesome** - Icônes
- **Google Fonts (Inter)** - Typographie

### Outils de Développement
- **PM2** - Gestionnaire de processus en production
- **CORS** - Gestion des origines croisées
- **JSON** - Stockage et échange de données

## 📦 Installation et Déploiement

### Prérequis
- Node.js (version 14 ou supérieure)
- npm (gestionnaire de paquets Node.js)

### Installation
```bash
# Cloner ou télécharger le projet
cd collaborative-task-manager

# Installer les dépendances
npm install

# Démarrer en mode développement
npm start

# OU démarrer avec PM2 (production)
npx pm2 start ecosystem.config.js
```

### Configuration
L'application utilise les paramètres suivants par défaut :
- **Port** : 3000
- **Stockage** : Fichier JSON local (`data/tasks.json`)
- **Utilisateurs** : "Utilisateur 1" et "Utilisateur 2"

## 🎯 Guide d'Utilisation

### 1. Première Connexion
1. Ouvrez l'application dans votre navigateur
2. Sélectionnez votre identité utilisateur dans le menu déroulant (Utilisateur 1 ou 2)
3. Vous êtes maintenant prêt à collaborer !

### 2. Proposer une Nouvelle Tâche
1. Cliquez sur le bouton "Nouvelle Tâche"
2. Remplissez le formulaire :
   - **Titre** (obligatoire) : Description courte de la tâche
   - **Description** (optionnel) : Détails supplémentaires
   - **Catégorie** : Classement de la tâche
3. Cliquez sur "Proposer la tâche"
4. La tâche apparaît dans l'onglet "En Attente"

### 3. Système de Validation Bipartite

#### Pour l'utilisateur qui propose une tâche :
- La tâche est automatiquement validée par le proposant
- Elle attend la validation du second utilisateur
- Le proposant peut supprimer sa proposition tant qu'elle n'est pas validée

#### Pour l'autre utilisateur :
- Recevoir une notification de nouvelle tâche proposée
- Aller dans l'onglet "En Attente" 
- Choisir **"Valider"** ou **"Rejeter"** la tâche
- Si validée, la tâche devient active pour les deux utilisateurs

### 4. Gérer les Tâches Actives
- **Terminer** : Marquer une tâche comme terminée
- **Supprimer** : Supprimer définitivement une tâche
- Les tâches terminées sont déplacées vers l'onglet "Terminées"

### 5. Export et Import de Données

#### Export :
1. Aller dans l'onglet "Paramètres"
2. Cliquer sur "Exporter"
3. Un fichier JSON est téléchargé avec toutes vos données

#### Import :
1. Dans l'onglet "Paramètres", cliquer sur "Importer"
2. Sélectionner un fichier JSON d'export précédent
3. Les données sont fusionnées avec les données existantes

## 🔧 Architecture du Projet

```
collaborative-task-manager/
├── server.js                 # Serveur Express principal
├── package.json             # Configuration npm
├── ecosystem.config.js      # Configuration PM2
├── data/                    # Stockage des données
│   └── tasks.json          # Fichier de données JSON
├── public/                  # Fichiers statiques
│   ├── index.html          # Interface principale
│   ├── css/
│   │   └── styles.css      # Styles CSS
│   └── js/
│       └── app.js          # Logique côté client
└── logs/                   # Journaux PM2
```

## 📡 API REST

### Endpoints Principaux

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/api/data` | Récupérer toutes les données |
| `POST` | `/api/tasks/propose` | Proposer une nouvelle tâche |
| `POST` | `/api/tasks/:id/validate` | Valider une tâche |
| `POST` | `/api/tasks/:id/reject` | Rejeter une tâche |
| `POST` | `/api/tasks/:id/complete` | Marquer comme terminée |
| `DELETE` | `/api/tasks/:id` | Supprimer une tâche |
| `GET` | `/api/export` | Exporter les données |
| `POST` | `/api/import` | Importer des données |

### Format des Données

#### Tâche Active
```json
{
  "id": "uuid",
  "title": "Titre de la tâche",
  "description": "Description optionnelle",
  "category": "Général",
  "proposedBy": "Utilisateur 1",
  "proposedAt": "2024-01-15T10:30:00.000Z",
  "approvedAt": "2024-01-15T11:00:00.000Z",
  "status": "active"
}
```

#### Tâche en Attente
```json
{
  "id": "uuid",
  "title": "Titre de la tâche",
  "description": "Description optionnelle",
  "category": "Général",
  "proposedBy": "Utilisateur 1",
  "proposedAt": "2024-01-15T10:30:00.000Z",
  "validations": ["Utilisateur 1"],
  "status": "pending"
}
```

## 🔒 Sécurité et Bonnes Pratiques

### Validation des Données
- Validation côté client et serveur
- Nettoyage des entrées utilisateur
- Vérification des permissions

### Gestion des Erreurs
- Messages d'erreur informatifs
- Gestion gracieuse des déconnexions
- Récupération automatique de session

## 🚀 Déploiement en Production

### Avec PM2 (Recommandé)
```bash
# Installer PM2
npm install pm2

# Démarrer l'application
npx pm2 start ecosystem.config.js

# Vérifier le statut
npx pm2 status

# Redémarrer
npx pm2 restart collaborative-task-manager

# Arrêter
npx pm2 stop collaborative-task-manager

# Voir les logs
npx pm2 logs collaborative-task-manager --nostream
```

### Variables d'Environnement
```bash
NODE_ENV=production    # Mode production
PORT=3000             # Port d'écoute
```

## 🤝 Collaboration et Partage

### Partager l'Application
1. **Export complet** : Exporter toutes les données depuis l'onglet Paramètres
2. **Partage de fichier** : Envoyer le fichier JSON à votre partenaire
3. **Import** : L'autre personne importe le fichier dans sa propre instance
4. **Synchronisation** : Utiliser la même instance sur un serveur partagé

### Bonnes Pratiques Collaboratives
- **Communication** : Se mettre d'accord sur les catégories à utiliser
- **Validation rapide** : Traiter rapidement les tâches en attente
- **Descriptions claires** : Ajouter des détails pour éviter les malentendus
- **Sauvegarde régulière** : Exporter périodiquement les données

## 📱 Compatibilité et Responsive

### Navigateurs Supportés
- Chrome/Chromium (recommandé)
- Firefox
- Safari
- Edge

### Dispositifs
- **Desktop** : Expérience complète
- **Tablette** : Interface adaptée
- **Mobile** : Design responsive optimisé

## 🐛 Dépannage

### Problèmes Courants

#### L'application ne se charge pas
- Vérifier que le serveur est démarré : `npx pm2 status`
- Contrôler les logs : `npx pm2 logs collaborative-task-manager --nostream`
- Vérifier le port 3000

#### Pas de synchronisation temps réel
- Vérifier la connexion WebSocket (indicateur en bas à droite)
- Actualiser la page
- Contrôler les logs serveur

#### Données perdues
- Vérifier le fichier `data/tasks.json`
- Restaurer depuis une sauvegarde d'export

#### Import/Export ne fonctionne pas
- Vérifier le format JSON du fichier
- S'assurer que le fichier contient les clés requises (`users`, `tasks`)

## 📞 Support et Contribution

Cette application est conçue pour être simple, efficace et facilement extensible. Pour toute question ou amélioration :

1. Consulter cette documentation
2. Vérifier les logs de l'application
3. Tester avec un export/import de données

## 📄 Licence

MIT License - Libre d'utilisation et de modification.

---

**🎉 Bonne collaboration avec votre Gestionnaire de Tâches Collaboratif !**