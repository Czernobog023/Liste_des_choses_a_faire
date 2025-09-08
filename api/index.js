const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = require('http').createServer(app);

// Configuration CORS pour Vercel
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "DELETE"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Middleware
app.use(cors({
  origin: "*",
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Stockage en mémoire pour Vercel (temporaire pour cette démo)
// En production, utiliser une base de données comme MongoDB Atlas ou Supabase
let appData = {
  users: ['Maya l\'abeille', 'Rayanha'],
  tasks: [],
  pendingTasks: []
};

// Fonction utilitaire pour réinitialiser les données
function initializeData() {
  return {
    users: ['Maya l\'abeille', 'Rayanha'],
    tasks: [],
    pendingTasks: []
  };
}

// Routes API

// Obtenir toutes les données
app.get('/api/data', (req, res) => {
  try {
    res.json(appData);
  } catch (error) {
    console.error('Erreur lecture données:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des données' });
  }
});

// Ajouter une nouvelle tâche (en attente de validation)
app.post('/api/tasks/propose', (req, res) => {
  try {
    const { title, description, proposedBy } = req.body;
    
    if (!title || !proposedBy) {
      return res.status(400).json({ error: 'Titre et utilisateur proposant requis' });
    }

    const newTask = {
      id: uuidv4(),
      title: title.trim(),
      description: description?.trim() || '',
      proposedBy,
      proposedAt: new Date().toISOString(),
      validations: [proposedBy], // L'utilisateur qui propose valide automatiquement
      status: 'pending'
    };

    appData.pendingTasks.push(newTask);
    
    // Émettre via Socket.IO
    io.emit('taskProposed', newTask);
    
    res.json(newTask);
  } catch (error) {
    console.error('Erreur proposition tâche:', error);
    res.status(500).json({ error: 'Erreur lors de la proposition de la tâche' });
  }
});

// Valider une tâche
app.post('/api/tasks/:taskId/validate', (req, res) => {
  try {
    const { taskId } = req.params;
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'ID utilisateur requis' });
    }

    const taskIndex = appData.pendingTasks.findIndex(task => task.id === taskId);
    
    if (taskIndex === -1) {
      return res.status(404).json({ error: 'Tâche non trouvée' });
    }

    const task = appData.pendingTasks[taskIndex];
    
    // Ajouter la validation si pas déjà validée par cet utilisateur
    if (!task.validations.includes(userId)) {
      task.validations.push(userId);
    }
    
    // Si les deux utilisateurs ont validé, déplacer vers les tâches actives
    if (task.validations.length >= 2) {
      const approvedTask = {
        ...task,
        status: 'active',
        approvedAt: new Date().toISOString()
      };
      delete approvedTask.validations;
      
      appData.tasks.push(approvedTask);
      appData.pendingTasks.splice(taskIndex, 1);
      
      // Notifier tous les clients
      io.emit('taskApproved', approvedTask);
      
      res.json({ message: 'Tâche approuvée et ajoutée', task: approvedTask });
    } else {
      // Notifier la validation
      io.emit('taskValidated', { taskId, userId, validations: task.validations });
      
      res.json({ message: 'Validation ajoutée', task });
    }
  } catch (error) {
    console.error('Erreur validation:', error);
    res.status(500).json({ error: 'Erreur lors de la validation de la tâche' });
  }
});

// Rejeter une tâche
app.post('/api/tasks/:taskId/reject', (req, res) => {
  try {
    const { taskId } = req.params;
    const { userId } = req.body;
    
    const taskIndex = appData.pendingTasks.findIndex(task => task.id === taskId);
    
    if (taskIndex === -1) {
      return res.status(404).json({ error: 'Tâche non trouvée' });
    }

    const rejectedTask = appData.pendingTasks[taskIndex];
    appData.pendingTasks.splice(taskIndex, 1);
    
    // Notifier tous les clients
    io.emit('taskRejected', { taskId, rejectedBy: userId });
    
    res.json({ message: 'Tâche rejetée', task: rejectedTask });
  } catch (error) {
    console.error('Erreur rejet:', error);
    res.status(500).json({ error: 'Erreur lors du rejet de la tâche' });
  }
});

