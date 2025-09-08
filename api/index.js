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

// Stockage temporaire en mémoire (sera remplacé par le stockage client)
let memoryData = {
  users: ['Maya l\'abeille', 'Rayanha'],
  tasks: [],
  pendingTasks: [],
  lastUpdate: Date.now(),
  sessions: new Map() // Pour suivre les sessions actives
};

// Fonction pour nettoyer les sessions inactives (> 30 min)
function cleanupSessions() {
  const now = Date.now();
  const thirtyMinutes = 30 * 60 * 1000;
  
  for (const [sessionId, session] of memoryData.sessions.entries()) {
    if (now - session.lastActivity > thirtyMinutes) {
      memoryData.sessions.delete(sessionId);
    }
  }
}

// Fonction pour notifier un changement
function updateData() {
  memoryData.lastUpdate = Date.now();
  cleanupSessions();
}

// Routes API

// Obtenir les données avec merge intelligent des sessions actives
app.get('/api/data', (req, res) => {
  try {
    // Nettoyer les sessions expirées
    cleanupSessions();
    
    // Merger les données de toutes les sessions actives
    let mergedTasks = [...memoryData.tasks];
    let mergedPendingTasks = [...memoryData.pendingTasks];
    
    // Ajouter les données des sessions actives
    for (const session of memoryData.sessions.values()) {
      if (session.data) {
        // Merger sans doublons basés sur l'ID
        session.data.tasks?.forEach(task => {
          if (!mergedTasks.find(t => t.id === task.id)) {
            mergedTasks.push(task);
          }
        });
        
        session.data.pendingTasks?.forEach(task => {
          if (!mergedPendingTasks.find(t => t.id === task.id)) {
            mergedPendingTasks.push(task);
          }
        });
      }
    }
    
    const responseData = {
      users: memoryData.users,
      tasks: mergedTasks,
      pendingTasks: mergedPendingTasks,
      timestamp: memoryData.lastUpdate,
      activeSessions: memoryData.sessions.size
    };
    
    res.json(responseData);
  } catch (error) {
    console.error('Erreur lecture données:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des données' });
  }
});

// Synchronisation des données client (nouveau endpoint)
app.post('/api/sync', (req, res) => {
  try {
    const { sessionId, clientData } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID requis' });
    }
    
    // Créer ou mettre à jour la session
    memoryData.sessions.set(sessionId, {
      id: sessionId,
      lastActivity: Date.now(),
      data: clientData
    });
    
    // Nettoyer les sessions expirées
    cleanupSessions();
    
    // Merger toutes les données actives
    let allTasks = [...memoryData.tasks];
    let allPendingTasks = [...memoryData.pendingTasks];
    
    for (const session of memoryData.sessions.values()) {
      if (session.data && session.id !== sessionId) {
        session.data.tasks?.forEach(task => {
          if (!allTasks.find(t => t.id === task.id)) {
            allTasks.push(task);
          }
        });
        
        session.data.pendingTasks?.forEach(task => {
          if (!allPendingTasks.find(t => t.id === task.id)) {
            allPendingTasks.push(task);
          }
        });
      }
    }
    
    // Ajouter les nouvelles données du client
    clientData.tasks?.forEach(task => {
      if (!allTasks.find(t => t.id === task.id)) {
        allTasks.push(task);
      }
    });
    
    clientData.pendingTasks?.forEach(task => {
      if (!allPendingTasks.find(t => t.id === task.id)) {
        allPendingTasks.push(task);
      }
    });
    
    updateData();
    
    res.json({
      success: true,
      mergedData: {
        users: memoryData.users,
        tasks: allTasks,
        pendingTasks: allPendingTasks,
        timestamp: memoryData.lastUpdate
      },
      activeSessions: memoryData.sessions.size
    });
  } catch (error) {
    console.error('Erreur synchronisation:', error);
    res.status(500).json({ error: 'Erreur lors de la synchronisation' });
  }
});

