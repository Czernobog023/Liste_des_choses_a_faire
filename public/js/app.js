// Application Collaborative Maya & Rayanha - Version Finale Persistante
class MobileTaskManager {
    constructor() {
        this.currentUser = localStorage.getItem('currentUser') || 'Maya l\'abeille';
        this.sessionId = this.generateSessionId();
        this.data = {
            users: ['Maya l\'abeille', 'Rayanha'],
            tasks: [],
            pendingTasks: []
        };
        this.lastUpdate = 0;
        this.db = null;
        
        this.init();
    }
    
    generateSessionId() {
        const SHARED_SESSION_ID = 'maya_rayanha_shared_session_v3';
        localStorage.setItem('maya_rayanha_session_id', SHARED_SESSION_ID);
        return SHARED_SESSION_ID;
    }

    // MODIFIÉ : Logique d'initialisation plus robuste
    async init() {
        console.log('🚀 Initialisation Maya & Rayanha - Démarrage...');
        
        this.showLoading(true);
        this.setupEventListeners();
        
        // 1. Charger les données locales d'abord pour un affichage instantané
        await this.loadLocalData();
        this.renderAllTasks();
        this.updateBadges();
        this.showLoading(false); // On affiche l'interface le plus vite possible
        
        // 2. Ensuite, synchroniser avec le serveur en arrière-plan
        try {
            await this.syncWithServer();
            this.showNotification('success', 'Connecté', 'Application synchronisée !');
        } catch (error) {
            console.error('❌ Erreur de synchronisation initiale:', error);
            this.showNotification('warning', 'Mode hors ligne', 'Impossible de synchroniser.');
        }

        // 3. Lancer le polling pour les mises à jour en temps réel
        this.startPolling();
    }

    setupEventListeners() {
        const userSelector = document.getElementById('currentUser');
        if (userSelector) {
            userSelector.value = this.currentUser; // S'assurer que le select est correct au démarrage
            userSelector.addEventListener('change', (e) => {
                this.currentUser = e.target.value;
                localStorage.setItem('currentUser', this.currentUser); // Sauvegarder le choix
                this.showNotification('info', 'Utilisateur changé', `Vous êtes maintenant ${this.currentUser}`);
                this.renderAllTasks();
            });
        }
        // ... (le reste des écouteurs est inchangé)
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

    // On utilise simplement l'événement 'click'. C'est le plus fiable.
    element.addEventListener('click', (e) => {
        // On garde stopPropagation() pour éviter que le clic ne se propage
        // à des éléments parents, ce qui est une bonne pratique.
        e.stopPropagation(); 
        handler(e);
    });
}

    // --- Fonctions de persistance des données ---
    async initStorage() {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                console.warn('IndexedDB non supporté, fallback sur localStorage.');
                return resolve();
            }
            const request = indexedDB.open('MayaRayanhaDB', 3);
            request.onerror = (e) => { console.error('Erreur IndexedDB:', e); reject(e); };
            request.onsuccess = (e) => { this.db = e.target.result; resolve(); };
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('appData')) {
                    db.createObjectStore('appData', { keyPath: 'key' });
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
            console.log('💾 Données sauvegardées localement.');
        } catch (error) {
            console.error('❌ Erreur de sauvegarde locale:', error);
        }
    }

