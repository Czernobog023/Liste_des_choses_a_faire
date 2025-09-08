// Application Collaborative Maya & Rayanha - Version Finale Stable
class MobileTaskManager {
    constructor() {
        this.currentUser = localStorage.getItem('currentUser') || 'Maya l\'abeille';
        this.sessionId = this.generateSessionId();
        this.data = {
            users: ['Maya l\'abeille', 'Rayanha'],
            tasks: [],
            pendingTasks: []
        };
        this.db = null;
        this.pollingInterval = null;
        
        this.init();
    }
    
    generateSessionId() {
        const SHARED_SESSION_ID = 'maya_rayanha_shared_session_v3';
        localStorage.setItem('maya_rayanha_session_id', SHARED_SESSION_ID);
        return SHARED_SESSION_ID;
    }

    async init() {
        console.log('🚀 Initialisation...');
        this.setupEventListeners();
        
        await this.loadLocalData();
        this.renderAllTasks();
        this.updateBadges();
        
        try {
            await this.syncWithServer();
            this.showNotification('success', 'Connecté', 'Application synchronisée !');
        } catch (error) {
            this.showNotification('warning', 'Mode hors ligne', 'Impossible de synchroniser.');
        }

        this.startPolling();
    }

    setupEventListeners() {
        const userSelector = document.getElementById('currentUser');
        if (userSelector) {
            userSelector.value = this.currentUser;
            userSelector.addEventListener('change', (e) => {
                this.currentUser = e.target.value;
                localStorage.setItem('currentUser', this.currentUser);
                this.renderAllTasks();
            });
        }
        
        document.querySelectorAll('.nav-tab').forEach(tab => this.addTouchHandler(tab, () => this.switchTab(tab.dataset.tab)));
        
        const addTaskBtn = document.getElementById('addTaskBtn');
        if (addTaskBtn) this.addTouchHandler(addTaskBtn, () => this.openTaskModal());

        const taskForm = document.getElementById('taskForm');
        if (taskForm) taskForm.addEventListener('submit', (e) => { e.preventDefault(); this.submitNewTask(); });

        const closeModal = document.getElementById('closeModal');
        if (closeModal) this.addTouchHandler(closeModal, () => this.closeTaskModal());
        const cancelTask = document.getElementById('cancelTask');
        if (cancelTask) this.addTouchHandler(cancelTask, () => this.closeTaskModal());
    }

    addTouchHandler(element, handler) {
        if (!element) return;
        element.addEventListener('click', (e) => {
            e.stopPropagation(); 
            handler(e);
        });
    }

    // --- Fonctions de persistance des données ---
    async initStorage() {
        if (this.db) return;
        return new Promise((resolve) => {
            if (!window.indexedDB) return resolve();
            const request = indexedDB.open('MayaRayanhaDB', 3);
            request.onerror = () => resolve();
            request.onsuccess = (e) => { this.db = e.target.result; resolve(); };
            request.onupgradeneeded = (e) => {
                if (!e.target.result.objectStoreNames.contains('appData')) {
                    e.target.result.createObjectStore('appData', { keyPath: 'key' });
                }
            };
        });
    }

    async saveData() {
        const dataToSave = { tasks: this.data.tasks, pendingTasks: this.data.pendingTasks };
        try {
            if (this.db) {
                const tx = this.db.transaction('appData', 'readwrite');
                tx.objectStore('appData').put({ key: 'data', value: dataToSave });
                await tx.done;
            } else {
                localStorage.setItem('maya_rayanha_data', JSON.stringify(dataToSave));
            }
        } catch (error) {
            console.error('❌ Erreur de sauvegarde locale:', error);
        }
    }

    async loadLocalData() {
        try {
            await this.initStorage();
            let loadedData;
            if (this.db) {
                loadedData = await new Promise((resolve, reject) => {
                    const transaction = this.db.transaction('appData', 'readonly');
                    const request = transaction.objectStore('appData').get('data');
                    transaction.oncomplete = () => resolve(request.result?.value);
                    transaction.onerror = (event) => reject(event.target.error);
                });
            } else {
                const localData = localStorage.getItem('maya_rayanha_data');
                loadedData = localData ? JSON.parse(localData) : null;
            }

            if (loadedData) {
                this.data.tasks = loadedData.tasks || [];
                this.data.pendingTasks = loadedData.pendingTasks || [];
            }
        } catch (error) {
            console.error('❌ Erreur de chargement local:', error);
        }
    }
    
    // --- Fonctions de synchronisation et de rendu ---
    startPolling() { 
        if (!this.pollingInterval) { 
            this.pollingInterval = setInterval(() => this.syncWithServer(), 10000); 
        } 
    }

    async syncWithServer() {
        try {
            const response = await fetch(`/api/data?sessionId=${this.sessionId}`);
            if (!response.ok) throw new Error('Réponse serveur non valide');
            
            const serverData = await response.json();
            
            this.data.tasks = serverData.tasks || [];
            this.data.pendingTasks = serverData.pendingTasks || [];
            
            await this.saveData();
            this.renderAllTasks();
            this.updateBadges();
        } catch (error) {
            console.warn('⚠️ Erreur de synchronisation:', error);
        }
    }

