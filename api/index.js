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

// Stockage persistant temporaire pour synchronisation
// Chaque session a son propre state temporaire
let globalState = {
  sessions: new Map(), // sessionId -> { data, lastUpdate, participants }
  messages: [], // Messages de synchronisation entre sessions
  lastCleanup: Date.now()
};

// Nettoyer les anciennes sessions (> 2 heures) et messages (> 10 minutes)
function cleanupGlobalState() {
  const now = Date.now();
  const twoHours = 2 * 60 * 60 * 1000;
  const tenMinutes = 10 * 60 * 1000;
  
  if (now - globalState.lastCleanup > 60000) { // Nettoyer toutes les minutes
    // Nettoyer les sessions inactives
    for (const [sessionId, session] of globalState.sessions) {
      if (now - session.lastUpdate > twoHours) {
        globalState.sessions.delete(sessionId);
      }
    }
    
    // Nettoyer les anciens messages
    globalState.messages = globalState.messages.filter(msg => 
      now - msg.timestamp < tenMinutes
    );
    
    globalState.lastCleanup = now;
  }
}

// Route de santé simple
app.get('/api/health', (req, res) => {
  cleanupGlobalState();
  res.json({ 
    status: 'ok',
    timestamp: Date.now(),
    sessions: globalState.sessions.size,
    messages: globalState.messages.length
  });
});

// Endpoint pour proposer une nouvelle tâche
app.post('/api/tasks/propose', (req, res) => {
  try {
    const { title, description, proposedBy, sessionId } = req.body;
    
    if (!title || !proposedBy || !sessionId) {
      return res.status(400).json({ error: 'Titre, utilisateur et session requis' });
    }

    const task = {
      id: uuidv4(),
      title: title.trim(),
      description: description ? description.trim() : '',
      proposedBy,
      proposedAt: new Date().toISOString(),
      validations: [],
      status: 'pending'
    };

    // Utiliser la session partagée pour Maya et Rayanha
    const useSharedSession = sessionId === globalState.SHARED_SESSION_ID || 
                            sessionId.includes('maya_rayanha');
    const targetSessionId = useSharedSession ? globalState.SHARED_SESSION_ID : sessionId;
    
    // Ajouter la tâche directement à la session partagée
    const session = globalState.sessions.get(targetSessionId);
    if (session) {
      session.data.pendingTasks.push(task);
      session.lastUpdate = Date.now();
    }
    
    // Créer un message de notification
    const notification = {
      id: uuidv4(),
      type: 'taskProposed',
      task,
      fromUser: proposedBy,
      sessionId: targetSessionId,
      timestamp: Date.now()
    };

    cleanupGlobalState();
    globalState.messages.push(notification);
    
    // Garder seulement les 100 derniers messages
    if (globalState.messages.length > 100) {
      globalState.messages = globalState.messages.slice(-100);
    }

    console.log(`✅ Nouvelle tâche proposée par ${proposedBy}: "${task.title}" (Session: ${targetSessionId})`);
    
    res.json({ 
      success: true, 
      message: 'Tâche proposée avec succès',
      task,
      messageId: notification.id,
      sessionId: targetSessionId
    });
  } catch (error) {
    console.error('Erreur proposition tâche:', error);
    res.status(500).json({ error: 'Erreur lors de la proposition' });
  }
});

// Endpoint pour valider une tâche
app.post('/api/tasks/:taskId/validate', (req, res) => {
  try {
    const { taskId } = req.params;
    const { userId, sessionId } = req.body;
    
    if (!userId || !sessionId || !taskId) {
      return res.status(400).json({ error: 'Utilisateur, session et tâche requis' });
    }

    // Utiliser la session partagée pour Maya et Rayanha
    const useSharedSession = sessionId === globalState.SHARED_SESSION_ID || 
                            sessionId.includes('maya_rayanha');
    const targetSessionId = useSharedSession ? globalState.SHARED_SESSION_ID : sessionId;
    
    cleanupGlobalState();
    
    // Récupérer la session et modifier directement les données
    const session = globalState.sessions.get(targetSessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session non trouvée' });
    }
    
    // Trouver la tâche dans pendingTasks
    const taskIndex = session.data.pendingTasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) {
      return res.status(404).json({ error: 'Tâche non trouvée dans les tâches en attente' });
    }
    
    const task = session.data.pendingTasks[taskIndex];
    
    // Vérifier si l'utilisateur a déjà validé
    if (!task.validations) task.validations = [];
    if (task.validations.includes(userId)) {
      return res.status(400).json({ error: 'Vous avez déjà validé cette tâche' });
    }
    
    // Ajouter la validation
    task.validations.push(userId);
    task.lastValidation = new Date().toISOString();
    
    let resultMessage = `Validation de ${userId} enregistrée`;
    let taskApproved = false;
    
    // Vérifier si les 2 utilisateurs ont validé (bipartite)
    if (task.validations.length >= 2) {
      // Déplacer vers les tâches actives
      session.data.pendingTasks.splice(taskIndex, 1);
      
      task.status = 'active';
      task.approvedAt = new Date().toISOString();
      session.data.tasks.push(task);
      
      resultMessage = `Tâche approuvée et activée: ${task.title}`;
      taskApproved = true;
      
      console.log(`✅ Tâche approuvée (bipartite): "${task.title}" par ${task.validations.join(' et ')}`);
    } else {
      console.log(`⏳ Validation partielle: "${task.title}" par ${userId} (${task.validations.length}/2)`);
    }
    
    // Mettre à jour la session
    session.lastUpdate = Date.now();
    globalState.sessions.set(targetSessionId, session);
    
    // Créer un message de notification
    const validation = {
      id: uuidv4(),
      type: taskApproved ? 'taskApproved' : 'taskValidated',
      taskId,
      validatedBy: userId,
      task: taskApproved ? task : null,
      validations: task.validations,
      approved: taskApproved,
      sessionId: targetSessionId,
      timestamp: Date.now()
    };

    globalState.messages.push(validation);

    res.json({ 
      success: true, 
      message: resultMessage,
      validation,
      taskApproved,
      validationsCount: task.validations.length
    });
  } catch (error) {
    console.error('Erreur validation:', error);
    res.status(500).json({ error: 'Erreur lors de la validation' });
  }
});

