const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Server } = require('socket.io');
const http = require('http');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'tasks.json');

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Initialiser le fichier de données s'il n'existe pas
async function initializeDataFile() {
  try {
    await fs.ensureDir(path.dirname(DATA_FILE));
    const exists = await fs.pathExists(DATA_FILE);
    if (!exists) {
      const initialData = {
        users: ['Maya l\'abeille', 'Rayanha'],
        tasks: [],
        pendingTasks: []
      };
      await fs.writeJson(DATA_FILE, initialData);
    }
  } catch (error) {
    console.error('Erreur lors de l\'initialisation du fichier de données:', error);
  }
}

// Fonctions utilitaires pour gérer les données
async function readData() {
  try {
    return await fs.readJson(DATA_FILE);
  } catch (error) {
    console.error('Erreur lors de la lecture des données:', error);
    return { users: ['Maya l\'abeille', 'Rayanha'], tasks: [], pendingTasks: [] };
  }
}

async function writeData(data) {
  try {
    await fs.writeJson(DATA_FILE, data, { spaces: 2 });
  } catch (error) {
    console.error('Erreur lors de l\'écriture des données:', error);
  }
}

// Routes API

// Obtenir toutes les données
app.get('/api/data', async (req, res) => {
  try {
    const data = await readData();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la récupération des données' });
  }
});

// Ajouter une nouvelle tâche (en attente de validation)
app.post('/api/tasks/propose', async (req, res) => {
  try {
    const { title, description, proposedBy } = req.body;
    
    if (!title || !proposedBy) {
      return res.status(400).json({ error: 'Titre et utilisateur proposant requis' });
    }

    const data = await readData();
    const newTask = {
      id: uuidv4(),
      title: title.trim(),
      description: description?.trim() || '',
      proposedBy,
      proposedAt: new Date().toISOString(),
      validations: [proposedBy], // L'utilisateur qui propose valide automatiquement
      status: 'pending'
    };

    data.pendingTasks.push(newTask);
    await writeData(data);
    
    // Notifier tous les clients connectés
    io.emit('taskProposed', newTask);
    
    res.json(newTask);
  } catch (error) {
    console.error('Erreur lors de la proposition de tâche:', error);
    res.status(500).json({ error: 'Erreur lors de la proposition de la tâche' });
  }
});

// Valider une tâche
app.post('/api/tasks/:taskId/validate', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'ID utilisateur requis' });
    }

    const data = await readData();
    const taskIndex = data.pendingTasks.findIndex(task => task.id === taskId);
    
    if (taskIndex === -1) {
      return res.status(404).json({ error: 'Tâche non trouvée' });
    }

    const task = data.pendingTasks[taskIndex];
    
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
      
      data.tasks.push(approvedTask);
      data.pendingTasks.splice(taskIndex, 1);
      
      await writeData(data);
      
      // Notifier tous les clients
      io.emit('taskApproved', approvedTask);
      
      res.json({ message: 'Tâche approuvée et ajoutée', task: approvedTask });
    } else {
      await writeData(data);
      
      // Notifier la validation
      io.emit('taskValidated', { taskId, userId, validations: task.validations });
      
      res.json({ message: 'Validation ajoutée', task });
    }
  } catch (error) {
    console.error('Erreur lors de la validation:', error);
    res.status(500).json({ error: 'Erreur lors de la validation de la tâche' });
  }
});

// Rejeter une tâche
app.post('/api/tasks/:taskId/reject', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { userId } = req.body;
    
    const data = await readData();
    const taskIndex = data.pendingTasks.findIndex(task => task.id === taskId);
    
    if (taskIndex === -1) {
      return res.status(404).json({ error: 'Tâche non trouvée' });
    }

    const rejectedTask = data.pendingTasks[taskIndex];
    data.pendingTasks.splice(taskIndex, 1);
    
    await writeData(data);
    
    // Notifier tous les clients
    io.emit('taskRejected', { taskId, rejectedBy: userId });
    
    res.json({ message: 'Tâche rejetée', task: rejectedTask });
  } catch (error) {
    console.error('Erreur lors du rejet:', error);
    res.status(500).json({ error: 'Erreur lors du rejet de la tâche' });
  }
});