// Polling avec données des sessions actives
app.get('/api/poll/:sessionId/:lastUpdate', (req, res) => {
  try {
    const { sessionId, lastUpdate } = req.params;
    const clientLastUpdate = parseInt(lastUpdate);
    
    // Mettre à jour l'activité de la session
    const session = memoryData.sessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
    }
    
    cleanupSessions();
    
    // Vérifier s'il y a des mises à jour depuis d'autres sessions
    let hasUpdates = memoryData.lastUpdate > clientLastUpdate;
    
    // Vérifier les mises à jour des autres sessions
    for (const otherSession of memoryData.sessions.values()) {
      if (otherSession.id !== sessionId && otherSession.lastActivity > clientLastUpdate) {
        hasUpdates = true;
        break;
      }
    }
    
    if (hasUpdates) {
      // Merger les données de toutes les sessions
      let mergedTasks = [];
      let mergedPendingTasks = [];
      
      for (const sessionData of memoryData.sessions.values()) {
        if (sessionData.data) {
          sessionData.data.tasks?.forEach(task => {
            if (!mergedTasks.find(t => t.id === task.id)) {
              mergedTasks.push(task);
            }
          });
          
          sessionData.data.pendingTasks?.forEach(task => {
            if (!mergedPendingTasks.find(t => t.id === task.id)) {
              mergedPendingTasks.push(task);
            }
          });
        }
      }
      
      res.json({
        updated: true,
        data: {
          users: memoryData.users,
          tasks: mergedTasks,
          pendingTasks: mergedPendingTasks
        },
        timestamp: memoryData.lastUpdate,
        activeSessions: memoryData.sessions.size
      });
    } else {
      res.json({
        updated: false,
        timestamp: memoryData.lastUpdate,
        activeSessions: memoryData.sessions.size
      });
    }
  } catch (error) {
    console.error('Erreur polling:', error);
    res.status(500).json({ error: 'Erreur polling' });
  }
});

