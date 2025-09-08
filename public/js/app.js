// Application Collaborative Maya & Rayanha - Version Persistante Robuste
class MobileTaskManager {
    constructor() {
        this.currentUser = 'Maya l\'abeille';
        this.sessionId = this.generateSessionId();
        this.data = {
            users: ['Maya l\'abeille', 'Rayanha'],
            tasks: [],
            pendingTasks: []
        };
        this.lastUpdate = 0;
        this.isLoading = false;
        this.pollingInterval = null;
        this.syncInterval = null;
        this.db = null; // IndexedDB instance
        this.storageReady = false;
        
        this.init();
    }
    
    // Générer un ID de session partagée fixe pour Maya et Rayanha
    generateSessionId() {
        const SHARED_SESSION_ID = 'maya_rayanha_shared_session_v3';
        localStorage.setItem('maya_rayanha_session_id', SHARED_SESSION_ID);
        return SHARED_SESSION_ID;
    }

    // Initialisation de l'application
    async init() {
        console.log('🚀 Initialisation Maya & Rayanha v3.1 - Session Partagée:', this.sessionId);
        console.log('👥 Session collaborative pour Maya et Rayanha');
        
        this.showLoading(true);
        this.setupEventListeners();
        
        try {
            await this.initStorage();
            await this.loadLocalData();
            await this.loadData();
            this.startPolling();
            this.startAutoSync();
            this.showNotification('success', 'Connecté', `Application collaborative prête !`);
        } catch (error) {
            console.error('❌ Erreur initialisation:', error);
            this.showNotification('warning', 'Mode hors ligne', 'Synchronisation en attente...');
            await this.loadLocalData();
            this.renderAllTasks();
            this.updateBadges();
        } finally {
            this.showLoading(false);
        }
    }