// Marquer une tâche comme terminée
app.post('/api/tasks/:taskId/complete', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { userId } = req.body;
    
    const data = await readData();
    const task = data.tasks.find(task => task.id === taskId);
    
    if (!task) {
      return res.status(404).json({ error: 'Tâche non trouvée' });
    }

    task.status = 'completed';
    task.completedBy = userId;
    task.completedAt = new Date().toISOString();
    
    await writeData(data);
    
    // Notifier tous les clients
    io.emit('taskCompleted', task);
    
    res.json(task);
  } catch (error) {
    console.error('Erreur lors de la complétion:', error);
    res.status(500).json({ error: 'Erreur lors de la complétion de la tâche' });
  }
});

// Supprimer une tâche
app.delete('/api/tasks/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { userId } = req.body;
    
    const data = await readData();
    
    // Chercher dans les tâches actives
    let taskIndex = data.tasks.findIndex(task => task.id === taskId);
    let taskType = 'active';
    
    // Si pas trouvée, chercher dans les tâches en attente
    if (taskIndex === -1) {
      taskIndex = data.pendingTasks.findIndex(task => task.id === taskId);
      taskType = 'pending';
    }
    
    if (taskIndex === -1) {
      return res.status(404).json({ error: 'Tâche non trouvée' });
    }

    const deletedTask = taskType === 'active' 
      ? data.tasks.splice(taskIndex, 1)[0]
      : data.pendingTasks.splice(taskIndex, 1)[0];
    
    await writeData(data);
    
    // Notifier tous les clients
    io.emit('taskDeleted', { taskId, deletedBy: userId });
    
    res.json({ message: 'Tâche supprimée', task: deletedTask });
  } catch (error) {
    console.error('Erreur lors de la suppression:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression de la tâche' });
  }
});

// Exporter les données
app.get('/api/export', async (req, res) => {
  try {
    const data = await readData();
    const exportData = {
      ...data,
      exportedAt: new Date().toISOString(),
      version: '1.0'
    };
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="tasks-export.json"');
    res.json(exportData);
  } catch (error) {
    console.error('Erreur lors de l\'export:', error);
    res.status(500).json({ error: 'Erreur lors de l\'export des données' });
  }
});

// Importer les données
app.post('/api/import', async (req, res) => {
  try {
    const importedData = req.body;
    
    // Validation basique des données importées
    if (!importedData.tasks || !importedData.users) {
      return res.status(400).json({ error: 'Format de données invalide' });
    }

    // Garder les utilisateurs existants et fusionner les tâches
    const currentData = await readData();
    const mergedData = {
      users: currentData.users,
      tasks: [...currentData.tasks, ...(importedData.tasks || [])],
      pendingTasks: [...currentData.pendingTasks, ...(importedData.pendingTasks || [])]
    };

    await writeData(mergedData);
    
    // Notifier tous les clients
    io.emit('dataImported', { message: 'Données importées avec succès' });
    
    res.json({ message: 'Import réussi', data: mergedData });
  } catch (error) {
    console.error('Erreur lors de l\'import:', error);
    res.status(500).json({ error: 'Erreur lors de l\'import des données' });
  }
});

// WebSocket pour la communication en temps réel
io.on('connection', (socket) => {
  console.log('Utilisateur connecté:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Utilisateur déconnecté:', socket.id);
  });
});

// Route par défaut - servir l'interface
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialiser et démarrer le serveur
async function startServer() {
  await initializeDataFile();
  
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur de gestion de tâches collaboratives démarré sur le port ${PORT}`);
    console.log(`📋 Interface disponible sur: http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);

module.exports = app;