    switchTab(tabName) {
        document.querySelectorAll('.nav-tab, .tab-content').forEach(el => el.classList.remove('active'));
        const tabToActivate = document.querySelector(`[data-tab="${tabName}"]`);
        const contentToActivate = document.getElementById(`${tabName}-content`);
        if (tabToActivate) tabToActivate.classList.add('active');
        if (contentToActivate) contentToActivate.classList.add('active');
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
            validationStatus = `<div class="validation-status"><i class="fas fa-users"></i> Validation: ${validationCount}/1 requis</div>`;
            if (!isProposer && !hasValidated) {
                actions = `<button class="task-btn task-btn-success" data-action="validate" data-task-id="${task.id}"><i class="fas fa-check"></i> Valider</button>
                           <button class="task-btn task-btn-danger" data-action="reject" data-task-id="${task.id}"><i class="fas fa-times"></i> Rejeter</button>`;
            } else if (hasValidated) {
                actions = `<button class="task-btn task-btn-secondary" disabled><i class="fas fa-check"></i> Validée par vous</button>`;
            } else {
                actions = `<button class="task-btn task-btn-secondary" disabled><i class="fas fa-clock"></i> En attente</button>
                           <button class="task-btn task-btn-danger" data-action="delete" data-task-id="${task.id}"><i class="fas fa-trash"></i> Annuler</button>`;
            }
        } else if (type === 'active') {
            actions = `<button class="task-btn task-btn-success" data-action="complete" data-task-id="${task.id}"><i class="fas fa-check"></i> Terminer</button>`;
        } else {
            actions = `<button class="task-btn task-btn-danger" data-action="delete" data-task-id="${task.id}"><i class="fas fa-trash"></i> Effacer</button>`;
        }
        
        const dateInfo = type === 'pending' ? `Proposée par ${task.proposedBy || '...'} le ${this.formatDate(task.proposedAt)}`
                       : type === 'completed' ? `Terminée par ${task.completedBy || '...'} le ${this.formatDate(task.completedAt)}`
                       : (task.approvedAt ? `Approuvée le ${this.formatDate(task.approvedAt)}` : 'Approuvée récemment');
        
        return `<div class="task-card ${type}"><div class="task-header"><h3 class="task-title">${this.escapeHtml(task.title || 'Tâche...')}</h3></div>${task.description ? `<div class="task-description">${this.escapeHtml(task.description)}</div>` : ''}${validationStatus}<div class="task-meta">${dateInfo}</div><div class="task-actions">${actions}</div></div>`;
    }

    bindTaskActions(container) {
        container.querySelectorAll('[data-action]').forEach(button => {
            this.addTouchHandler(button, () => {
                const action = button.dataset.action;
                const taskId = button.dataset.taskId;
                this.handleAction(action, taskId);
            });
        });
    }
    
    // ========================================================================
    // SECTION DES ACTIONS UTILISATEUR (LOGIQUE FINALE ET STABLE)
    // ========================================================================
    
    async handleAction(action, taskId) {
        const urlMap = {
            propose: '/api/tasks/propose',
            validate: `/api/tasks/${taskId}/validate`,
            reject: `/api/tasks/${taskId}/reject`,
            complete: `/api/tasks/${taskId}/complete`,
            delete: `/api/tasks/${taskId}`
        };
        const methodMap = {
            propose: 'POST', validate: 'POST', reject: 'POST', complete: 'POST', delete: 'DELETE'
        };

        let body = { userId: this.currentUser };
        
        if (action === 'delete' || action === 'reject') {
            if (!confirm(`Êtes-vous sûr de vouloir ${action === 'delete' ? 'supprimer' : 'rejeter'} cette tâche ?`)) return;
        }

        this.showLoading(true);

        try {
            const response = await fetch(urlMap[action], {
                method: methodMap[action],
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...body, sessionId: this.sessionId })
            });

            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'Erreur du serveur');
            
            this.showNotification('success', 'Action réussie !', result.message);

            // MODIFIÉ : On déclenche une synchronisation pour obtenir l'état le plus récent
            await this.syncWithServer();

        } catch (error) {
            this.showNotification('error', 'Erreur', error.message);
        } finally {
            this.showLoading(false);
        }
    }

    submitNewTask() {
        const title = document.getElementById('taskTitle').value.trim();
        if (!title) return this.showNotification('warning', 'Erreur', 'Le titre est requis');
        const description = document.getElementById('taskDescription').value.trim();
        this.closeTaskModal();
        
        // La nouvelle logique passe par handleAction, on ne fait plus de mise à jour optimiste ici.
        this.handleAction('propose', null, { title, description, proposedBy: this.currentUser });
    }

    validateTask(taskId) { this.handleAction('validate', taskId); }
    completeTask(taskId) { this.handleAction('complete', taskId); }
    rejectTask(taskId) { this.handleAction('reject', taskId); }
    deleteTask(taskId) { this.handleAction('delete', taskId); }

    // --- Fonctions utilitaires ---
    openTaskModal() { const modal = document.getElementById('taskModal'); if (modal) { modal.classList.add('show'); document.getElementById('taskTitle')?.focus(); } }
    closeTaskModal() { document.getElementById('taskModal')?.classList.remove('show'); document.getElementById('taskForm')?.reset(); }
    updateBadges() {
        const activeCount = this.data.tasks.filter(t => t.status !== 'completed').length;
        const pendingCount = this.data.pendingTasks.length;
        document.getElementById('activeBadge').textContent = activeCount;
        document.getElementById('activeBadge').style.display = activeCount > 0 ? 'flex' : 'none';
        document.getElementById('pendingBadge').textContent = pendingCount;
        document.getElementById('pendingBadge').style.display = pendingCount > 0 ? 'flex' : 'none';
    }
    formatDate(dateString) { if (!dateString) return ''; const d = new Date(dateString); return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
    escapeHtml(text) { const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }; return String(text).replace(/[&<>"']/g, m => map[m]); }
    showLoading(show) { document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none'; }
    updateConnectionStatus(connected) { /* ... */ }
    showNotification(type, title, message) { /* ... */ }
}

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    window.taskManager = new MobileTaskManager();
});