    // Configuration des écouteurs d'événements optimisés pour mobile
    setupEventListeners() {
        const userSelector = document.getElementById('currentUser');
        if (userSelector) {
            userSelector.addEventListener('change', (e) => {
                this.currentUser = e.target.value;
                this.showNotification('info', 'Utilisateur changé', `Vous êtes maintenant ${this.currentUser}`);
                this.renderAllTasks();
            });
        }

        document.querySelectorAll('.nav-tab').forEach(tab => {
            this.addTouchHandler(tab, () => {
                const targetTab = tab.dataset.tab;
                this.switchTab(targetTab);
            });
        });

        const addTaskBtn = document.getElementById('addTaskBtn');
        if (addTaskBtn) {
            this.addTouchHandler(addTaskBtn, () => {
                this.openTaskModal();
            });
        }

        const taskForm = document.getElementById('taskForm');
        if (taskForm) {
            taskForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.submitNewTask();
            });
        }

        const closeModal = document.getElementById('closeModal');
        const cancelTask = document.getElementById('cancelTask');
        const taskModal = document.getElementById('taskModal');
        
        if (closeModal) this.addTouchHandler(closeModal, () => this.closeTaskModal());
        if (cancelTask) this.addTouchHandler(cancelTask, () => this.closeTaskModal());
        
        if (taskModal) {
            taskModal.addEventListener('click', (e) => {
                if (e.target === taskModal || e.target.classList.contains('modal-backdrop')) {
                    this.closeTaskModal();
                }
            });
        }

        const exportBtn = document.getElementById('exportBtn');
        const importBtn = document.getElementById('importBtn');
        const importFile = document.getElementById('importFile');
        
        if (exportBtn) this.addTouchHandler(exportBtn, () => this.exportData());
        if (importBtn) this.addTouchHandler(importBtn, () => importFile && importFile.click());
        
        if (importFile) {
            importFile.addEventListener('change', (e) => {
                if (e.target.files[0]) this.importData(e.target.files[0]);
            });
        }

        this.handleVirtualKeyboard();
        
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.stopPolling();
                this.stopAutoSync();
            } else {
                this.startPolling();
                this.startAutoSync();
                this.checkForUpdates();
            }
        });
        
        window.addEventListener('beforeunload', () => {
            try {
                const dataToSave = { ...this.data, sessionId: this.sessionId, savedAt: Date.now(), version: '3.1' };
                localStorage.setItem('maya_rayanha_data', JSON.stringify(dataToSave));
                localStorage.setItem('maya_rayanha_emergency_backup', JSON.stringify({
                    tasks: this.data.tasks,
                    pendingTasks: this.data.pendingTasks,
                    timestamp: Date.now()
                }));
            } catch (error) {
                console.error('❌ Erreur sauvegarde d\'urgence:', error);
            }
        });
        
        setInterval(() => this.saveLocalData(), 30000);
    }

    // Ajouter un gestionnaire d'événement touch-friendly
    addTouchHandler(element, handler) {
        if (!element) return;
        
        let touchStarted = false;
        
        element.addEventListener('touchstart', () => {
            touchStarted = true;
            element.style.transform = 'scale(0.95)';
        }, { passive: true });
        
        element.addEventListener('touchend', (e) => {
            if (touchStarted) {
                e.preventDefault();
                element.style.transform = '';
                handler(e);
                touchStarted = false;
            }
        }, { passive: false });
        
        element.addEventListener('touchcancel', () => {
            element.style.transform = '';
            touchStarted = false;
        }, { passive: true });
        
        element.addEventListener('click', (e) => {
            if (!touchStarted) handler(e);
        });
    }

    // Gestion du clavier virtuel mobile
    handleVirtualKeyboard() {
        const inputs = document.querySelectorAll('input, textarea');
        inputs.forEach(input => {
            input.addEventListener('focus', () => {
                setTimeout(() => input.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
            });
        });
    }

    // Initialiser le système de stockage
    async initStorage() {
        try {
            await this.initIndexedDB();
            console.log('💾 Storage IndexedDB initialisé');
        } catch (error) {
            console.warn('⚠️ Fallback vers localStorage:', error);
            this.storageReady = true;
        }
    }
    
    // Initialiser IndexedDB
    async initIndexedDB() {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) return reject(new Error('IndexedDB non supporté'));
            
            const request = indexedDB.open('MayaRayanhaDB', 2);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                this.storageReady = true;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('tasks')) {
                    const taskStore = db.createObjectStore('tasks', { keyPath: 'id' });
                    taskStore.createIndex('status', 'status', { unique: false });
                    taskStore.createIndex('proposedBy', 'proposedBy', { unique: false });
                }
                if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'sessionId' });
                if (!db.objectStoreNames.contains('metadata')) db.createObjectStore('metadata', { keyPath: 'key' });
            };
        });
    }
    
    // Sauvegarder les données
    async saveLocalData() {
        const dataToSave = { ...this.data, sessionId: this.sessionId, savedAt: Date.now(), version: '3.1' };
        try {
            if (this.db && this.storageReady) {
                await this.saveToIndexedDB(dataToSave);
                console.log('💾 Données sauvegardées dans IndexedDB');
            } else {
                this.saveToLocalStorage(dataToSave);
                console.log('💾 Données sauvegardées dans localStorage');
            }
        } catch (error) {
            console.error('❌ Erreur sauvegarde:', error);
            this.saveToLocalStorage(dataToSave);
        }
    }
    
    // Sauvegarder dans IndexedDB
    async saveToIndexedDB(data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['sessions', 'tasks', 'metadata'], 'readwrite');
            transaction.onerror = () => reject(transaction.error);
            transaction.oncomplete = () => resolve();
            
            transaction.objectStore('sessions').put({ sessionId: this.sessionId, data: data, lastUpdate: Date.now() });
            
            const taskStore = transaction.objectStore('tasks');
            taskStore.clear();
            [...data.tasks, ...data.pendingTasks].forEach(task => taskStore.put(task));
            
            transaction.objectStore('metadata').put({ key: 'lastSave', value: Date.now(), sessionId: this.sessionId });
        });
    }
    
    // Sauvegarder dans localStorage
    saveToLocalStorage(data) {
        try {
            localStorage.setItem('maya_rayanha_data', JSON.stringify(data));
            localStorage.setItem('maya_rayanha_tasks_backup', JSON.stringify({
                tasks: data.tasks,
                pendingTasks: data.pendingTasks,
                timestamp: Date.now()
            }));
        } catch (error) {
            console.error('❌ Erreur localStorage:', error);
            this.cleanupLocalStorage();
        }
    }
    
    // Nettoyer localStorage
    cleanupLocalStorage() {
        try {
            const essentialKeys = ['maya_rayanha_data', 'maya_rayanha_session_id', 'maya_rayanha_tasks_backup'];
            Object.keys(localStorage).forEach(key => {
                if (!essentialKeys.includes(key) && !key.startsWith('maya_rayanha_')) localStorage.removeItem(key);
            });
            console.log('🧹 localStorage nettoyé');
        } catch (error) {
            console.error('❌ Erreur nettoyage localStorage:', error);
        }
    }

    // Charger les données locales
    async loadLocalData() {
        try {
            let loadedData = null;
            if (this.db && this.storageReady) {
                loadedData = await this.loadFromIndexedDB();
                console.log('📱 Données chargées depuis IndexedDB');
            }
            if (!loadedData) {
                loadedData = this.loadFromLocalStorage();
                console.log('📱 Données chargées depuis localStorage');
            }
            
            if (loadedData) {
                this.data = {
                    users: loadedData.users || this.data.users,
                    tasks: Array.isArray(loadedData.tasks) ? loadedData.tasks : [],
                    pendingTasks: Array.isArray(loadedData.pendingTasks) ? loadedData.pendingTasks : []
                };
                this.renderAllTasks();
                this.updateBadges();
            }
        } catch (error) {
            console.error('❌ Erreur chargement local:', error);
            this.data = { users: ['Maya l\'abeille', 'Rayanha'], tasks: [], pendingTasks: [] };
        }
    }
    
    // Charger depuis IndexedDB
    async loadFromIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = this.db.transaction(['sessions'], 'readonly').objectStore('sessions').get(this.sessionId);
            request.onsuccess = () => {
                const result = request.result;
                if (result && result.data) {
                    const weekInMs = 7 * 24 * 60 * 60 * 1000;
                    resolve(Date.now() - result.data.savedAt < weekInMs ? result.data : null);
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }
    
    // Charger depuis localStorage
    loadFromLocalStorage() {
        try {
            const savedData = localStorage.getItem('maya_rayanha_data');
            if (savedData) {
                const parsed = JSON.parse(savedData);
                const maxAge = 48 * 60 * 60 * 1000;
                if (parsed.savedAt && Date.now() - parsed.savedAt < maxAge) return parsed;
            }
            
            const backupData = localStorage.getItem('maya_rayanha_tasks_backup');
            if (backupData) {
                const backup = JSON.parse(backupData);
                const maxAge = 24 * 60 * 60 * 1000;
                if (backup.timestamp && Date.now() - backup.timestamp < maxAge) {
                    return {
                        users: ['Maya l\'abeille', 'Rayanha'],
                        tasks: backup.tasks || [],
                        pendingTasks: backup.pendingTasks || [],
                        savedAt: backup.timestamp
                    };
                }
            }
            return null;
        } catch (error) {
            console.error('❌ Erreur chargement localStorage:', error);
            return null;
        }
    }

    // Démarrer la synchronisation automatique
    startAutoSync() {
        if (this.syncInterval) return;
        this.syncInterval = setInterval(() => this.syncWithServer(), 5000);
        console.log('🔄 Auto-sync démarré');
    }

    // Arrêter la synchronisation
    stopAutoSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
            console.log('⏹ Auto-sync arrêté');
        }
    }

    // Synchroniser avec le serveur
    async syncWithServer() {
        if (this.isLoading) return;
        try {
            const response = await fetch('/api/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: this.sessionId, clientData: this.data })
            });
            
            if (response.ok) {
                const result = await response.json();
                if (result.success && result.mergedData) {
                    const hasChanges = JSON.stringify(this.data) !== JSON.stringify(result.mergedData);
                    if (hasChanges) {
                        this.data = result.mergedData;
                        this.lastUpdate = result.mergedData.timestamp;
                        this.renderAllTasks();
                        this.updateBadges();
                        await this.saveLocalData();
                        console.log('📡 Données synchronisées');
                    }
                }
                this.updateConnectionStatus(true);
            }
        } catch (error) {
            console.error('❌ Erreur synchronisation:', error);
            this.updateConnectionStatus(false);
            await this.saveLocalData();
        }
    }

    // Démarrer le polling
    startPolling() {
        if (this.pollingInterval) return;
        this.pollingInterval = setInterval(() => this.checkForUpdates(), 4000);
        console.log('🔄 Polling démarré');
    }

    // Arrêter le polling
    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
            console.log('⏹ Polling arrêté');
        }
    }

    // Vérifier les mises à jour
    async checkForUpdates() {
        if (this.isLoading) return;
        try {
            const response = await fetch(`/api/poll/${this.sessionId}/${this.lastUpdate}`);
            if (response.ok) {
                const result = await response.json();
                if (result.updated && result.messages) {
                    console.log('📱 Nouvelles mises à jour reçues via polling:', result.messages.length);
                    await this.processMessages(result.messages);
                    this.lastUpdate = result.timestamp;
                    this.updateConnectionStatus(true);
                    await this.saveLocalData();
                }
            }
        } catch (error) {
            console.error('❌ Erreur polling:', error);
            this.updateConnectionStatus(false);
        }
    }
    
    // Traiter les messages de synchronisation
    async processMessages(messages) {
        let hasChanges = false;
        for (const message of messages) {
            try {
                switch (message.type) {
                    case 'taskProposed':
                        if (message.task && !this.data.pendingTasks.find(t => t.id === message.task.id)) {
                            this.data.pendingTasks.push(message.task);
                            hasChanges = true;
                            if (message.task.proposedBy !== this.currentUser) {
                                this.showNotification('info', 'Nouvelle tâche', `${message.task.proposedBy} a proposé: ${message.task.title}`);
                                this.vibrate();
                            }
                        }
                        break;
                    case 'taskValidated':
                        const taskToValidate = this.data.pendingTasks.find(t => t.id === message.taskId);
                        if (taskToValidate && message.validations) {
                            taskToValidate.validations = message.validations;
                            hasChanges = true;
                            this.showNotification('info', 'Validation', `${message.validatedBy} a validé: ${taskToValidate.title} (${message.validations.length}/2)`);
                            if (message.validatedBy !== this.currentUser) this.vibrate();
                        }
                        break;
                    case 'taskApproved':
                        const pendingTask = this.data.pendingTasks.find(t => t.id === message.taskId);
                        if (pendingTask) {
                            this.data.pendingTasks = this.data.pendingTasks.filter(t => t.id !== message.taskId);
                            if (message.task) {
                                this.data.tasks.push(message.task);
                                hasChanges = true;
                                this.showNotification('success', 'Tâche approuvée !', `${message.task.title} est maintenant active`);
                                this.vibrate([200, 100, 200]);
                                console.log(`✅ Tâche ${message.task.title} transférée vers Activités après validation bipartite`);
                            }
                        }
                        break;
                    case 'taskRejected':
                        this.data.pendingTasks = this.data.pendingTasks.filter(t => t.id !== message.taskId);
                        hasChanges = true;
                        this.showNotification('warning', 'Tâche rejetée', `Tâche rejetée par ${message.rejectedBy}`);
                        break;
                    case 'taskCompleted':
                        const taskToComplete = this.data.tasks.find(t => t.id === message.taskId);
                        if (taskToComplete) {
                            taskToComplete.status = 'completed';
                            taskToComplete.completedBy = message.completedBy;
                            taskToComplete.completedAt = message.completedAt;
                            hasChanges = true;
                            this.showNotification('success', 'Tâche terminée', `${message.completedBy} a terminé: ${taskToComplete.title}`);
                        }
                        break;
                    case 'taskDeleted':
                        this.data.tasks = this.data.tasks.filter(t => t.id !== message.taskId);
                        this.data.pendingTasks = this.data.pendingTasks.filter(t => t.id !== message.taskId);
                        hasChanges = true;
                        this.showNotification('info', 'Tâche supprimée', `Tâche supprimée par ${message.deletedBy}`);
                        break;
                }
            } catch (error) {
                console.error('❌ Erreur traitement message:', message, error);
            }
        }
        
        if (hasChanges) {
            this.renderAllTasks();
            this.updateBadges();
            this.vibrate();
        }
    }

    // Charger les données depuis l'API
    async loadData() {
        try {
            const response = await fetch(`/api/data?sessionId=${this.sessionId}`);
            if (response.ok) {
                const result = await response.json();
                const mergedData = this.mergeData(this.data, result);
                this.data = mergedData;
                this.lastUpdate = result.timestamp || Date.now();
                this.renderAllTasks();
                this.updateBadges();
                this.updateConnectionStatus(true);
                await this.saveLocalData();
            } else {
                throw new Error('Erreur de chargement des données');
            }
        } catch (error) {
            console.error('❌ Erreur lors du chargement:', error);
            this.updateConnectionStatus(false);
            throw error;
        }
    }
    
    // Merger les données locales et serveur
    mergeData(localData, serverData) {
        const merged = {
            users: serverData.users || localData.users,
            tasks: [...(serverData.tasks || [])],
            pendingTasks: [...(serverData.pendingTasks || [])]
        };
        const serverTaskIds = new Set([...merged.tasks, ...merged.pendingTasks].map(t => t.id));
        localData.tasks.forEach(task => !serverTaskIds.has(task.id) && merged.tasks.push(task));
        localData.pendingTasks.forEach(task => !serverTaskIds.has(task.id) && merged.pendingTasks.push(task));
        return merged;
    }

    // Changer d'onglet
    switchTab(tabName) {
        document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        document.getElementById(`${tabName}-content`).classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Rendu de toutes les tâches
    renderAllTasks() {
        this.renderActiveTasks();
        this.renderPendingTasks();
        this.renderCompletedTasks();
    }

    // Rendu des tâches actives
    renderActiveTasks() {
        const container = document.getElementById('activeTasks');
        const emptyState = document.getElementById('activeEmpty');
        if (!container || !emptyState) return;
        
        const activeTasks = this.data.tasks.filter(task => task.status !== 'completed');
        if (activeTasks.length === 0) {
            container.innerHTML = '';
            emptyState.style.display = 'block';
        } else {
            emptyState.style.display = 'none';
            container.innerHTML = activeTasks.map(task => this.createTaskCard(task, 'active')).join('');
            this.bindTaskActions(container);
        }
    }

    // Rendu des tâches en attente
    renderPendingTasks() {
        const container = document.getElementById('pendingTasks');
        const emptyState = document.getElementById('pendingEmpty');
        if (!container || !emptyState) return;

        if (this.data.pendingTasks.length === 0) {
            container.innerHTML = '';
            emptyState.style.display = 'block';
        } else {
            emptyState.style.display = 'none';
            container.innerHTML = this.data.pendingTasks.map(task => this.createTaskCard(task, 'pending')).join('');
            this.bindTaskActions(container);
        }
    }

    // Rendu des tâches terminées
    renderCompletedTasks() {
        const container = document.getElementById('completedTasks');
        const emptyState = document.getElementById('completedEmpty');
        if (!container || !emptyState) return;
        
        const completedTasks = this.data.tasks.filter(task => task.status === 'completed');
        if (completedTasks.length === 0) {
            container.innerHTML = '';
            emptyState.style.display = 'block';
        } else {
            emptyState.style.display = 'none';
            container.innerHTML = completedTasks.map(task => this.createTaskCard(task, 'completed')).join('');
            this.bindTaskActions(container);
        }
    }

    // Créer une carte de tâche
    createTaskCard(task, type) {
        const isCurrentUserTask = type === 'pending' && task.proposedBy === this.currentUser;
        const hasValidated = type === 'pending' && task.validations && task.validations.includes(this.currentUser);
        const needsValidation = type === 'pending' && !hasValidated;
        const validationCount = task.validations ? task.validations.length : 0;

        let actions = '';
        let validationStatus = '';

        if (type === 'pending') {
            validationStatus = `<div class="validation-status"><i class="fas fa-users"></i> Validations: ${validationCount}/2 ${task.validations ? `(${task.validations.join(', ')})` : ''}</div>`;
            if (needsValidation && !isCurrentUserTask) {
                actions = `<button class="task-btn task-btn-success" data-action="validate" data-task-id="${task.id}"><i class="fas fa-check"></i> Valider</button> <button class="task-btn task-btn-danger" data-action="reject" data-task-id="${task.id}"><i class="fas fa-times"></i> Rejeter</button>`;
            } else if (hasValidated) {
                actions = `<button class="task-btn task-btn-secondary" disabled><i class="fas fa-check"></i> Validée</button>`;
            } else if (isCurrentUserTask) {
                actions = `<button class="task-btn task-btn-secondary" disabled><i class="fas fa-clock"></i> En attente</button> <button class="task-btn task-btn-danger" data-action="delete" data-task-id="${task.id}"><i class="fas fa-trash"></i> Supprimer</button>`;
            }
        } else if (type === 'active') {
            actions = `<button class="task-btn task-btn-success" data-action="complete" data-task-id="${task.id}"><i class="fas fa-check"></i> Terminer</button> <button class="task-btn task-btn-danger" data-action="delete" data-task-id="${task.id}"><i class="fas fa-trash"></i> Supprimer</button>`;
        } else if (type === 'completed') {
            actions = `<button class="task-btn task-btn-danger" data-action="delete" data-task-id="${task.id}"><i class="fas fa-trash"></i> Supprimer</button>`;
        }

        const dateInfo = type === 'pending' ? `Proposée par ${task.proposedBy} le ${this.formatDate(task.proposedAt)}`
                       : type === 'completed' ? `Terminée par ${task.completedBy} le ${this.formatDate(task.completedAt)}`
                       : `Approuvée le ${this.formatDate(task.approvedAt)}`;

        return `<div class="task-card ${type}">
                    <div class="task-header"><h3 class="task-title">${this.escapeHtml(task.title)}</h3></div>
                    ${task.description ? `<div class="task-description">${this.escapeHtml(task.description)}</div>` : ''}
                    ${validationStatus}
                    <div class="task-meta">${dateInfo}</div>
                    <div class="task-actions">${actions}</div>
                </div>`;
    }

    // Lier les actions des tâches
    bindTaskActions(container) {
        container.querySelectorAll('[data-action]').forEach(button => {
            this.addTouchHandler(button, async () => {
                const action = button.dataset.action;
                const taskId = button.dataset.taskId;
                button.disabled = true;
                try {
                    switch (action) {
                        case 'validate': await this.validateTask(taskId); break;
                        case 'reject': await this.rejectTask(taskId); break;
                        case 'complete': await this.completeTask(taskId); break;
                        case 'delete': await this.deleteTask(taskId); break;
                    }
                } finally {
                    button.disabled = false;
                }
            });
        });
    }

    // Gestion des modales
    openTaskModal() {
        const modal = document.getElementById('taskModal');
        if (modal) {
            modal.classList.add('show');
            const titleInput = document.getElementById('taskTitle');
            if (titleInput) setTimeout(() => titleInput.focus(), 100);
        }
    }

    closeTaskModal() {
        const modal = document.getElementById('taskModal');
        const form = document.getElementById('taskForm');
        if (modal) modal.classList.remove('show');
        if (form) form.reset();
    }

    // Soumettre une nouvelle tâche
    async submitNewTask() {
        const titleInput = document.getElementById('taskTitle');
        const descriptionInput = document.getElementById('taskDescription');
        if (!titleInput) return;
        
        const title = titleInput.value.trim();
        const description = descriptionInput ? descriptionInput.value.trim() : '';
        if (!title) {
            this.showNotification('warning', 'Erreur', 'Le titre de la tâche est requis');
            return;
        }

        this.showLoading(true);
        try {
            const response = await fetch('/api/tasks/propose', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, description, proposedBy: this.currentUser, sessionId: this.sessionId })
            });
            const result = await response.json();

            if (response.ok && result.success) {
                this.closeTaskModal();
                this.showNotification('success', 'Tâche proposée', result.message);
                this.vibrate();
                this.data.pendingTasks.push(result.task);
                this.renderAllTasks();
                this.updateBadges();
                await this.saveLocalData();
                await this.syncWithServer();
            } else {
                this.showNotification('error', 'Erreur', result.error || 'Erreur lors de la proposition');
            }
        } catch (error) {
            console.error('❌ Erreur proposition:', error);
            this.showNotification('error', 'Erreur', 'Erreur de connexion');
        } finally {
            this.showLoading(false);
        }
    }

    // ===== SECTION CORRIGÉE =====
    async validateTask(taskId) {
        // --- MISE À JOUR OPTIMISTE (VERSION 2) ---
        const pendingTaskIndex = this.data.pendingTasks.findIndex(t => t.id === taskId);
        
        if (pendingTaskIndex > -1) {
            const taskToMove = this.data.pendingTasks[pendingTaskIndex];
    
            // La logique clé : l'utilisateur actuel DOIT être différent de celui qui a proposé.
            if (taskToMove.proposedBy !== this.currentUser) {
                console.log(`✅ Approbation optimiste par ${this.currentUser}. Déplacement vers 'Actives'.`);
    
                // 1. On supprime la tâche de la liste "en attente"
                this.data.pendingTasks.splice(pendingTaskIndex, 1);
    
                // 2. On met à jour le statut et les informations de la tâche
                taskToMove.status = 'active'; // Statut pour les tâches actives
                taskToMove.approvedAt = new Date().toISOString();
                if (!taskToMove.validations) taskToMove.validations = [];
                taskToMove.validations.push(this.currentUser);
                
                // 3. On ajoute la tâche à la liste des tâches actives
                this.data.tasks.push(taskToMove);
    
                // 4. On met à jour TOUTE l'interface utilisateur IMMÉDIATEMENT
                this.renderAllTasks();
                this.updateBadges();
                this.showNotification('success', 'Tâche Approuvée !', `${taskToMove.title} est maintenant active.`);
                this.vibrate();
    
            } else {
                // L'utilisateur ne peut pas valider sa propre tâche, on l'informe et on arrête.
                this.showNotification('warning', 'Action impossible', 'Vous ne pouvez pas valider votre propre proposition.');
                return; // On arrête la fonction ici
            }
        }
        // --- FIN DE LA MISE À JOUR OPTIMISTE ---
    
        // On envoie la requête au serveur pour enregistrer le changement de manière permanente
        await this.performTaskAction(`/api/tasks/${taskId}/validate`, 'POST', { userId: this.currentUser });
    }
    
    async completeTask(taskId) {
        // --- MISE À JOUR OPTIMISTE BONUS ---
        const activeTaskIndex = this.data.tasks.findIndex(t => t.id === taskId && t.status !== 'completed');
        if (activeTaskIndex > -1) {
            const taskToComplete = this.data.tasks[activeTaskIndex];
            
            console.log(`✅ Tâche terminée (optimiste) par ${this.currentUser}.`);
            
            // On met à jour le statut localement
            taskToComplete.status = 'completed';
            taskToComplete.completedBy = this.currentUser;
            taskToComplete.completedAt = new Date().toISOString();
            
            // On met à jour l'interface IMMÉDIATEMENT
            this.renderAllTasks();
            this.updateBadges();
            this.showNotification('success', 'Tâche Terminée !', `Vous avez terminé : ${taskToComplete.title}`);
            this.vibrate();
        }
        // --- FIN ---
    
        // On envoie la requête au serveur pour enregistrer
        await this.performTaskAction(`/api/tasks/${taskId}/complete`, 'POST', { userId: this.currentUser });
    }
    // ===========================

    async rejectTask(taskId) {
        if (!confirm('Rejeter cette tâche ?')) return;
        await this.performTaskAction(`/api/tasks/${taskId}/reject`, 'POST', { userId: this.currentUser });
    }

    async deleteTask(taskId) {
        if (!confirm('Supprimer cette tâche définitivement ?')) return;
        await this.performTaskAction(`/api/tasks/${taskId}`, 'DELETE', { userId: this.currentUser });
    }

    async performTaskAction(url, method, body) {
        this.showLoading(true);
        const bodyWithSession = { ...body, sessionId: this.sessionId };
        
        try {
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bodyWithSession)
            });
            const result = await response.json();
            if (response.ok && result.success) {
                this.showNotification('success', 'Action réussie', result.message);
                this.vibrate();
                await this.syncWithServer();
            } else {
                this.showNotification('error', 'Erreur', result.error || 'Erreur lors de l\'action');
            }
        } catch (error) {
            console.error('❌ Erreur action:', error);
            this.showNotification('error', 'Erreur', 'Erreur de connexion - Action sauvegardée localement');
            await this.saveLocalData();
        } finally {
            this.showLoading(false);
        }
    }

    // Export des données
    async exportData() {
        try {
            await this.saveLocalData();
            const response = await fetch(`/api/export?sessionId=${this.sessionId}`);
            if (response.ok) {
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `maya-rayanha-taches-${this.sessionId}-${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                this.showNotification('success', 'Export réussi', 'Fichier téléchargé');
            } else {
                this.exportLocalData();
            }
        } catch (error) {
            console.error('❌ Erreur export serveur:', error);
            this.exportLocalData();
        }
    }
    
    // Export des données locales
    exportLocalData() {
        try {
            const exportData = { ...this.data, sessionId: this.sessionId, exportedAt: new Date().toISOString(), version: '3.1', source: 'local' };
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `maya-rayanha-local-${this.sessionId}-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            this.showNotification('success', 'Export local réussi', 'Données locales exportées');
        } catch (error) {
            console.error('❌ Erreur export local:', error);
            this.showNotification('error', 'Erreur', 'Impossible d\'exporter les données');
        }
    }

    // Import des données
    async importData(file) {
        if (!file) return;
        this.showLoading(true);
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            const response = await fetch('/api/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ importedData: data, sessionId: this.sessionId })
            });
            const result = await response.json();
            if (response.ok && result.success) {
                this.showNotification('success', 'Import réussi', result.message);
                this.vibrate();
                await this.syncWithServer();
            } else {
                this.showNotification('error', 'Erreur d\'import', result.error || 'Format invalide');
            }
        } catch (error) {
            console.error('❌ Erreur import:', error);
            this.showNotification('error', 'Erreur', 'Fichier invalide');
        } finally {
            this.showLoading(false);
            const importFile = document.getElementById('importFile');
            if (importFile) importFile.value = '';
        }
    }

    // Mettre à jour les badges
    updateBadges() {
        const activeBadge = document.getElementById('activeBadge');
        const pendingBadge = document.getElementById('pendingBadge');
        if (activeBadge) {
            const activeCount = this.data.tasks.filter(task => task.status !== 'completed').length;
            activeBadge.textContent = activeCount;
            activeBadge.style.display = activeCount > 0 ? 'flex' : 'none';
        }
        if (pendingBadge) {
            const pendingCount = this.data.pendingTasks.length;
            pendingBadge.textContent = pendingCount;
            pendingBadge.style.display = pendingCount > 0 ? 'flex' : 'none';
        }
    }

    // Mettre à jour le statut de connexion
    updateConnectionStatus(connected) {
        const status = document.getElementById('connectionStatus');
        if (!status) return;
        
        const icon = status.querySelector('i');
        const text = status.querySelector('span');
        
        if (connected) {
            status.classList.remove('disconnected');
            if (icon) icon.className = 'fas fa-wifi';
            if (text) text.textContent = 'Connecté';
        } else {
            status.classList.add('disconnected');
            if (icon) icon.className = 'fas fa-exclamation-triangle';
            if (text) text.textContent = 'Hors ligne';
        }
    }

    // Afficher/masquer le loading
    showLoading(show) {
        this.isLoading = show;
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.style.display = show ? 'flex' : 'none';
    }

    // Vibration
    vibrate(pattern = 200) {
        if ('vibrate' in navigator) navigator.vibrate(pattern);
    }

    // Afficher une notification
    showNotification(type, title, message) {
        const container = document.getElementById('notifications');
        if (!container) return;
        
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
        notification.innerHTML = `<div class="notification-content"><i class="fas ${icons[type]} notification-icon"></i><div class="notification-text"><div class="notification-title">${this.escapeHtml(title)}</div><div class="notification-message">${this.escapeHtml(message)}</div></div></div>`;
        container.appendChild(notification);

        requestAnimationFrame(() => notification.classList.add('show'));

        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.parentNode && container.removeChild(notification), 300);
        }, 4000);
    }

    // Utilitaires
    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    }

    escapeHtml(text) {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return text.replace(/[&<>"']/g, m => map[m]);
    }
}

// Initialisation de l'application
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Initialisation Maya & Rayanha v3.1 - Persistance Robuste avec IndexedDB');
    window.taskManager = new MobileTaskManager();
    
    window.addEventListener('online', () => {
        console.log('🔌 Connexion rétablie');
        if (window.taskManager) {
            window.taskManager.showNotification('success', 'Connexion', 'Connexion rétablie');
            window.taskManager.updateConnectionStatus(true);
            window.taskManager.syncWithServer();
        }
    });
    
    window.addEventListener('offline', () => {
        console.log('🔌 Connexion perdue');
        if (window.taskManager) {
            window.taskManager.showNotification('warning', 'Hors ligne', 'Mode hors ligne activé');
            window.taskManager.updateConnectionStatus(false);
        }
    });
});

// Gestion des erreurs globales
window.addEventListener('error', (event) => console.error('❌ Erreur globale:', event.error));
window.addEventListener('unhandledrejection', (event) => console.error('❌ Promise rejetée:', event.reason));
