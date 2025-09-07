// Application de Gestion de Tâches Collaboratives
class TaskManager {
    constructor() {
        this.currentUser = 'Maya l\'abeille';
        this.socket = null;
        this.data = {
            users: [],
            tasks: [],
            pendingTasks: []
        };
        
        this.init();
    }

    // Initialisation de l'application
    init() {
        this.initSocket();
        this.initEventListeners();
        this.loadData();
    }

    // Initialisation de Socket.IO
    initSocket() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            this.updateConnectionStatus(true);
        });
        
        this.socket.on('disconnect', () => {
            this.updateConnectionStatus(false);
        });
        
        // Écouter les événements de tâches
        this.socket.on('taskProposed', (task) => {
            this.data.pendingTasks.push(task);
            this.renderPendingTasks();
            this.updatePendingCount();
            this.showNotification('success', 'Nouvelle tâche proposée', `${task.proposedBy} a proposé: ${task.title}`);
        });
        
        this.socket.on('taskValidated', ({ taskId, userId, validations }) => {
            const task = this.data.pendingTasks.find(t => t.id === taskId);
            if (task) {
                task.validations = validations;
                this.renderPendingTasks();
                this.showNotification('info', 'Tâche validée', `${userId} a validé la tâche`);
            }
        });
        
        this.socket.on('taskApproved', (task) => {
            this.data.pendingTasks = this.data.pendingTasks.filter(t => t.id !== task.id);
            this.data.tasks.push(task);
            this.renderActiveTasks();
            this.renderPendingTasks();
            this.updatePendingCount();
            this.showNotification('success', 'Tâche approuvée', `La tâche "${task.title}" est maintenant active !`);
        });
        
        this.socket.on('taskRejected', ({ taskId, rejectedBy }) => {
            const task = this.data.pendingTasks.find(t => t.id === taskId);
            if (task) {
                this.data.pendingTasks = this.data.pendingTasks.filter(t => t.id !== taskId);
                this.renderPendingTasks();
                this.updatePendingCount();
                this.showNotification('warning', 'Tâche rejetée', `${rejectedBy} a rejeté la tâche "${task.title}"`);
            }
        });
        
        this.socket.on('taskCompleted', (task) => {
            const activeTask = this.data.tasks.find(t => t.id === task.id);
            if (activeTask) {
                Object.assign(activeTask, task);
                this.renderActiveTasks();
                this.renderCompletedTasks();
                this.showNotification('success', 'Tâche terminée', `"${task.title}" a été marquée comme terminée !`);
            }
        });
        
        this.socket.on('taskDeleted', ({ taskId, deletedBy }) => {
            this.data.tasks = this.data.tasks.filter(t => t.id !== taskId);
            this.data.pendingTasks = this.data.pendingTasks.filter(t => t.id !== taskId);
            this.renderActiveTasks();
            this.renderPendingTasks();
            this.renderCompletedTasks();
            this.updatePendingCount();
            this.showNotification('info', 'Tâche supprimée', `${deletedBy} a supprimé une tâche`);
        });
        
        this.socket.on('dataImported', ({ message }) => {
            this.loadData();
            this.showNotification('success', 'Import réussi', message);
        });
    }

    // Initialisation des écouteurs d'événements
    initEventListeners() {
        // Sélecteur d'utilisateur
        document.getElementById('currentUser').addEventListener('change', (e) => {
            this.currentUser = e.target.value;
        });

        // Navigation par onglets
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const targetTab = e.currentTarget.dataset.tab;
                this.switchTab(targetTab);
            });
        });

        // Bouton nouvelle tâche
        document.getElementById('addTaskBtn').addEventListener('click', () => {
            this.openTaskModal();
        });

        // Modal de tâche
        document.getElementById('taskForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitNewTask();
        });

        document.getElementById('cancelTaskBtn').addEventListener('click', () => {
            this.closeTaskModal();
        });

        document.querySelector('.modal-close').addEventListener('click', () => {
            this.closeTaskModal();
        });

        // Fermer modal en cliquant en dehors
        document.getElementById('taskModal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                this.closeTaskModal();
            }
        });

        // Boutons export/import
        document.getElementById('exportBtn').addEventListener('click', () => {
            this.exportData();
        });

        document.getElementById('importBtn').addEventListener('click', () => {
            document.getElementById('importFile').click();
        });

        document.getElementById('importFile').addEventListener('change', (e) => {
            this.importData(e.target.files[0]);
        });
    }

    // Changer d'onglet
    switchTab(tabName) {
        // Mettre à jour les onglets
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Mettre à jour les sections
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.remove('active');
        });
        document.getElementById(`${tabName}-section`).classList.add('active');
    }

    // Charger les données depuis l'API
    async loadData() {
        try {
            const response = await fetch('/api/data');
            this.data = await response.json();
            this.renderAllTasks();
            this.updatePendingCount();
        } catch (error) {
            console.error('Erreur lors du chargement des données:', error);
            this.showNotification('error', 'Erreur', 'Impossible de charger les données');
        }
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
        const emptyState = document.getElementById('emptyActiveTasks');
        const activeTasks = this.data.tasks.filter(task => task.status !== 'completed');

        if (activeTasks.length === 0) {
            container.innerHTML = '';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';
        container.innerHTML = activeTasks.map(task => this.createTaskCard(task, 'active')).join('');
    }

    // Rendu des tâches en attente
    renderPendingTasks() {
        const container = document.getElementById('pendingTasks');
        const emptyState = document.getElementById('emptyPendingTasks');

        if (this.data.pendingTasks.length === 0) {
            container.innerHTML = '';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';
        container.innerHTML = this.data.pendingTasks.map(task => this.createTaskCard(task, 'pending')).join('');
    }

    // Rendu des tâches terminées
    renderCompletedTasks() {
        const container = document.getElementById('completedTasks');
        const emptyState = document.getElementById('emptyCompletedTasks');
        const completedTasks = this.data.tasks.filter(task => task.status === 'completed');

        if (completedTasks.length === 0) {
            container.innerHTML = '';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';
        container.innerHTML = completedTasks.map(task => this.createTaskCard(task, 'completed')).join('');
    }

    // Créer une carte de tâche
    createTaskCard(task, type) {
        const isCurrentUserTask = type === 'pending' && task.proposedBy === this.currentUser;
        const hasValidated = type === 'pending' && task.validations.includes(this.currentUser);
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
                    <button class="btn btn-success btn-sm" onclick="taskManager.validateTask('${task.id}')">
                        <i class="fas fa-check"></i> Valider
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="taskManager.rejectTask('${task.id}')">
                        <i class="fas fa-times"></i> Rejeter
                    </button>
                `;
            } else if (hasValidated) {
                actions = `
                    <span class="btn btn-secondary btn-sm" disabled>
                        <i class="fas fa-check"></i> Déjà validée
                    </span>
                `;
            } else if (isCurrentUserTask) {
                actions = `
                    <span class="btn btn-secondary btn-sm" disabled>
                        <i class="fas fa-clock"></i> En attente
                    </span>
                    <button class="btn btn-danger btn-sm" onclick="taskManager.deleteTask('${task.id}')">
                        <i class="fas fa-trash"></i> Supprimer
                    </button>
                `;
            }
        } else if (type === 'active') {
            actions = `
                <button class="btn btn-success btn-sm" onclick="taskManager.completeTask('${task.id}')">
                    <i class="fas fa-check"></i> Terminer
                </button>
                <button class="btn btn-danger btn-sm" onclick="taskManager.deleteTask('${task.id}')">
                    <i class="fas fa-trash"></i> Supprimer
                </button>
            `;
        } else if (type === 'completed') {
            actions = `
                <button class="btn btn-danger btn-sm" onclick="taskManager.deleteTask('${task.id}')">
                    <i class="fas fa-trash"></i> Supprimer
                </button>
            `;
        }

        const dateInfo = type === 'pending' 
            ? `Proposée par ${task.proposedBy} le ${new Date(task.proposedAt).toLocaleDateString()}`
            : type === 'completed'
            ? `Terminée par ${task.completedBy} le ${new Date(task.completedAt).toLocaleDateString()}`
            : `Approuvée le ${new Date(task.approvedAt).toLocaleDateString()}`;

        return `
            <div class="task-card ${type}">
                <div class="task-header">
                    <h3 class="task-title">${task.title}</h3>
                </div>
                ${task.description ? `<p class="task-description">${task.description}</p>` : ''}
                ${validationStatus}
                <div class="task-meta">
                    <div>${dateInfo}</div>
                </div>
                <div class="task-actions">
                    ${actions}
                </div>
            </div>
        `;
    }

    // Ouvrir le modal de nouvelle tâche
    openTaskModal() {
        document.getElementById('taskModal').classList.add('show');
        document.getElementById('taskTitle').focus();
    }

    // Fermer le modal de tâche
    closeTaskModal() {
        document.getElementById('taskModal').classList.remove('show');
        document.getElementById('taskForm').reset();
    }

    // Soumettre une nouvelle tâche
    async submitNewTask() {
        const title = document.getElementById('taskTitle').value.trim();
        const description = document.getElementById('taskDescription').value.trim();

        if (!title) {
            this.showNotification('warning', 'Erreur', 'Le titre de la tâche est requis');
            return;
        }

        try {
            const response = await fetch('/api/tasks/propose', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    title,
                    description,
                    proposedBy: this.currentUser
                })
            });

            if (response.ok) {
                this.closeTaskModal();
                this.showNotification('success', 'Tâche proposée', 'Votre tâche a été proposée et attend une validation');
            } else {
                const error = await response.json();
                this.showNotification('error', 'Erreur', error.error || 'Erreur lors de la proposition');
            }
        } catch (error) {
            console.error('Erreur lors de la soumission:', error);
            this.showNotification('error', 'Erreur', 'Erreur de connexion');
        }
    }

    // Valider une tâche
    async validateTask(taskId) {
        try {
            const response = await fetch(`/api/tasks/${taskId}/validate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId: this.currentUser
                })
            });

            if (!response.ok) {
                const error = await response.json();
                this.showNotification('error', 'Erreur', error.error || 'Erreur lors de la validation');
            }
        } catch (error) {
            console.error('Erreur lors de la validation:', error);
            this.showNotification('error', 'Erreur', 'Erreur de connexion');
        }
    }

    // Rejeter une tâche
    async rejectTask(taskId) {
        if (!confirm('Êtes-vous sûr de vouloir rejeter cette tâche ?')) {
            return;
        }

        try {
            const response = await fetch(`/api/tasks/${taskId}/reject`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId: this.currentUser
                })
            });

            if (!response.ok) {
                const error = await response.json();
                this.showNotification('error', 'Erreur', error.error || 'Erreur lors du rejet');
            }
        } catch (error) {
            console.error('Erreur lors du rejet:', error);
            this.showNotification('error', 'Erreur', 'Erreur de connexion');
        }
    }

    // Terminer une tâche
    async completeTask(taskId) {
        try {
            const response = await fetch(`/api/tasks/${taskId}/complete`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId: this.currentUser
                })
            });

            if (!response.ok) {
                const error = await response.json();
                this.showNotification('error', 'Erreur', error.error || 'Erreur lors de la complétion');
            }
        } catch (error) {
            console.error('Erreur lors de la complétion:', error);
            this.showNotification('error', 'Erreur', 'Erreur de connexion');
        }
    }

    // Supprimer une tâche
    async deleteTask(taskId) {
        if (!confirm('Êtes-vous sûr de vouloir supprimer cette tâche ?')) {
            return;
        }

        try {
            const response = await fetch(`/api/tasks/${taskId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId: this.currentUser
                })
            });

            if (!response.ok) {
                const error = await response.json();
                this.showNotification('error', 'Erreur', error.error || 'Erreur lors de la suppression');
            }
        } catch (error) {
            console.error('Erreur lors de la suppression:', error);
            this.showNotification('error', 'Erreur', 'Erreur de connexion');
        }
    }

    // Exporter les données
    async exportData() {
        try {
            const response = await fetch('/api/export');
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `tasks-export-${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
                this.showNotification('success', 'Export réussi', 'Vos données ont été exportées');
            }
        } catch (error) {
            console.error('Erreur lors de l\'export:', error);
            this.showNotification('error', 'Erreur', 'Erreur lors de l\'export');
        }
    }

    // Importer des données
    async importData(file) {
        if (!file) return;

        try {
            const text = await file.text();
            const data = JSON.parse(text);

            const response = await fetch('/api/import', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                this.showNotification('success', 'Import réussi', 'Les données ont été importées');
            } else {
                const error = await response.json();
                this.showNotification('error', 'Erreur d\'import', error.error || 'Format de fichier invalide');
            }
        } catch (error) {
            console.error('Erreur lors de l\'import:', error);
            this.showNotification('error', 'Erreur', 'Fichier invalide ou erreur de lecture');
        }

        // Réinitialiser l'input file
        document.getElementById('importFile').value = '';
    }

    // Mettre à jour le compteur de tâches en attente
    updatePendingCount() {
        document.getElementById('pendingCount').textContent = this.data.pendingTasks.length;
    }

    // Mettre à jour le statut de connexion
    updateConnectionStatus(connected) {
        const status = document.getElementById('connectionStatus');
        const icon = status.querySelector('i');
        const text = status.querySelector('span');

        if (connected) {
            status.classList.remove('disconnected');
            icon.className = 'fas fa-wifi';
            text.textContent = 'Connecté';
        } else {
            status.classList.add('disconnected');
            icon.className = 'fas fa-exclamation-triangle';
            text.textContent = 'Déconnecté';
        }
    }

    // Afficher une notification
    showNotification(type, title, message) {
        const container = document.getElementById('notifications');
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
                    <div class="notification-title">${title}</div>
                    <div class="notification-message">${message}</div>
                </div>
            </div>
        `;

        container.appendChild(notification);

        // Animer l'apparition
        setTimeout(() => notification.classList.add('show'), 10);

        // Supprimer automatiquement après 5 secondes
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    container.removeChild(notification);
                }
            }, 300);
        }, 5000);
    }
}

// Initialiser l'application
const taskManager = new TaskManager();

// Exposer globalement pour les handlers onclick
window.taskManager = taskManager;