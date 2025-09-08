// Application Collaborative Maya & Rayanha - Version Finale Robuste
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
        console.log('🚀 Initialisation Maya & Rayanha - Session Partagée:', this.sessionId);
        
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

    // Configuration des écouteurs d'événements
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
            this.addTouchHandler(tab, () => this.switchTab(tab.dataset.tab));
        });

        const addTaskBtn = document.getElementById('addTaskBtn');
        if (addTaskBtn) {
            this.addTouchHandler(addTaskBtn, () => this.openTaskModal());
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
        
        window.addEventListener('beforeunload', () => this.saveLocalData());
        setInterval(() => this.saveLocalData(), 30000);
    }

    // Gestionnaire d'événement touch-friendly
    addTouchHandler(element, handler) {
        if (!element) return;
        let touchStarted = false;
        element.addEventListener('touchstart', () => { touchStarted = true; element.style.transform = 'scale(0.95)'; }, { passive: true });
        element.addEventListener('touchend', (e) => { if (touchStarted) { e.preventDefault(); element.style.transform = ''; handler(e); touchStarted = false; } }, { passive: false });
        element.addEventListener('touchcancel', () => { element.style.transform = ''; touchStarted = false; }, { passive: true });
        element.addEventListener('click', (e) => { if (!touchStarted) handler(e); });
    }

    // Gestion du clavier virtuel mobile
    handleVirtualKeyboard() {
        document.querySelectorAll('input, textarea').forEach(input => {
            input.addEventListener('focus', () => setTimeout(() => input.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300));
        });
    }

    // Initialisation du stockage (IndexedDB avec fallback)
    async initStorage() {
        try {
            await this.initIndexedDB();
            console.log('💾 Storage IndexedDB initialisé');
        } catch (error) {
            console.warn('⚠️ Fallback vers localStorage:', error);
            this.storageReady = true;
        }
    }
    
    async initIndexedDB() {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) return reject(new Error('IndexedDB non supporté'));
            const request = indexedDB.open('MayaRayanhaDB', 2);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => { this.db = request.result; this.storageReady = true; resolve(); };
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('tasks')) db.createObjectStore('tasks', { keyPath: 'id' });
                if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'sessionId' });
            };
        });
    }
    
    // Sauvegarde des données
    async saveLocalData() {
        const dataToSave = { ...this.data, savedAt: Date.now() };
        try {
            if (this.db) {
                const tx = this.db.transaction('sessions', 'readwrite');
                tx.objectStore('sessions').put({ sessionId: this.sessionId, data: dataToSave });
                await tx.done;
            } else {
                localStorage.setItem('maya_rayanha_data', JSON.stringify(dataToSave));
            }
        } catch (error) {
            console.error('❌ Erreur de sauvegarde locale:', error);
            localStorage.setItem('maya_rayanha_data', JSON.stringify(dataToSave));
        }
    }
    
    // Chargement des données locales
    async loadLocalData() {
        try {
            let loadedData;
            if (this.db) {
                loadedData = (await this.db.get('sessions', this.sessionId))?.data;
            } else {
                const localData = localStorage.getItem('maya_rayanha_data');
                loadedData = localData ? JSON.parse(localData) : null;
            }
            if (loadedData) {
                this.data = {
                    users: loadedData.users || this.data.users,
                    tasks: Array.isArray(loadedData.tasks) ? loadedData.tasks : [],
                    pendingTasks: Array.isArray(loadedData.pendingTasks) ? loadedData.pendingTasks : []
                };
            }
        } catch (error) {
            console.error('❌ Erreur de chargement local:', error);
        }
    }
    
    // Démarrer et arrêter la synchronisation et le polling
    startAutoSync() { if (!this.syncInterval) { this.syncInterval = setInterval(() => this.syncWithServer(), 10000); console.log('🔄 Auto-sync démarré'); } }
    stopAutoSync() { if (this.syncInterval) { clearInterval(this.syncInterval); this.syncInterval = null; console.log('⏹ Auto-sync arrêté'); } }
    startPolling() { if (!this.pollingInterval) { this.pollingInterval = setInterval(() => this.checkForUpdates(), 5000); console.log('🔄 Polling démarré'); } }
    stopPolling() { if (this.pollingInterval) { clearInterval(this.pollingInterval); this.pollingInterval = null; console.log('⏹ Polling arrêté'); } }

    // Synchroniser avec le serveur
    async syncWithServer() {
        if (this.isLoading) return;
        try {
            const response = await fetch('/api/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: this.sessionId, clientData: this.data, lastUpdate: this.lastUpdate })
            });
            if (response.ok) {
                const result = await response.json();
                if (result.success && result.mergedData) {
                    this.data = result.mergedData;
                    this.lastUpdate = result.timestamp;
                    this.renderAllTasks();
                    this.updateBadges();
                    await this.saveLocalData();
                }
            }
        } catch (error) {
            console.warn('⚠️ Erreur de synchronisation:', error);
        }
    }

    // Vérifier les mises à jour via polling
    async checkForUpdates() {
        // La fonction syncWithServer gère maintenant la logique de mise à jour.
        // On pourrait la garder pour une logique de notification plus légère si besoin.
    }
    
    // Charger les données initiales
    async loadData() {
        this.isLoading = true;
        await this.syncWithServer();
        this.isLoading = false;
    }
    
    // Changer d'onglet
    switchTab(tabName) {
        document.querySelectorAll('.nav-tab, .tab-content').forEach(el => el.classList.remove('active'));
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(`${tabName}-content`).classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Rendu des tâches
    renderAllTasks() {
        ['active', 'pending', 'completed'].forEach(type => this.renderTasks(type));
    }

    renderTasks(type) {
        const container = document.getElementById(`${type}Tasks`);
        const emptyState = document.getElementById(`${type}Empty`);
        if (!container || !emptyState) return;

        let tasksToRender;
        if (type === 'pending') {
            tasksToRender = this.data.pendingTasks;
        } else {
            tasksToRender = this.data.tasks.filter(task => (type === 'completed' ? task.status === 'completed' : task.status !== 'completed'));
        }

        emptyState.style.display = tasksToRender.length === 0 ? 'block' : 'none';
        container.innerHTML = tasksToRender.map(task => this.createTaskCard(task, type)).join('');
        this.bindTaskActions(container);
    }

    createTaskCard(task, type) {
        const isProposer = task.proposedBy === this.currentUser;
        const hasValidated = task.validations?.includes(this.currentUser);
        let actions = '', validationStatus = '';

        if (type === 'pending') {
            const validationCount = task.validations?.length || 0;
            validationStatus = `<div class="validation-status"><i class="fas fa-users"></i> Validations: ${validationCount}/1 requis</div>`;
            if (!isProposer && !hasValidated) {
                actions = `<button class="task-btn task-btn-success" data-action="validate" data-task-id="${task.id}"><i class="fas fa-check"></i> Valider</button>
                           <button class="task-btn task-btn-danger" data-action="reject" data-task-id="${task.id}"><i class="fas fa-times"></i> Rejeter</button>`;
            } else if (hasValidated) {
                actions = `<button class="task-btn task-btn-secondary" disabled><i class="fas fa-check"></i> Validée par vous</button>`;
            } else { // isProposer
                actions = `<button class="task-btn task-btn-secondary" disabled><i class="fas fa-clock"></i> En attente</button>
                           <button class="task-btn task-btn-danger" data-action="delete" data-task-id="${task.id}"><i class="fas fa-trash"></i> Annuler</button>`;
            }
        } else if (type === 'active') {
            actions = `<button class="task-btn task-btn-success" data-action="complete" data-task-id="${task.id}"><i class="fas fa-check"></i> Terminer</button>`;
        } else { // completed
            actions = `<button class="task-btn task-btn-danger" data-action="delete" data-task-id="${task.id}"><i class="fas fa-trash"></i> Effacer</button>`;
        }

        const dateInfo = type === 'pending' ? `Proposée par ${task.proposedBy} le ${this.formatDate(task.proposedAt)}`
                       : type === 'completed' ? `Terminée par ${task.completedBy} le ${this.formatDate(task.completedAt)}`
                       : (task.approvedAt ? `Approuvée le ${this.formatDate(task.approvedAt)}` : 'Approuvée récemment');
        
        return `<div class="task-card ${type}"><div class="task-header"><h3 class="task-title">${this.escapeHtml(task.title)}</h3></div>${task.description ? `<div class="task-description">${this.escapeHtml(task.description)}</div>` : ''}${validationStatus}<div class="task-meta">${dateInfo}</div><div class="task-actions">${actions}</div></div>`;
    }

    bindTaskActions(container) {
        container.querySelectorAll('[data-action]').forEach(button => {
            this.addTouchHandler(button, () => {
                const action = button.dataset.action;
                const taskId = button.dataset.taskId;
                switch (action) {
                    case 'validate': this.validateTask(taskId); break;
                    case 'reject': this.rejectTask(taskId); break;
                    case 'complete': this.completeTask(taskId); break;
                    case 'delete': this.deleteTask(taskId); break;
                }
            });
        });
    }

    openTaskModal() {
        const modal = document.getElementById('taskModal');
        if (modal) {
            modal.classList.add('show');
            document.getElementById('taskTitle')?.focus();
        }
    }
    closeTaskModal() {
        document.getElementById('taskModal')?.classList.remove('show');
        document.getElementById('taskForm')?.reset();
    }
    
    async submitNewTask() {
        const title = document.getElementById('taskTitle').value.trim();
        if (!title) {
            this.showNotification('warning', 'Erreur', 'Le titre est requis');
            return;
        }
        const description = document.getElementById('taskDescription').value.trim();
        this.closeTaskModal();
        this.showLoading(true);
        // Optimistic update
        const tempId = `temp_${Date.now()}`;
        const newTask = { id: tempId, title, description, proposedBy: this.currentUser, proposedAt: new Date().toISOString(), validations: [] };
        this.data.pendingTasks.push(newTask);
        this.renderAllTasks();
        this.updateBadges();

        await this.sendActionInBackground('/api/tasks/propose', 'POST', { title, description, proposedBy: this.currentUser });
        this.showLoading(false);
    }
    
    // ========================================================================
    // SECTION DES ACTIONS UTILISATEUR (LOGIQUE CORRIGÉE)
    // ========================================================================

    async validateTask(taskId) {
        const pendingTaskIndex = this.data.pendingTasks.findIndex(t => t.id === taskId);
        if (pendingTaskIndex === -1) return;

        const taskToMove = this.data.pendingTasks[pendingTaskIndex];
        if (taskToMove.proposedBy === this.currentUser) {
            this.showNotification('warning', 'Action impossible', 'Vous ne pouvez pas valider votre propre proposition.');
            return;
        }

        // Mise à jour optimiste
        this.data.pendingTasks.splice(pendingTaskIndex, 1);
        taskToMove.status = 'active';
        taskToMove.approvedAt = new Date().toISOString();
        taskToMove.validations.push(this.currentUser);
        this.data.tasks.push(taskToMove);

        this.renderAllTasks();
        this.updateBadges();
        this.showNotification('success', 'Tâche Approuvée !', `${taskToMove.title} est maintenant active.`);
        this.vibrate();

        this.sendActionInBackground(`/api/tasks/${taskId}/validate`, 'POST', { userId: this.currentUser });
    }

    async completeTask(taskId) {
        const activeTaskIndex = this.data.tasks.findIndex(t => t.id === taskId && t.status !== 'completed');
        if (activeTaskIndex === -1) return;

        const taskToComplete = this.data.tasks[activeTaskIndex];
        
        taskToComplete.status = 'completed';
        taskToComplete.completedBy = this.currentUser;
        taskToComplete.completedAt = new Date().toISOString();
        
        this.renderAllTasks();
        this.updateBadges();
        this.showNotification('success', 'Tâche Terminée !', `Vous avez terminé : ${taskToComplete.title}`);
        this.vibrate();

        this.sendActionInBackground(`/api/tasks/${taskId}/complete`, 'POST', { userId: this.currentUser });
    }

    async rejectTask(taskId) {
        if (!confirm('Rejeter cette tâche ?')) return;
        this.data.pendingTasks = this.data.pendingTasks.filter(t => t.id !== taskId);
        this.renderAllTasks();
        this.updateBadges();
        this.showNotification('info', 'Tâche rejetée', 'La proposition a été retirée.');
        this.sendActionInBackground(`/api/tasks/${taskId}/reject`, 'POST', { userId: this.currentUser });
    }

    async deleteTask(taskId) {
        if (!confirm('Supprimer cette tâche définitivement ?')) return;
        this.data.tasks = this.data.tasks.filter(t => t.id !== taskId);
        this.data.pendingTasks = this.data.pendingTasks.filter(t => t.id !== taskId);
        this.renderAllTasks();
        this.updateBadges();
        this.showNotification('info', 'Tâche supprimée', 'La tâche a été supprimée.');
        this.sendActionInBackground(`/api/tasks/${taskId}`, 'DELETE', { userId: this.currentUser });
    }
    
    // Nouvelle fonction pour envoyer les actions sans bloquer l'interface
    sendActionInBackground(url, method, body) {
        fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...body, sessionId: this.sessionId })
        })
        .then(response => response.json())
        .then(result => {
            if (!result.success) {
                console.error('Erreur serveur en arrière-plan:', result.error);
                this.syncWithServer(); // Force une re-synchronisation en cas d'erreur
            } else {
                console.log(`📡 Action [${method}] envoyée avec succès. Sync à venir.`);
                this.syncWithServer(); // Synchronise après une action réussie pour obtenir l'ID final
            }
        })
        .catch(error => {
            console.error('❌ Erreur réseau en arrière-plan:', error);
        });
    }

    // Fonctions utilitaires (notifications, chargement, etc.)
    showLoading(show) { document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none'; }
    vibrate(pattern = 200) { if ('vibrate' in navigator) navigator.vibrate(pattern); }
    showNotification(type, title, message) { /* ... implementation ... */ }
    formatDate(dateString) { /* ... implementation ... */ }
    escapeHtml(text) { /* ... implementation ... */ }
    updateBadges() { /* ... implementation ... */ }
}

// Initialisation de l'application
document.addEventListener('DOMContentLoaded', () => {
    window.taskManager = new MobileTaskManager();
    window.addEventListener('online', () => window.taskManager?.syncWithServer());
    window.addEventListener('offline', () => window.taskManager?.showNotification('warning', 'Hors ligne', 'Mode hors ligne activé'));
});
