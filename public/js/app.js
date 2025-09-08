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
            await this.loadData(); // Charge les données du serveur et fusionne
            this.startPolling();
            this.showNotification('success', 'Connecté', `Application collaborative prête !`);
        } catch (error) {
            console.error('❌ Erreur initialisation:', error);
            this.showNotification('warning', 'Mode hors ligne', 'Synchronisation en attente...');
            // En cas d'erreur réseau, on se fie aux données locales déjà chargées
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

        // Le reste des écouteurs...
    }

    addTouchHandler(element, handler) {
        if (!element) return;
        let touchStarted = false;
        element.addEventListener('touchstart', () => { touchStarted = true; element.style.transform = 'scale(0.95)'; }, { passive: true });
        element.addEventListener('touchend', (e) => { if (touchStarted) { e.preventDefault(); element.style.transform = ''; handler(e); touchStarted = false; } }, { passive: false });
        element.addEventListener('touchcancel', () => { element.style.transform = ''; touchStarted = false; }, { passive: true });
        element.addEventListener('click', (e) => { if (!touchStarted) handler(e); });
    }

    handleVirtualKeyboard() {
        document.querySelectorAll('input, textarea').forEach(input => {
            input.addEventListener('focus', () => setTimeout(() => input.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300));
        });
    }

    async initStorage() { /* ... (code inchangé) ... */ }
    async initIndexedDB() { /* ... (code inchangé) ... */ }
    async saveLocalData() { /* ... (code inchangé) ... */ }
    async loadLocalData() { /* ... (code inchangé) ... */ }
    
    startPolling() { if (!this.pollingInterval) { this.pollingInterval = setInterval(() => this.syncWithServer(), 5000); console.log('🔄 Polling démarré'); } }
    stopPolling() { if (this.pollingInterval) { clearInterval(this.pollingInterval); this.pollingInterval = null; console.log('⏹ Polling arrêté'); } }

    async syncWithServer() {
        try {
            const response = await fetch(`/api/data?sessionId=${this.sessionId}&lastUpdate=${this.lastUpdate}`);
            if (!response.ok) throw new Error('Réponse serveur non valide');
            
            const result = await response.json();
            if (result.hasChanges) {
                this.data = result.data;
                this.lastUpdate = result.timestamp;
                await this.saveLocalData();
                this.renderAllTasks();
                this.updateBadges();
            }
        } catch (error) {
            console.warn('⚠️ Erreur de synchronisation:', error);
            this.updateConnectionStatus(false);
        }
    }

    async loadData() {
        this.showLoading(true);
        await this.syncWithServer();
        this.showLoading(false);
    }
    
    switchTab(tabName) {
        document.querySelectorAll('.nav-tab, .tab-content').forEach(el => el.classList.remove('active'));
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(`${tabName}-content`).classList.add('active');
    }

    renderAllTasks() {
        this.renderTasks('active');
        this.renderTasks('pending');
        this.renderTasks('completed');
    }

    renderTasks(type) {
        const container = document.getElementById(`${type}Tasks`);
        const emptyState = document.getElementById(`${type}Empty`);
        if (!container || !emptyState) return;

        let tasksToRender = [];
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
        
        // Correctif pour la date
        const dateInfo = type === 'pending' ? `Proposée par ${task.proposedBy || '...'} le ${this.formatDate(task.proposedAt)}`
                       : type === 'completed' ? `Terminée par ${task.completedBy || '...'} le ${this.formatDate(task.completedAt)}`
                       : (task.approvedAt ? `Approuvée le ${this.formatDate(task.approvedAt)}` : 'Approuvée récemment');
        
        return `<div class="task-card ${type}"><div class="task-header"><h3 class="task-title">${this.escapeHtml(task.title || 'Tâche en cours de création...')}</h3></div>${task.description ? `<div class="task-description">${this.escapeHtml(task.description)}</div>` : ''}${validationStatus}<div class="task-meta">${dateInfo}</div><div class="task-actions">${actions}</div></div>`;
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
    
    // ========================================================================
    // SECTION DES ACTIONS UTILISATEUR (LOGIQUE ENTIÈREMENT CORRIGÉE)
    // ========================================================================
    
    async submitNewTask() {
        const title = document.getElementById('taskTitle').value.trim();
        if (!title) {
            this.showNotification('warning', 'Erreur', 'Le titre est requis');
            return;
        }
        const description = document.getElementById('taskDescription').value.trim();
        this.closeTaskModal();

        // 1. Création optimiste d'une tâche temporaire
        const tempId = `temp_${Date.now()}`;
        const newTask = { 
            id: tempId, 
            title, 
            description, 
            proposedBy: this.currentUser, 
            proposedAt: new Date().toISOString(), 
            validations: [],
            status: 'pending' // Important
        };

        // 2. Mise à jour immédiate de l'interface
        this.data.pendingTasks.push(newTask);
        this.renderAllTasks();
        this.updateBadges();

        // 3. Envoi au serveur en arrière-plan
        this.sendActionInBackground('/api/tasks/propose', 'POST', { tempId, title, description, proposedBy: this.currentUser });
    }

    validateTask(taskId) {
        const taskIndex = this.data.pendingTasks.findIndex(t => t.id === taskId);
        if (taskIndex === -1) return;

        const task = this.data.pendingTasks[taskIndex];
        if (task.proposedBy === this.currentUser) {
            this.showNotification('warning', 'Action impossible', 'Vous ne pouvez pas valider votre propre proposition.');
            return;
        }

        // Mise à jour optimiste
        this.data.pendingTasks.splice(taskIndex, 1);
        task.status = 'active';
        task.approvedAt = new Date().toISOString();
        task.validations.push(this.currentUser);
        this.data.tasks.push(task);

        this.renderAllTasks();
        this.updateBadges();
        this.showNotification('success', 'Tâche Approuvée !', `${task.title} est maintenant active.`);
        this.vibrate();

        this.sendActionInBackground(`/api/tasks/${taskId}/validate`, 'POST', { userId: this.currentUser });
    }

    completeTask(taskId) {
        const taskIndex = this.data.tasks.findIndex(t => t.id === taskId);
        if (taskIndex === -1) return;

        const task = this.data.tasks[taskIndex];
        task.status = 'completed';
        task.completedBy = this.currentUser;
        task.completedAt = new Date().toISOString();
        
        this.renderAllTasks();
        this.updateBadges();
        this.showNotification('success', 'Tâche Terminée !', `Vous avez terminé : ${task.title}`);
        this.vibrate();

        this.sendActionInBackground(`/api/tasks/${taskId}/complete`, 'POST', { userId: this.currentUser });
    }

    rejectTask(taskId) {
        if (!confirm('Rejeter cette tâche ?')) return;
        this.data.pendingTasks = this.data.pendingTasks.filter(t => t.id !== taskId);
        this.renderAllTasks();
        this.updateBadges();
        this.showNotification('info', 'Tâche rejetée');
        this.sendActionInBackground(`/api/tasks/${taskId}/reject`, 'POST', { userId: this.currentUser });
    }

    deleteTask(taskId) {
        if (!confirm('Supprimer cette tâche définitivement ?')) return;
        this.data.tasks = this.data.tasks.filter(t => t.id !== taskId);
        this.data.pendingTasks = this.data.pendingTasks.filter(t => t.id !== taskId);
        this.renderAllTasks();
        this.updateBadges();
        this.showNotification('info', 'Tâche supprimée');
        this.sendActionInBackground(`/api/tasks/${taskId}`, 'DELETE', { userId: this.currentUser });
    }
    
    sendActionInBackground(url, method, body) {
        fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...body, sessionId: this.sessionId })
        })
        .then(response => {
            if (!response.ok) throw new Error('Erreur serveur');
            return response.json();
        })
        .then(result => {
            if (!result.success) {
                console.error('Erreur serveur en arrière-plan:', result.error);
                this.syncWithServer(); // Force une re-synchronisation en cas d'erreur
            } else {
                console.log(`📡 Action [${method}] réussie. Le serveur va se synchroniser.`);
                // La prochaine synchronisation via polling mettra à jour les IDs etc.
            }
        })
        .catch(error => {
            console.error('❌ Erreur réseau en arrière-plan:', error);
        });
    }

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
    
    // Autres fonctions utilitaires...
    showLoading(show) { document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none'; }
    vibrate(pattern = 100) { if ('vibrate' in navigator) navigator.vibrate(pattern); }
    updateConnectionStatus(connected) { /* ... */ }
    formatDate(dateString) { if (!dateString) return 'date invalide'; const date = new Date(dateString); return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
    escapeHtml(text) { const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }; return String(text).replace(/[&<>"']/g, m => map[m]); }
    showNotification(type, title, message) { /* ... */ }
}

// Initialisation de l'application
document.addEventListener('DOMContentLoaded', () => {
    window.taskManager = new MobileTaskManager();
    window.addEventListener('online', () => {
        window.taskManager?.showNotification('info', 'En ligne', 'Connexion rétablie.');
        window.taskManager?.syncWithServer();
    });
    window.addEventListener('offline', () => window.taskManager?.showNotification('warning', 'Hors ligne', 'Mode hors ligne activé'));
});
