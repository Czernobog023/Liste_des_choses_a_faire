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
        // Utiliser une session partagée fixe pour que Maya et Rayanha voient les mêmes données
        const SHARED_SESSION_ID = 'maya_rayanha_shared_session_v3';
        
        // Stocker dans localStorage pour persistence
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
            // Initialiser le stockage persistent
            await this.initStorage();
            
            // Charger les données locales d'abord
            await this.loadLocalData();
            
            // Essayer de charger depuis le serveur
            await this.loadData();
            
            // Démarrer la synchronisation
            this.startPolling();
            this.startAutoSync();
            
            this.showNotification('success', 'Connecté', `Application collaborative prête !`);
        } catch (error) {
            console.error('❌ Erreur initialisation:', error);
            this.showNotification('warning', 'Mode hors ligne', 'Synchronisation en attente...');
            
            // Continuer avec les données locales
            await this.loadLocalData();
            this.renderAllTasks();
            this.updateBadges();
        } finally {
            this.showLoading(false);
        }
    }

    // Configuration des écouteurs d'événements optimisés pour mobile
    setupEventListeners() {
        // Sélecteur d'utilisateur
        const userSelector = document.getElementById('currentUser');
        if (userSelector) {
            userSelector.addEventListener('change', (e) => {
                this.currentUser = e.target.value;
                this.showNotification('info', 'Utilisateur changé', `Vous êtes maintenant ${this.currentUser}`);
                this.renderAllTasks(); // Re-render pour mettre à jour les actions disponibles
            });
        }

        // Navigation par onglets
        document.querySelectorAll('.nav-tab').forEach(tab => {
            this.addTouchHandler(tab, () => {
                const targetTab = tab.dataset.tab;
                this.switchTab(targetTab);
            });
        });

        // Bouton nouvelle tâche
        const addTaskBtn = document.getElementById('addTaskBtn');
        if (addTaskBtn) {
            this.addTouchHandler(addTaskBtn, () => {
                this.openTaskModal();
            });
        }

        // Modal de nouvelle tâche
        const taskForm = document.getElementById('taskForm');
        if (taskForm) {
            taskForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.submitNewTask();
            });
        }

        // Fermeture de modal
        const closeModal = document.getElementById('closeModal');
        const cancelTask = document.getElementById('cancelTask');
        const taskModal = document.getElementById('taskModal');
        
        if (closeModal) {
            this.addTouchHandler(closeModal, () => this.closeTaskModal());
        }
        
        if (cancelTask) {
            this.addTouchHandler(cancelTask, () => this.closeTaskModal());
        }
        
        if (taskModal) {
            taskModal.addEventListener('click', (e) => {
                if (e.target === taskModal || e.target.classList.contains('modal-backdrop')) {
                    this.closeTaskModal();
                }
            });
        }

        // Export/Import
        const exportBtn = document.getElementById('exportBtn');
        const importBtn = document.getElementById('importBtn');
        const importFile = document.getElementById('importFile');
        
        if (exportBtn) {
            this.addTouchHandler(exportBtn, () => this.exportData());
        }
        
        if (importBtn) {
            this.addTouchHandler(importBtn, () => {
                if (importFile) importFile.click();
            });
        }
        
        if (importFile) {
            importFile.addEventListener('change', (e) => {
                if (e.target.files[0]) {
                    this.importData(e.target.files[0]);
                }
            });
        }

        // Gestion du clavier virtuel sur mobile
        this.handleVirtualKeyboard();
        
        // Gestion de la visibilité pour économiser la batterie
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
        
        // Sauvegarder avant de quitter
        window.addEventListener('beforeunload', () => {
            // Utiliser une version synchrone pour beforeunload
            try {
                const dataToSave = {
                    ...this.data,
                    sessionId: this.sessionId,
                    savedAt: Date.now(),
                    version: '3.1'
                };
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
        
        // Sauvegarder régulièrement (toutes les 30 secondes)
        setInterval(() => {
            this.saveLocalData();
        }, 30000);
    }

    // Ajouter un gestionnaire d'événement touch-friendly
    addTouchHandler(element, handler) {
        if (!element) return;
        
        let touchStarted = false;
        
        // Touch events pour mobile
        element.addEventListener('touchstart', (e) => {
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
        
        // Click fallback pour desktop
        element.addEventListener('click', (e) => {
            if (!touchStarted) {
                handler(e);
            }
        });
    }

    // Gestion du clavier virtuel mobile
    handleVirtualKeyboard() {
        const inputs = document.querySelectorAll('input, textarea');
        inputs.forEach(input => {
            input.addEventListener('focus', () => {
                setTimeout(() => {
                    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 300);
            });
        });
    }

    // Initialiser le système de stockage (IndexedDB avec fallback localStorage)
    async initStorage() {
        try {
            // Essayer d'initialiser IndexedDB
            await this.initIndexedDB();
            console.log('💾 Storage IndexedDB initialisé');
        } catch (error) {
            console.warn('⚠️ Fallback vers localStorage:', error);
            this.storageReady = true; // localStorage toujours prêt
        }
    }
    
    // Initialiser IndexedDB
    async initIndexedDB() {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                reject(new Error('IndexedDB non supporté'));
                return;
            }
            
            const request = indexedDB.open('MayaRayanhaDB', 2);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                this.storageReady = true;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Créer les stores si nécessaire
                if (!db.objectStoreNames.contains('tasks')) {
                    const taskStore = db.createObjectStore('tasks', { keyPath: 'id' });
                    taskStore.createIndex('status', 'status', { unique: false });
                    taskStore.createIndex('proposedBy', 'proposedBy', { unique: false });
                }
                
                if (!db.objectStoreNames.contains('sessions')) {
                    db.createObjectStore('sessions', { keyPath: 'sessionId' });
                }
                
                if (!db.objectStoreNames.contains('metadata')) {
                    db.createObjectStore('metadata', { keyPath: 'key' });
                }
            };
        });
    }
    
    // Sauvegarder les données avec IndexedDB ou localStorage
    async saveLocalData() {
        const dataToSave = {
            ...this.data,
            sessionId: this.sessionId,
            savedAt: Date.now(),
            version: '3.1'
        };
        
        try {
            if (this.db && this.storageReady) {
                // Sauvegarder dans IndexedDB
                await this.saveToIndexedDB(dataToSave);
                console.log('💾 Données sauvegardées dans IndexedDB');
            } else {
                // Fallback localStorage
                this.saveToLocalStorage(dataToSave);
                console.log('💾 Données sauvegardées dans localStorage');
            }
        } catch (error) {
            console.error('❌ Erreur sauvegarde:', error);
            // Toujours essayer localStorage en dernier recours
            this.saveToLocalStorage(dataToSave);
        }
    }
    
    // Sauvegarder dans IndexedDB
    async saveToIndexedDB(data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['sessions', 'tasks', 'metadata'], 'readwrite');
            
            transaction.onerror = () => reject(transaction.error);
            transaction.oncomplete = () => resolve();
            
            // Sauvegarder la session
            const sessionStore = transaction.objectStore('sessions');
            sessionStore.put({
                sessionId: this.sessionId,
                data: data,
                lastUpdate: Date.now()
            });
            
            // Sauvegarder les tâches individuellement pour un meilleur contrôle
            const taskStore = transaction.objectStore('tasks');
            
            // Vider et recréer toutes les tâches
            taskStore.clear();
            
            [...data.tasks, ...data.pendingTasks].forEach(task => {
                taskStore.put(task);
            });
            
            // Métadonnées
            const metaStore = transaction.objectStore('metadata');
            metaStore.put({
                key: 'lastSave',
                value: Date.now(),
                sessionId: this.sessionId
            });
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
            // Si localStorage est plein, essayer de nettoyer
            this.cleanupLocalStorage();
        }
    }
    
    // Nettoyer localStorage en cas de saturation
    cleanupLocalStorage() {
        try {
            // Garder seulement les données essentielles
            const essentialKeys = ['maya_rayanha_data', 'maya_rayanha_session_id', 'maya_rayanha_tasks_backup'];
            
            Object.keys(localStorage).forEach(key => {
                if (!essentialKeys.includes(key) && !key.startsWith('maya_rayanha_')) {
                    localStorage.removeItem(key);
                }
            });
            
            console.log('🧹 localStorage nettoyé');
        } catch (error) {
            console.error('❌ Erreur nettoyage localStorage:', error);
        }
    }

    // Charger les données locales (IndexedDB ou localStorage)
    async loadLocalData() {
        try {
            let loadedData = null;
            
            if (this.db && this.storageReady) {
                // Essayer de charger depuis IndexedDB
                loadedData = await this.loadFromIndexedDB();
                console.log('📱 Données chargées depuis IndexedDB');
            } 
            
            if (!loadedData) {
                // Fallback vers localStorage
                loadedData = this.loadFromLocalStorage();
                console.log('📱 Données chargées depuis localStorage');
            }
            
            if (loadedData) {
                // Valider et appliquer les données chargées
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
            // En cas d'erreur, utiliser les données par défaut
            this.data = {
                users: ['Maya l\'abeille', 'Rayanha'],
                tasks: [],
                pendingTasks: []
            };
        }
    }
    
    // Charger depuis IndexedDB
    async loadFromIndexedDB() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['sessions'], 'readonly');
            const store = transaction.objectStore('sessions');
            const request = store.get(this.sessionId);
            
            request.onsuccess = () => {
                const result = request.result;
                if (result && result.data) {
                    // Vérifier que les données ne sont pas trop anciennes (< 7 jours)
                    const weekInMs = 7 * 24 * 60 * 60 * 1000;
                    if (Date.now() - result.data.savedAt < weekInMs) {
                        resolve(result.data);
                    } else {
                        resolve(null);
                    }
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
                // Ne charger que si les données sont récentes (< 48h pour localStorage)
                const maxAge = 48 * 60 * 60 * 1000;
                if (parsed.savedAt && Date.now() - parsed.savedAt < maxAge) {
                    return parsed;
                }
            }
            
            // Essayer le backup
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
        
        this.syncInterval = setInterval(() => {
            this.syncWithServer();
        }, 5000); // Synchroniser toutes les 5 secondes
        
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
                body: JSON.stringify({
                    sessionId: this.sessionId,
                    clientData: this.data
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                if (result.success && result.mergedData) {
                    // Vérifier s'il y a des changements
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
            // En cas d'erreur, sauvegarder quand même localement
            await this.saveLocalData();
        }
    }

    // Démarrer le polling pour les mises à jour (remplace Socket.IO)
    startPolling() {
        if (this.pollingInterval) return;
        
        this.pollingInterval = setInterval(() => {
            this.checkForUpdates();
        }, 4000); // Vérifier toutes les 4 secondes (différent de sync)
        
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

    // Vérifier les mises à jour depuis le serveur
    async checkForUpdates() {
        if (this.isLoading) return;
        
        try {
            const response = await fetch(`/api/poll/${this.sessionId}/${this.lastUpdate}`);
            if (response.ok) {
                const result = await response.json();
                
                if (result.updated && result.messages) {
                    console.log('📱 Nouvelles mises à jour reçues via polling:', result.messages.length);
                    
                    // Traiter les messages reçus
                    await this.processMessages(result.messages);
                    
                    this.lastUpdate = result.timestamp;
                    this.updateConnectionStatus(true);
                    
                    // Sauvegarder après traitement
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
                            // Notifier seulement si ce n'est pas l'utilisateur actuel qui a proposé
                            if (message.task.proposedBy !== this.currentUser) {
                                this.showNotification('info', 'Nouvelle tâche', `${message.task.proposedBy} a proposé: ${message.task.title}`);
                                this.vibrate();
                            }
                        }
                        break;
                        
                    case 'taskValidated':
                        const taskToValidate = this.data.pendingTasks.find(t => t.id === message.taskId);
                        if (taskToValidate && message.validations) {
                            // Mettre à jour les validations depuis le serveur
                            taskToValidate.validations = message.validations;
                            hasChanges = true;
                            
                            this.showNotification('info', 'Validation', `${message.validatedBy} a validé: ${taskToValidate.title} (${message.validations.length}/2)`);
                            if (message.validatedBy !== this.currentUser) {
                                this.vibrate();
                            }
                        }
                        break;
                        
                    case 'taskApproved':
                        // Tâche approuvée par validation bipartite - le serveur a déjà fait le transfert
                        const pendingTask = this.data.pendingTasks.find(t => t.id === message.taskId);
                        if (pendingTask) {
                            // Supprimer de pending et ajouter à active
                            this.data.pendingTasks = this.data.pendingTasks.filter(t => t.id !== message.taskId);
                            
                            if (message.task) {
                                this.data.tasks.push(message.task);
                                hasChanges = true;
                                
                                this.showNotification('success', 'Tâche approuvée !', `${message.task.title} est maintenant active`);
                                this.vibrate([200, 100, 200]); // Double vibration pour approbation
                                
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
                
                // Merger intelligemment avec les données locales
                const mergedData = this.mergeData(this.data, result);
                this.data = mergedData;
                this.lastUpdate = result.timestamp || Date.now();
                
                this.renderAllTasks();
                this.updateBadges();
                this.updateConnectionStatus(true);
                
                // Sauvegarder les données mergées
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
    
    // Merger intelligemment les données locales et serveur
    mergeData(localData, serverData) {
        // Utiliser les données du serveur comme base
        const merged = {
            users: serverData.users || localData.users,
            tasks: [...(serverData.tasks || [])],
            pendingTasks: [...(serverData.pendingTasks || [])]
        };
        
        // Ajouter les tâches locales qui ne sont pas sur le serveur
        const serverTaskIds = new Set([...merged.tasks, ...merged.pendingTasks].map(t => t.id));
        
        localData.tasks.forEach(task => {
            if (!serverTaskIds.has(task.id)) {
                merged.tasks.push(task);
            }
        });
        
        localData.pendingTasks.forEach(task => {
            if (!serverTaskIds.has(task.id)) {
                merged.pendingTasks.push(task);
            }
        });
        
        return merged;
    }

    // Changer d'onglet
    switchTab(tabName) {
        // Mettre à jour l'état des onglets
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Mettre à jour le contenu
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-content`).classList.add('active');
        
        // Scroll vers le haut
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

    // Créer une carte de tâche optimisée mobile
    createTaskCard(task, type) {
        const isCurrentUserTask = type === 'pending' && task.proposedBy === this.currentUser;
        const hasValidated = type === 'pending' && task.validations && task.validations.includes(this.currentUser);
        const needsValidation = type === 'pending' && !hasValidated;
        const validationCount = task.validations ? task.validations.length : 0;

        let actions = '';
        let validationStatus = '';

        if (type === 'pending') {
            validationStatus = `
                <div class="validation-status">
                    <i class="fas fa-users"></i>
                    Validations: ${validationCount}/2 
                    ${task.validations ? `(${task.validations.join(', ')})` : ''}
                </div>
            `;

            if (needsValidation && !isCurrentUserTask) {
                actions = `
                    <button class="task-btn task-btn-success" data-action="validate" data-task-id="${task.id}">
                        <i class="fas fa-check"></i> Valider
                    </button>
                    <button class="task-btn task-btn-danger" data-action="reject" data-task-id="${task.id}">
                        <i class="fas fa-times"></i> Rejeter
                    </button>
                `;
            } else if (hasValidated) {
                actions = `
                    <button class="task-btn task-btn-secondary" disabled>
                        <i class="fas fa-check"></i> Validée
                    </button>
                `;
            } else if (isCurrentUserTask) {
                actions = `
                    <button class="task-btn task-btn-secondary" disabled>
                        <i class="fas fa-clock"></i> En attente
                    </button>
                    <button class="task-btn task-btn-danger" data-action="delete" data-task-id="${task.id}">
                        <i class="fas fa-trash"></i> Supprimer
                    </button>
                `;
            }
        } else if (type === 'active') {
            actions = `
                <button class="task-btn task-btn-success" data-action="complete" data-task-id="${task.id}">
                    <i class="fas fa-check"></i> Terminer
                </button>
                <button class="task-btn task-btn-danger" data-action="delete" data-task-id="${task.id}">
                    <i class="fas fa-trash"></i> Supprimer
                </button>
            `;
        } else if (type === 'completed') {
            actions = `
                <button class="task-btn task-btn-danger" data-action="delete" data-task-id="${task.id}">
                    <i class="fas fa-trash"></i> Supprimer
                </button>
            `;
        }

        const dateInfo = type === 'pending' 
            ? `Proposée par ${task.proposedBy} le ${this.formatDate(task.proposedAt)}`
            : type === 'completed'
            ? `Terminée par ${task.completedBy} le ${this.formatDate(task.completedAt)}`
            : `Approuvée le ${this.formatDate(task.approvedAt)}`;

        return `
            <div class="task-card ${type}">
                <div class="task-header">
                    <h3 class="task-title">${this.escapeHtml(task.title)}</h3>
                </div>
                ${task.description ? `<div class="task-description">${this.escapeHtml(task.description)}</div>` : ''}
                ${validationStatus}
                <div class="task-meta">
                    ${dateInfo}
                </div>
                <div class="task-actions">
                    ${actions}
                </div>
            </div>
        `;
    }

    // Lier les actions des tâches avec gestion touch
    bindTaskActions(container) {
        container.querySelectorAll('[data-action]').forEach(button => {
            this.addTouchHandler(button, async () => {
                const action = button.dataset.action;
                const taskId = button.dataset.taskId;
                
                // Désactiver le bouton pendant l'action
                button.disabled = true;
                
                try {
                    switch (action) {
                        case 'validate':
                            await this.validateTask(taskId);
                            break;
                        case 'reject':
                            await this.rejectTask(taskId);
                            break;
                        case 'complete':
                            await this.completeTask(taskId);
                            break;
                        case 'delete':
                            await this.deleteTask(taskId);
                            break;
                    }
                } finally {
                    // Réactiver le bouton
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
            if (titleInput) {
                setTimeout(() => titleInput.focus(), 100);
            }
        }
    }

    closeTaskModal() {
        const modal = document.getElementById('taskModal');
        const form = document.getElementById('taskForm');
        
        if (modal) {
            modal.classList.remove('show');
        }
        
        if (form) {
            form.reset();
        }
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
                body: JSON.stringify({
                    title,
                    description,
                    proposedBy: this.currentUser,
                    sessionId: this.sessionId
                })
            });

            const result = await response.json();

            if (response.ok && result.success) {
                this.closeTaskModal();
                this.showNotification('success', 'Tâche proposée', result.message);
                this.vibrate();
                
                // Ajouter la tâche localement immédiatement pour un feedback rapide
                this.data.pendingTasks.push(result.task);
                this.renderAllTasks();
                this.updateBadges();
                await this.saveLocalData();
                
                // Synchroniser avec le serveur
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

    // Actions sur les tâches
   async validateTask(taskId) {
    // --- MISE À JOUR OPTIMISTE ---
    // On trouve la tâche dans nos données locales
    const task = this.data.pendingTasks.find(t => t.id === taskId);

    if (task) {
        // On ajoute la validation de l'utilisateur actuel localement
        if (!task.validations) {
            task.validations = [];
        }
        if (!task.validations.includes(this.currentUser)) {
            task.validations.push(this.currentUser);
        }

        // On met à jour l'affichage IMMÉDIATEMENT
        console.log('🔄 Mise à jour optimiste : affichage mis à jour localement.');
        this.renderAllTasks();
        this.updateBadges();
    }
    // --- FIN DE LA MISE À JOUR OPTIMISTE ---

    // On envoie la requête au serveur comme avant pour rendre le changement permanent
    // La fonction syncWithServer() corrigera toute éventuelle erreur plus tard.
    await this.performTaskAction(`/api/tasks/${taskId}/validate`, 'POST', { userId: this.currentUser });
}

    async rejectTask(taskId) {
        if (!confirm('Rejeter cette tâche ?')) return;
        await this.performTaskAction(`/api/tasks/${taskId}/reject`, 'POST', { userId: this.currentUser });
    }

    async completeTask(taskId) {
        await this.performTaskAction(`/api/tasks/${taskId}/complete`, 'POST', { userId: this.currentUser });
    }

    async deleteTask(taskId) {
        if (!confirm('Supprimer cette tâche définitivement ?')) return;
        await this.performTaskAction(`/api/tasks/${taskId}`, 'DELETE', { userId: this.currentUser });
    }

    async performTaskAction(url, method, body) {
        this.showLoading(true);
        
        // Ajouter sessionId au body
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
                
                // Synchroniser avec le serveur pour obtenir les dernières données
                await this.syncWithServer();
            } else {
                this.showNotification('error', 'Erreur', result.error || 'Erreur lors de l\'action');
            }
        } catch (error) {
            console.error('❌ Erreur action:', error);
            this.showNotification('error', 'Erreur', 'Erreur de connexion - Action sauvegardée localement');
            // En cas d'erreur, sauvegarder l'action localement pour retry plus tard
            await this.saveLocalData();
        } finally {
            this.showLoading(false);
        }
    }

    // Export des données
    async exportData() {
        try {
            // Sauvegarder d'abord les données actuelles
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
                // Fallback: export local
                this.exportLocalData();
            }
        } catch (error) {
            console.error('❌ Erreur export serveur:', error);
            // Fallback: export des données locales
            this.exportLocalData();
        }
    }
    
    // Export des données locales en cas d'échec du serveur
    exportLocalData() {
        try {
            const exportData = {
                ...this.data,
                sessionId: this.sessionId,
                exportedAt: new Date().toISOString(),
                version: '3.1',
                source: 'local'
            };
            
            const blob = new Blob([JSON.stringify(exportData, null, 2)], {
                type: 'application/json'
            });
            
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
                body: JSON.stringify({
                    importedData: data,
                    sessionId: this.sessionId
                })
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
            // Réinitialiser l'input file
            const importFile = document.getElementById('importFile');
            if (importFile) importFile.value = '';
        }
    }

    // Mettre à jour les badges de compteurs
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
        if (overlay) {
            overlay.style.display = show ? 'flex' : 'none';
        }
    }

    // Vibration pour les appareils mobiles
    vibrate(pattern = 200) {
        if ('vibrate' in navigator) {
            navigator.vibrate(pattern);
        }
    }

    // Afficher une notification toast
    showNotification(type, title, message) {
        const container = document.getElementById('notifications');
        if (!container) return;
        
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };

        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas ${icons[type]} notification-icon"></i>
                <div class="notification-text">
                    <div class="notification-title">${this.escapeHtml(title)}</div>
                    <div class="notification-message">${this.escapeHtml(message)}</div>
                </div>
            </div>
        `;

        container.appendChild(notification);

        // Animation d'apparition
        requestAnimationFrame(() => {
            notification.classList.add('show');
        });

        // Auto-suppression après 4 secondes
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    container.removeChild(notification);
                }
            }, 300);
        }, 4000);
    }

    // Utilitaires
    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }
}

// Initialisation de l'application quand le DOM est prêt
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Initialisation Maya & Rayanha v3.1 - Persistance Robuste avec IndexedDB');
    window.taskManager = new MobileTaskManager();
    
    // Détection des changements de connectivité
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
window.addEventListener('error', (event) => {
    console.error('❌ Erreur globale:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('❌ Promise rejetée:', event.reason);
});