async loadLocalData() {
    try {
        await this.initStorage();
        let loadedData;

        if (this.db) {
            // MODIFIÉ : Utilisation correcte de la transaction IndexedDB pour lire les données
            loadedData = await new Promise((resolve, reject) => {
                const transaction = this.db.transaction('appData', 'readonly');
                const request = transaction.objectStore('appData').get('data');
                transaction.oncomplete = () => resolve(request.result?.value);
                transaction.onerror = (event) => reject(event.target.error);
            });
        } else {
            // Le fallback localStorage reste inchangé
            const localData = localStorage.getItem('maya_rayanha_data');
            loadedData = localData ? JSON.parse(localData) : null;
        }

        if (loadedData) {
            this.data.tasks = loadedData.tasks || [];
            this.data.pendingTasks = loadedData.pendingTasks || [];
            console.log('✅ Données locales chargées avec succès.');
        }
    } catch (error) {
        console.error('❌ Erreur de chargement local:', error);
    }
}
    
    
    // --- Fonctions de synchronisation et de rendu ---
    startPolling() { if (!this.pollingInterval) { this.pollingInterval = setInterval(() => this.syncWithServer(), 10000); console.log('🔄 Polling démarré (toutes les 10s)'); } }
    stopPolling() { if (this.pollingInterval) { clearInterval(this.pollingInterval); this.pollingInterval = null; console.log('⏹ Polling arrêté'); } }

    async syncWithServer() {
        try {
            const response = await fetch(`/api/data?sessionId=${this.sessionId}`);
            if (!response.ok) throw new Error('Réponse serveur non valide');
            
            const serverData = await response.json();
            
            // Logique de fusion intelligente pour ne pas écraser les tâches locales temporaires
            const localTempTasks = this.data.pendingTasks.filter(t => String(t.id).startsWith('temp_'));
            
            this.data.tasks = serverData.tasks || [];
            this.data.pendingTasks = [...(serverData.pendingTasks || []), ...localTempTasks];
            
            this.lastUpdate = serverData.timestamp || Date.now();
            await this.saveData(); // Sauvegarder l'état fusionné
            this.renderAllTasks();
            this.updateBadges();
            this.updateConnectionStatus(true);
        } catch (error) {
            console.warn('⚠️ Erreur de synchronisation:', error);
            this.updateConnectionStatus(false);
        }
    }

    renderAllTasks() { /* ... (inchangé) ... */ }
    renderTasks(type) { /* ... (inchangé) ... */ }
    createTaskCard(task, type) { /* ... (inchangé, le correctif de date est déjà appliqué) ... */ }
    bindTaskActions(container) { /* ... (inchangé) ... */ }
    openTaskModal() { /* ... (inchangé) ... */ }
    closeTaskModal() { /* ... (inchangé) ... */ }

    // ========================================================================
    // SECTION DES ACTIONS UTILISATEUR (AVEC SAUVEGARDE SYSTÉMATIQUE)
    // ========================================================================
    
    submitNewTask() {
        const title = document.getElementById('taskTitle').value.trim();
        if (!title) return this.showNotification('warning', 'Erreur', 'Le titre est requis');
        const description = document.getElementById('taskDescription').value.trim();
        this.closeTaskModal();

        const newTask = { 
            id: `temp_${Date.now()}`, 
            title, description, 
            proposedBy: this.currentUser, 
            proposedAt: new Date().toISOString(), 
            validations: [],
            status: 'pending'
        };

        this.data.pendingTasks.push(newTask);
        this.renderAllTasks();
        this.updateBadges();
        this.saveData(); // MODIFIÉ : Sauvegarde immédiate

        this.sendActionInBackground('/api/tasks/propose', 'POST', { tempId: newTask.id, title, description, proposedBy: this.currentUser });
    }

    validateTask(taskId) {
        const taskIndex = this.data.pendingTasks.findIndex(t => t.id === taskId);
        if (taskIndex === -1) return;
        const task = this.data.pendingTasks[taskIndex];
        if (task.proposedBy === this.currentUser) return this.showNotification('warning', 'Action impossible', 'Vous ne pouvez pas valider votre propre proposition.');

        this.data.pendingTasks.splice(taskIndex, 1);
        task.status = 'active';
        task.approvedAt = new Date().toISOString();
        task.validations.push(this.currentUser);
        this.data.tasks.push(task);

        this.renderAllTasks();
        this.updateBadges();
        this.saveData(); // MODIFIÉ : Sauvegarde immédiate
        this.showNotification('success', 'Tâche Approuvée !', `${task.title} est maintenant active.`);
        
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
        this.saveData(); // MODIFIÉ : Sauvegarde immédiate
        this.showNotification('success', 'Tâche Terminée !', `Vous avez terminé : ${task.title}`);
        
        this.sendActionInBackground(`/api/tasks/${taskId}/complete`, 'POST', { userId: this.currentUser });
    }

    rejectTask(taskId) {
        if (!confirm('Rejeter cette tâche ?')) return;
        this.data.pendingTasks = this.data.pendingTasks.filter(t => t.id !== taskId);
        this.renderAllTasks();
        this.updateBadges();
        this.saveData(); // MODIFIÉ : Sauvegarde immédiate
        this.showNotification('info', 'Tâche rejetée');
        this.sendActionInBackground(`/api/tasks/${taskId}/reject`, 'POST', { userId: this.currentUser });
    }

    deleteTask(taskId) {
        if (!confirm('Supprimer cette tâche définitivement ?')) return;
        this.data.tasks = this.data.tasks.filter(t => t.id !== taskId);
        this.data.pendingTasks = this.data.pendingTasks.filter(t => t.id !== taskId);
        this.renderAllTasks();
        this.updateBadges();
        this.saveData(); // MODIFIÉ : Sauvegarde immédiate
        this.showNotification('info', 'Tâche supprimée');
        this.sendActionInBackground(`/api/tasks/${taskId}`, 'DELETE', { userId: this.currentUser });
    }
    
    sendActionInBackground(url, method, body) {
        fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...body, sessionId: this.sessionId })
        })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                console.log(`📡 Action [${method}] réussie. Synchronisation à venir.`);
                // La synchronisation périodique mettra à jour l'état (ex: l'ID temporaire)
            } else {
                console.error('Erreur serveur en arrière-plan:', result.error);
                this.syncWithServer(); // Forcer une re-synchronisation pour corriger l'état en cas d'erreur
            }
        })
        .catch(error => {
            console.error('❌ Erreur réseau en arrière-plan:', error);
        });
    }

    // --- Fonctions utilitaires ---
    showLoading(show) { document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none'; }
    updateConnectionStatus(connected) { /* ... */ }
    updateBadges() {
        const activeBadge = document.getElementById('activeBadge');
        const pendingBadge = document.getElementById('pendingBadge');
        if (activeBadge) {
            const activeCount = this.data.tasks.filter(t => t.status !== 'completed').length;
            activeBadge.textContent = activeCount;
            activeBadge.style.display = activeCount > 0 ? 'flex' : 'none';
        }
        if (pendingBadge) {
            const pendingCount = this.data.pendingTasks.length;
            pendingBadge.textContent = pendingCount;
            pendingBadge.style.display = pendingCount > 0 ? 'flex' : 'none';
        }
    }
    formatDate(dateString) { if (!dateString) return ''; const date = new Date(dateString); return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
    escapeHtml(text) { const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }; return String(text).replace(/[&<>"']/g, m => map[m]); }
    showNotification(type, title, message) { /* ... */ }
}

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    window.taskManager = new MobileTaskManager();
});
