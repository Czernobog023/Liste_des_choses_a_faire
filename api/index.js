const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();

// Middleware
app.use(cors({
  origin: "*",
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Stockage en mémoire pour Vercel (simple pour démo)
let appData = {
  users: ['Maya l\'abeille', 'Rayanha'],
  tasks: [],
  pendingTasks: [],
  lastUpdate: Date.now()
};

// Fonction pour notifier un changement
function updateData() {
  appData.lastUpdate = Date.now();
}

// Routes API

// Obtenir toutes les données avec timestamp
app.get('/api/data', (req, res) => {
  try {
    res.json({
      ...appData,
      timestamp: appData.lastUpdate
    });
  } catch (error) {
    console.error('Erreur lecture données:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des données' });
  }
});

// Polling pour les mises à jour (remplace Socket.IO)
app.get('/api/poll/:lastUpdate', (req, res) => {
  try {
    const clientLastUpdate = parseInt(req.params.lastUpdate);
    
    // Si les données ont été mises à jour depuis la dernière fois
    if (appData.lastUpdate > clientLastUpdate) {
      res.json({
        updated: true,
        data: appData,
        timestamp: appData.lastUpdate
      });
    } else {
      res.json({
        updated: false,
        timestamp: appData.lastUpdate
      });
    }
  } catch (error) {
    console.error('Erreur polling:', error);
    res.status(500).json({ error: 'Erreur polling' });
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
    updateData();
    
    res.json({
      success: true,
      task: newTask,
      message: 'Tâche proposée avec succès'
    });
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
      updateData();
      
      res.json({ 
        success: true,
        message: 'Tâche approuvée et ajoutée', 
        task: approvedTask,
        action: 'approved'
      });
    } else {
      updateData();
      
      res.json({ 
        success: true,
        message: 'Validation ajoutée', 
        task,
        action: 'validated'
      });
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
    updateData();
    
    res.json({ 
      success: true,
      message: 'Tâche rejetée', 
      task: rejectedTask,
      action: 'rejected'
    });
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
    updateData();
    
    res.json({
      success: true,
      message: 'Tâche terminée',
      task,
      action: 'completed'
    });
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
    
    updateData();
    
    res.json({ 
      success: true,
      message: 'Tâche supprimée', 
      task: deletedTask,
      action: 'deleted'
    });
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
    
    updateData();
    
    res.json({ 
      success: true,
      message: 'Import réussi', 
      data: appData,
      action: 'imported'
    });
  } catch (error) {
    console.error('Erreur import:', error);
    res.status(500).json({ error: 'Erreur lors de l\'import des données' });
  }
});

// Route de santé pour vérification
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    users: appData.users,
    tasksCount: appData.tasks.length,
    pendingCount: appData.pendingTasks.length,
    lastUpdate: appData.lastUpdate,
    serverTime: Date.now()
  });
});

// Route pour tester la connectivité
app.get('/api/ping', (req, res) => {
  res.json({ 
    pong: true, 
    timestamp: Date.now() 
  });
});

// Servir les fichiers statiques en local seulement
if (process.env.NODE_ENV !== 'production') {
  app.use('/', express.static(path.join(__dirname, '../public')));
  
  // Route catch-all pour SPA en local
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  });
}

// Gestion des erreurs
app.use((error, req, res, next) => {
  console.error('Erreur serveur:', error);
  res.status(500).json({ error: 'Erreur serveur interne' });
});

// Export pour Vercel
module.exports = app;

// Démarrage local si pas sur Vercel
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur Maya & Rayanha démarré sur le port ${PORT}`);
    console.log(`📱 Interface mobile: http://localhost:${PORT}`);
  });
}