// Les autres routes restent similaires mais utilisent maintenant les sessions
app.post('/api/tasks/propose', (req, res) => {
  try {
    const { title, description, proposedBy, sessionId } = req.body;
    
    if (!title || !proposedBy || !sessionId) {
      return res.status(400).json({ error: 'Titre, utilisateur et session requis' });
    }

    const newTask = {
      id: uuidv4(),
      title: title.trim(),
      description: description?.trim() || '',
      proposedBy,
      proposedAt: new Date().toISOString(),
      validations: [proposedBy],
      status: 'pending',
      sessionId // Tracer quelle session a créé la tâche
    };

    // Ajouter à la session du client
    let session = memoryData.sessions.get(sessionId);
    if (!session) {
      session = {
        id: sessionId,
        lastActivity: Date.now(),
        data: { tasks: [], pendingTasks: [] }
      };
      memoryData.sessions.set(sessionId, session);
    }
    
    if (!session.data.pendingTasks) {
      session.data.pendingTasks = [];
    }
    
    session.data.pendingTasks.push(newTask);
    session.lastActivity = Date.now();
    
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
    const { userId, sessionId } = req.body;
    
    if (!userId || !sessionId) {
      return res.status(400).json({ error: 'Utilisateur et session requis' });
    }

    // Chercher la tâche dans toutes les sessions
    let foundTask = null;
    let foundSession = null;
    
    for (const session of memoryData.sessions.values()) {
      if (session.data?.pendingTasks) {
        const taskIndex = session.data.pendingTasks.findIndex(task => task.id === taskId);
        if (taskIndex !== -1) {
          foundTask = session.data.pendingTasks[taskIndex];
          foundSession = session;
          break;
        }
      }
    }
    
    if (!foundTask) {
      return res.status(404).json({ error: 'Tâche non trouvée' });
    }
    
    // Ajouter la validation si pas déjà validée par cet utilisateur
    if (!foundTask.validations.includes(userId)) {
      foundTask.validations.push(userId);
    }
    
    // Si les deux utilisateurs ont validé, déplacer vers les tâches actives
    if (foundTask.validations.length >= 2) {
      const approvedTask = {
        ...foundTask,
        status: 'active',
        approvedAt: new Date().toISOString()
      };
      delete approvedTask.validations;
      
      // Supprimer de pendingTasks et ajouter à tasks
      foundSession.data.pendingTasks = foundSession.data.pendingTasks.filter(t => t.id !== taskId);
      if (!foundSession.data.tasks) {
        foundSession.data.tasks = [];
      }
      foundSession.data.tasks.push(approvedTask);
      
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
        task: foundTask,
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
    
    // Chercher et supprimer la tâche de toutes les sessions
    let rejectedTask = null;
    
    for (const session of memoryData.sessions.values()) {
      if (session.data?.pendingTasks) {
        const taskIndex = session.data.pendingTasks.findIndex(task => task.id === taskId);
        if (taskIndex !== -1) {
          rejectedTask = session.data.pendingTasks.splice(taskIndex, 1)[0];
          break;
        }
      }
    }
    
    if (!rejectedTask) {
      return res.status(404).json({ error: 'Tâche non trouvée' });
    }
    
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
    
    // Chercher la tâche dans toutes les sessions
    let foundTask = null;
    
    for (const session of memoryData.sessions.values()) {
      if (session.data?.tasks) {
        const task = session.data.tasks.find(task => task.id === taskId);
        if (task) {
          foundTask = task;
          break;
        }
      }
    }
    
    if (!foundTask) {
      return res.status(404).json({ error: 'Tâche non trouvée' });
    }

    foundTask.status = 'completed';
    foundTask.completedBy = userId;
    foundTask.completedAt = new Date().toISOString();
    
    updateData();
    
    res.json({
      success: true,
      message: 'Tâche terminée',
      task: foundTask,
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
    
    let deletedTask = null;
    
    // Chercher dans toutes les sessions
    for (const session of memoryData.sessions.values()) {
      if (session.data) {
        // Chercher dans les tâches actives
        if (session.data.tasks) {
          const taskIndex = session.data.tasks.findIndex(task => task.id === taskId);
          if (taskIndex !== -1) {
            deletedTask = session.data.tasks.splice(taskIndex, 1)[0];
            break;
          }
        }
        
        // Chercher dans les tâches en attente
        if (!deletedTask && session.data.pendingTasks) {
          const taskIndex = session.data.pendingTasks.findIndex(task => task.id === taskId);
          if (taskIndex !== -1) {
            deletedTask = session.data.pendingTasks.splice(taskIndex, 1)[0];
            break;
          }
        }
      }
    }
    
    if (!deletedTask) {
      return res.status(404).json({ error: 'Tâche non trouvée' });
    }
    
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

// Exporter toutes les données mergées
app.get('/api/export', (req, res) => {
  try {
    cleanupSessions();
    
    // Merger toutes les données
    let allTasks = [];
    let allPendingTasks = [];
    
    for (const session of memoryData.sessions.values()) {
      if (session.data) {
        session.data.tasks?.forEach(task => {
          if (!allTasks.find(t => t.id === task.id)) {
            allTasks.push(task);
          }
        });
        
        session.data.pendingTasks?.forEach(task => {
          if (!allPendingTasks.find(t => t.id === task.id)) {
            allPendingTasks.push(task);
          }
        });
      }
    }
    
    const exportData = {
      users: memoryData.users,
      tasks: allTasks,
      pendingTasks: allPendingTasks,
      exportedAt: new Date().toISOString(),
      version: '2.1'
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
    const { importedData, sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID requis' });
    }
    
    // Validation basique des données importées
    if (!importedData.tasks && !importedData.pendingTasks) {
      return res.status(400).json({ error: 'Format de données invalide' });
    }

    // Créer ou récupérer la session
    let session = memoryData.sessions.get(sessionId);
    if (!session) {
      session = {
        id: sessionId,
        lastActivity: Date.now(),
        data: { tasks: [], pendingTasks: [] }
      };
      memoryData.sessions.set(sessionId, session);
    }
    
    // Ajouter les données importées à la session
    if (importedData.tasks) {
      importedData.tasks.forEach(task => {
        if (!session.data.tasks.find(t => t.id === task.id)) {
          session.data.tasks.push(task);
        }
      });
    }

    if (importedData.pendingTasks) {
      importedData.pendingTasks.forEach(task => {
        if (!session.data.pendingTasks.find(t => t.id === task.id)) {
          session.data.pendingTasks.push(task);
        }
      });
    }
    
    session.lastActivity = Date.now();
    updateData();
    
    res.json({ 
      success: true,
      message: 'Import réussi',
      action: 'imported'
    });
  } catch (error) {
    console.error('Erreur import:', error);
    res.status(500).json({ error: 'Erreur lors de l\'import des données' });
  }
});

// Route de santé
app.get('/api/health', (req, res) => {
  cleanupSessions();
  
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    users: memoryData.users,
    activeSessions: memoryData.sessions.size,
    lastUpdate: memoryData.lastUpdate,
    serverTime: Date.now()
  });
});

// Route pour tester la connectivité
app.get('/api/ping', (req, res) => {
  res.json({ 
    pong: true, 
    timestamp: Date.now(),
    sessions: memoryData.sessions.size
  });
});

// Servir les fichiers statiques en local seulement
if (process.env.NODE_ENV !== 'production') {
  app.use('/', express.static(path.join(__dirname, '../public')));
  
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

// Démarrage local
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur Maya & Rayanha v2.1 démarré sur le port ${PORT}`);
    console.log(`📱 Interface mobile: http://localhost:${PORT}`);
  });
}