// Marquer une tâche comme terminée
app.post('/api/tasks/:taskId/complete', (req, res) => {
  try {
    const { taskId } = req.params;
    const { userId } = req.body;
    
    const task = appData.tasks.find(task => task.id === taskId);
    
    if (!task) {
      return res.status(404).json({ error: 'Tâche non trouvée' });
    }

    task.status = 'completed';
    task.completedBy = userId;
    task.completedAt = new Date().toISOString();
    
    // Notifier tous les clients
    io.emit('taskCompleted', task);
    
    res.json(task);
  } catch (error) {
    console.error('Erreur complétion:', error);
    res.status(500).json({ error: 'Erreur lors de la complétion de la tâche' });
  }
});

// Supprimer une tâche
app.delete('/api/tasks/:taskId', (req, res) => {
  try {
    const { taskId } = req.params;
    const { userId } = req.body;
    
    // Chercher dans les tâches actives
    let taskIndex = appData.tasks.findIndex(task => task.id === taskId);
    let taskType = 'active';
    
    // Si pas trouvée, chercher dans les tâches en attente
    if (taskIndex === -1) {
      taskIndex = appData.pendingTasks.findIndex(task => task.id === taskId);
      taskType = 'pending';
    }
    
    if (taskIndex === -1) {
      return res.status(404).json({ error: 'Tâche non trouvée' });
    }

    const deletedTask = taskType === 'active' 
      ? appData.tasks.splice(taskIndex, 1)[0]
      : appData.pendingTasks.splice(taskIndex, 1)[0];
    
    // Notifier tous les clients
    io.emit('taskDeleted', { taskId, deletedBy: userId });
    
    res.json({ message: 'Tâche supprimée', task: deletedTask });
  } catch (error) {
    console.error('Erreur suppression:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression de la tâche' });
  }
});

// Exporter les données
app.get('/api/export', (req, res) => {
  try {
    const exportData = {
      ...appData,
      exportedAt: new Date().toISOString(),
      version: '2.0'
    };
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="maya-rayanha-tasks.json"');
    res.json(exportData);
  } catch (error) {
    console.error('Erreur export:', error);
    res.status(500).json({ error: 'Erreur lors de l\'export des données' });
  }
});

// Importer des données
app.post('/api/import', (req, res) => {
  try {
    const importedData = req.body;
    
    // Validation basique des données importées
    if (!importedData.tasks && !importedData.pendingTasks) {
      return res.status(400).json({ error: 'Format de données invalide' });
    }

    // Fusionner les données (éviter les doublons par ID)
    if (importedData.tasks) {
      importedData.tasks.forEach(task => {
        const exists = appData.tasks.find(t => t.id === task.id);
        if (!exists) {
          appData.tasks.push(task);
        }
      });
    }

    if (importedData.pendingTasks) {
      importedData.pendingTasks.forEach(task => {
        const exists = appData.pendingTasks.find(t => t.id === task.id);
        if (!exists) {
          appData.pendingTasks.push(task);
        }
      });
    }
    
    // Notifier tous les clients
    io.emit('dataImported', { message: 'Données importées avec succès' });
    
    res.json({ message: 'Import réussi', data: appData });
  } catch (error) {
    console.error('Erreur import:', error);
    res.status(500).json({ error: 'Erreur lors de l\'import des données' });
  }
});

// Route de santé pour Vercel
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    users: appData.users,
    tasksCount: appData.tasks.length,
    pendingCount: appData.pendingTasks.length
  });
});

// Servir les fichiers statiques
app.use('/', express.static(path.join(__dirname, '../public')));

// Route catch-all pour SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// WebSocket pour la communication en temps réel
io.on('connection', (socket) => {
  console.log('📱 Utilisateur mobile connecté:', socket.id);
  
  // Envoyer les données actuelles au nouveau client
  socket.emit('initialData', appData);
  
  socket.on('disconnect', () => {
    console.log('📱 Utilisateur mobile déconnecté:', socket.id);
  });
  
  // Gestion de la reconnection
  socket.on('reconnect', () => {
    console.log('📱 Utilisateur mobile reconnecté:', socket.id);
    socket.emit('initialData', appData);
  });
});

// Gestion des erreurs globales
process.on('uncaughtException', (error) => {
  console.error('❌ Erreur non gérée:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Promise rejetée:', reason);
});

// Export pour Vercel
module.exports = app;

// Démarrage local si pas sur Vercel
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur Maya & Rayanha démarré sur le port ${PORT}`);
    console.log(`📱 Interface mobile: http://localhost:${PORT}`);
  });
}