// Endpoint pour rejeter une tâche
app.post('/api/tasks/:taskId/reject', (req, res) => {
  try {
    const { taskId } = req.params;
    const { userId, sessionId } = req.body;
    
    if (!userId || !sessionId || !taskId) {
      return res.status(400).json({ error: 'Utilisateur, session et tâche requis' });
    }

    const useSharedSession = sessionId === globalState.SHARED_SESSION_ID || 
                            sessionId.includes('maya_rayanha');
    const targetSessionId = useSharedSession ? globalState.SHARED_SESSION_ID : sessionId;
    
    cleanupGlobalState();
    
    // Récupérer la session et supprimer la tâche des pendingTasks
    const session = globalState.sessions.get(targetSessionId);
    if (session) {
      const taskIndex = session.data.pendingTasks.findIndex(t => t.id === taskId);
      if (taskIndex !== -1) {
        const rejectedTask = session.data.pendingTasks[taskIndex];
        session.data.pendingTasks.splice(taskIndex, 1);
        session.lastUpdate = Date.now();
        
        console.log(`❌ Tâche rejetée et supprimée: "${rejectedTask.title}" par ${userId}`);
      }
    }
    
    const rejection = {
      id: uuidv4(),
      type: 'taskRejected',
      taskId,
      rejectedBy: userId,
      sessionId: targetSessionId,
      timestamp: Date.now()
    };

    globalState.messages.push(rejection);

    res.json({ 
      success: true, 
      message: 'Tâche rejetée et supprimée',
      rejection
    });
  } catch (error) {
    console.error('Erreur rejet:', error);
    res.status(500).json({ error: 'Erreur lors du rejet' });
  }
});

// Endpoint pour terminer une tâche
app.post('/api/tasks/:taskId/complete', (req, res) => {
  try {
    const { taskId } = req.params;
    const { userId, sessionId } = req.body;
    
    if (!userId || !sessionId || !taskId) {
      return res.status(400).json({ error: 'Utilisateur, session et tâche requis' });
    }

    const useSharedSession = sessionId === globalState.SHARED_SESSION_ID || 
                            sessionId.includes('maya_rayanha');
    const targetSessionId = useSharedSession ? globalState.SHARED_SESSION_ID : sessionId;
    
    const completion = {
      id: uuidv4(),
      type: 'taskCompleted',
      taskId,
      completedBy: userId,
      completedAt: new Date().toISOString(),
      sessionId: targetSessionId,
      timestamp: Date.now()
    };

    cleanupGlobalState();
    globalState.messages.push(completion);

    res.json({ 
      success: true, 
      message: 'Tâche terminée',
      completion
    });
  } catch (error) {
    console.error('Erreur completion:', error);
    res.status(500).json({ error: 'Erreur lors de la completion' });
  }
});

// Endpoint pour supprimer une tâche
app.delete('/api/tasks/:taskId', (req, res) => {
  try {
    const { taskId } = req.params;
    const { userId, sessionId } = req.body;
    
    if (!userId || !sessionId || !taskId) {
      return res.status(400).json({ error: 'Utilisateur, session et tâche requis' });
    }

    const useSharedSession = sessionId === globalState.SHARED_SESSION_ID || 
                            sessionId.includes('maya_rayanha');
    const targetSessionId = useSharedSession ? globalState.SHARED_SESSION_ID : sessionId;
    
    const deletion = {
      id: uuidv4(),
      type: 'taskDeleted',
      taskId,
      deletedBy: userId,
      sessionId: targetSessionId,
      timestamp: Date.now()
    };

    cleanupGlobalState();
    globalState.messages.push(deletion);

    res.json({ 
      success: true, 
      message: 'Tâche supprimée',
      deletion
    });
  } catch (error) {
    console.error('Erreur suppression:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

// Endpoint pour générer un ID unique (utile pour les tâches)
app.get('/api/uuid', (req, res) => {
  res.json({ 
    id: uuidv4(),
    timestamp: Date.now()
  });
});

// Endpoint pour synchroniser les données
app.post('/api/sync', (req, res) => {
  try {
    const { sessionId, clientData } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID requis' });
    }

    cleanupGlobalState();
    
    // Utiliser la session partagée si c'est Maya/Rayanha, sinon créer une session individuelle
    const useSharedSession = sessionId === globalState.SHARED_SESSION_ID || 
                            sessionId.includes('maya_rayanha');
    
    const actualSessionId = useSharedSession ? globalState.SHARED_SESSION_ID : sessionId;
    
    // Mettre à jour la session
    const session = globalState.sessions.get(actualSessionId) || {
      data: { users: ['Maya l\'abeille', 'Rayanha'], tasks: [], pendingTasks: [] },
      lastUpdate: Date.now(),
      participants: new Set(['Maya l\'abeille', 'Rayanha'])
    };
    
    // Merge les données client avec les données de session
    if (clientData) {
      session.data = {
        users: clientData.users || session.data.users,
        tasks: clientData.tasks || session.data.tasks,
        pendingTasks: clientData.pendingTasks || session.data.pendingTasks
      };
    }
    
    session.lastUpdate = Date.now();
    globalState.sessions.set(actualSessionId, session);
    
    console.log(`🔄 Sync pour session ${actualSessionId}: ${session.data.tasks.length} tâches, ${session.data.pendingTasks.length} en attente`);

    res.json({ 
      success: true,
      mergedData: {
        ...session.data,
        timestamp: session.lastUpdate
      }
    });
  } catch (error) {
    console.error('Erreur sync:', error);
    res.status(500).json({ error: 'Erreur lors de la synchronisation' });
  }
});

// Endpoint pour le polling des mises à jour
app.get('/api/poll/:sessionId/:since', (req, res) => {
  try {
    const { sessionId, since } = req.params;
    const sinceTimestamp = parseInt(since) || 0;
    
    cleanupGlobalState();
    
    // Pour la session partagée Maya/Rayanha, récupérer tous les messages pertinents
    const useSharedSession = sessionId === globalState.SHARED_SESSION_ID || 
                            sessionId.includes('maya_rayanha');
    
    const targetSessionId = useSharedSession ? globalState.SHARED_SESSION_ID : sessionId;
    
    const relevantMessages = globalState.messages.filter(msg => 
      msg.timestamp > sinceTimestamp && 
      (msg.sessionId === targetSessionId || msg.sessionId === globalState.SHARED_SESSION_ID || !msg.sessionId)
    );
    
    console.log(`📡 Polling session ${targetSessionId}: ${relevantMessages.length} nouveaux messages`);
    
    if (relevantMessages.length > 0) {
      res.json({
        updated: true,
        messages: relevantMessages,
        timestamp: Date.now()
      });
    } else {
      res.json({
        updated: false,
        timestamp: Date.now()
      });
    }
  } catch (error) {
    console.error('Erreur polling:', error);
    res.status(500).json({ error: 'Erreur lors du polling' });
  }
});

// Endpoint pour récupérer les données actuelles
app.get('/api/data', (req, res) => {
  try {
    const sessionId = req.query.sessionId;
    
    cleanupGlobalState();
    
    // Utiliser la session partagée pour Maya/Rayanha
    const useSharedSession = !sessionId || sessionId === globalState.SHARED_SESSION_ID || 
                            sessionId.includes('maya_rayanha');
    
    const targetSessionId = useSharedSession ? globalState.SHARED_SESSION_ID : sessionId;
    
    if (globalState.sessions.has(targetSessionId)) {
      const session = globalState.sessions.get(targetSessionId);
      console.log(`📖 Récupération données session ${targetSessionId}: ${session.data.tasks.length} tâches, ${session.data.pendingTasks.length} en attente`);
      res.json({
        ...session.data,
        timestamp: session.lastUpdate
      });
    } else {
      // Créer la session partagée si elle n'existe pas encore
      const newSession = {
        data: {
          users: ['Maya l\'abeille', 'Rayanha'],
          tasks: [],
          pendingTasks: []
        },
        lastUpdate: Date.now(),
        participants: new Set(['Maya l\'abeille', 'Rayanha'])
      };
      
      globalState.sessions.set(targetSessionId, newSession);
      
      console.log(`🆕 Création nouvelle session partagée ${targetSessionId}`);
      res.json({
        ...newSession.data,
        timestamp: newSession.lastUpdate
      });
    }
  } catch (error) {
    console.error('Erreur récupération données:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération' });
  }
});

// Endpoint pour envoyer des notifications personnalisées
app.post('/api/notify', (req, res) => {
  try {
    const { type, data, fromUser, toUser, sessionId } = req.body;
    
    if (!type || !fromUser) {
      return res.status(400).json({ error: 'Type et utilisateur requis' });
    }

    const notification = {
      id: uuidv4(),
      type, // 'taskProposed', 'taskValidated', 'taskApproved', etc.
      data,
      fromUser,
      toUser: toUser || 'all',
      sessionId: sessionId || 'global',
      timestamp: Date.now()
    };

    cleanupGlobalState();
    globalState.messages.push(notification);
    
    // Garder seulement les 100 derniers messages pour éviter l'engorgement
    if (globalState.messages.length > 100) {
      globalState.messages = globalState.messages.slice(-100);
    }

    res.json({ 
      success: true, 
      messageId: notification.id,
      totalMessages: globalState.messages.length
    });
  } catch (error) {
    console.error('Erreur notification:', error);
    res.status(500).json({ error: 'Erreur lors de l\'envoi de notification' });
  }
});

// Endpoint pour récupérer les messages depuis un timestamp
app.get('/api/messages/:since', (req, res) => {
  try {
    const since = parseInt(req.params.since) || 0;
    const sessionId = req.query.sessionId;
    
    cleanupGlobalState();
    
    // Filtrer les messages plus récents que 'since' et pour la session appropriée
    const relevantMessages = globalState.messages.filter(msg => 
      msg.timestamp > since && 
      (!sessionId || msg.sessionId === sessionId || msg.sessionId === 'global')
    );

    res.json({
      messages: relevantMessages,
      timestamp: Date.now(),
      totalMessages: globalState.messages.length
    });
  } catch (error) {
    console.error('Erreur récupération messages:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération' });
  }
});

// Simple ping
app.get('/api/ping', (req, res) => {
  res.json({ 
    pong: true, 
    timestamp: Date.now()
  });
});

// Endpoint pour l'import de données
app.post('/api/import', (req, res) => {
  try {
    const { importedData, sessionId } = req.body;
    
    if (!importedData || !sessionId) {
      return res.status(400).json({ error: 'Données et session requis' });
    }

    // Valider le format des données importées
    if (!importedData.users || !Array.isArray(importedData.tasks)) {
      return res.status(400).json({ error: 'Format de données invalide' });
    }

    cleanupGlobalState();
    
    // Mettre à jour la session avec les données importées
    const session = globalState.sessions.get(sessionId) || {
      data: { users: ['Maya l\'abeille', 'Rayanha'], tasks: [], pendingTasks: [] },
      lastUpdate: Date.now(),
      participants: new Set()
    };
    
    // Merger les données importées
    session.data = {
      users: importedData.users || session.data.users,
      tasks: [...(session.data.tasks || []), ...(importedData.tasks || [])],
      pendingTasks: [...(session.data.pendingTasks || []), ...(importedData.pendingTasks || [])]
    };
    
    session.lastUpdate = Date.now();
    globalState.sessions.set(sessionId, session);

    res.json({ 
      success: true, 
      message: `Import réussi: ${importedData.tasks?.length || 0} tâches importées`
    });
  } catch (error) {
    console.error('Erreur import:', error);
    res.status(500).json({ error: 'Erreur lors de l\'import' });
  }
});

// Endpoint pour l'export des données
app.get('/api/export', (req, res) => {
  try {
    const sessionId = req.query.sessionId;
    
    cleanupGlobalState();
    
    let exportData = {
      users: ['Maya l\'abeille', 'Rayanha'],
      tasks: [],
      pendingTasks: [],
      exportedAt: new Date().toISOString(),
      version: '3.1',
      sessionId: sessionId || 'template'
    };
    
    // Si on a une session, exporter ses données
    if (sessionId && globalState.sessions.has(sessionId)) {
      const session = globalState.sessions.get(sessionId);
      exportData = {
        ...exportData,
        ...session.data
      };
    }
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="maya-rayanha-${sessionId || 'template'}-${new Date().toISOString().split('T')[0]}.json"`);
    res.json(exportData);
  } catch (error) {
    console.error('Erreur export:', error);
    res.status(500).json({ error: 'Erreur lors de l\'export' });
  }
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
    console.log(`🚀 Serveur Maya & Rayanha v3.0 démarré sur le port ${PORT}`);
    console.log(`📱 Interface mobile: http://localhost:${PORT}`);
  });
}