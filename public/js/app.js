// Application Collaborative Maya & Rayanha - Version Mobile Optimisée
class MobileTaskManager {
    constructor() {
        this.currentUser = 'Maya l\'abeille';
        this.socket = null;
        this.data = {
            users: ['Maya l\'abeille', 'Rayanha'],
            tasks: [],
            pendingTasks: []
        };
        this.isLoading = false;
        
        this.init();
    }

    // Initialisation de l'application
    init() {
        this.showLoading(true);
        this.setupEventListeners();
        this.initSocket();
        this.loadData().finally(() => {
            this.showLoading(false);
        });
    }

    // Configuration des écouteurs d'événements optimisés pour mobile
    setupEventListeners() {
        // Sélecteur d'utilisateur
        const userSelector = document.getElementById('currentUser');
        if (userSelector) {
            userSelector.addEventListener('change', (e) => {
                this.currentUser = e.target.value;
                this.showNotification('info', 'Utilisateur changé', `Vous êtes maintenant ${this.currentUser}`);
            });
        }

        // Navigation par onglets - optimisée touch
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
        let viewport = window.visualViewport;
        
        if (viewport) {
            viewport.addEventListener('resize', () => {
                document.documentElement.style.setProperty('--viewport-height', `${viewport.height}px`);
            });
        }
        
        // Fallback pour navigateurs sans visualViewport
        const inputs = document.querySelectorAll('input, textarea');
        inputs.forEach(input => {
            input.addEventListener('focus', () => {
                setTimeout(() => {
                    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 300);
            });
        });
    }

    // Initialisation Socket.IO
    initSocket() {
        this.socket = io({
            transports: ['websocket', 'polling']
        });
        
        this.socket.on('connect', () => {
            console.log('🔌 Connecté au serveur');
            this.updateConnectionStatus(true);
        });
        
        this.socket.on('disconnect', () => {
            console.log('❌ Déconnecté du serveur');
            this.updateConnectionStatus(false);
        });
        
        // Événements de tâches avec feedback mobile
        this.socket.on('taskProposed', (task) => {
            console.log('📨 Nouvelle tâche proposée:', task);
            this.data.pendingTasks.push(task);
            this.renderAllTasks();
            this.updateBadges();
            this.showNotification('success', 'Nouvelle tâche', `${task.proposedBy} a proposé: "${task.title}"`);
            this.vibrate();
        });
        
        this.socket.on('taskValidated', ({ taskId, userId, validations }) => {
            console.log('✅ Tâche validée:', { taskId, userId });
            const task = this.data.pendingTasks.find(t => t.id === taskId);
            if (task) {
                task.validations = validations;
                this.renderAllTasks();
                this.showNotification('info', 'Validation', `${userId} a validé une tâche`);
            }
        });
        
        this.socket.on('taskApproved', (task) => {
            console.log('🎉 Tâche approuvée:', task);
            this.data.pendingTasks = this.data.pendingTasks.filter(t => t.id !== task.id);
            this.data.tasks.push(task);
            this.renderAllTasks();
            this.updateBadges();
            this.showNotification('success', 'Tâche active', `"${task.title}" est maintenant active !`);
            this.vibrate();
        });
        
        this.socket.on('taskRejected', ({ taskId, rejectedBy }) => {
            console.log('❌ Tâche rejetée:', { taskId, rejectedBy });
            const task = this.data.pendingTasks.find(t => t.id === taskId);
            if (task) {
                this.data.pendingTasks = this.data.pendingTasks.filter(t => t.id !== taskId);
                this.renderAllTasks();
                this.updateBadges();
                this.showNotification('warning', 'Tâche rejetée', `${rejectedBy} a rejeté "${task.title}"`);
            }
        });
        
        this.socket.on('taskCompleted', (task) => {
            console.log('🏆 Tâche terminée:', task);
            const activeTask = this.data.tasks.find(t => t.id === task.id);
            if (activeTask) {
                Object.assign(activeTask, task);
                this.renderAllTasks();
                this.updateBadges();
                this.showNotification('success', 'Terminé', `"${task.title}" a été accomplie !`);
                this.vibrate([100, 50, 100]);
            }
        });
        
        this.socket.on('taskDeleted', ({ taskId, deletedBy }) => {
            console.log('🗑 Tâche supprimée:', { taskId, deletedBy });
            this.data.tasks = this.data.tasks.filter(t => t.id !== taskId);
            this.data.pendingTasks = this.data.pendingTasks.filter(t => t.id !== taskId);
            this.renderAllTasks();
            this.updateBadges();
            this.showNotification('info', 'Suppression', `${deletedBy} a supprimé une tâche`);
        });
        
        this.socket.on('dataImported', () => {
            console.log('📥 Données importées');
            this.loadData();
            this.showNotification('success', 'Import réussi', 'Nouvelles données chargées');
        });
    }

    // Vibration pour les appareils mobiles
    vibrate(pattern = 200) {
        if ('vibrate' in navigator) {
            navigator.vibrate(pattern);
        }
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

    // Charger les données depuis l'API
    async loadData() {
        try {
            const response = await fetch('/api/data');
            if (response.ok) {
                this.data = await response.json();
                this.renderAllTasks();
                this.updateBadges();
            } else {
                throw new Error('Erreur de chargement des données');
            }
        } catch (error) {
            console.error('❌ Erreur lors du chargement:', error);
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
            this.addTouchHandler(button, () => {
                const action = button.dataset.action;
                const taskId = button.dataset.taskId;
                
                switch (action) {
                    case 'validate':
                        this.validateTask(taskId);
                        break;
                    case 'reject':
                        this.rejectTask(taskId);
                        break;
                    case 'complete':
                        this.completeTask(taskId);
                        break;
                    case 'delete':
                        this.deleteTask(taskId);
                        break;
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
                    proposedBy: this.currentUser
                })
            });

            if (response.ok) {
                this.closeTaskModal();
                this.showNotification('success', 'Tâche proposée', 'En attente de validation');
                this.vibrate();
            } else {
                const error = await response.json();
                this.showNotification('error', 'Erreur', error.error || 'Erreur lors de la proposition');
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
        
        try {
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const error = await response.json();
                this.showNotification('error', 'Erreur', error.error || 'Erreur lors de l\'action');
            }
        } catch (error) {
            console.error('❌ Erreur action:', error);
            this.showNotification('error', 'Erreur', 'Erreur de connexion');
        } finally {
            this.showLoading(false);
        }
    }

    // Export des données
    async exportData() {
        try {
            const response = await fetch('/api/export');
            if (response.ok) {
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `maya-rayanha-taches-${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                this.showNotification('success', 'Export réussi', 'Fichier téléchargé');
            }
        } catch (error) {
            console.error('❌ Erreur export:', error);
            this.showNotification('error', 'Erreur', 'Erreur lors de l\'export');
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
                body: JSON.stringify(data)
            });

            if (response.ok) {
                this.showNotification('success', 'Import réussi', 'Données importées');
                this.vibrate();
            } else {
                const error = await response.json();
                this.showNotification('error', 'Erreur d\'import', error.error || 'Format invalide');
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
            if (text) text.textContent = 'Déconnecté';
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
    console.log('🚀 Initialisation de l\'application mobile');
    window.taskManager = new MobileTaskManager();
});

// Gestion des erreurs globales
window.addEventListener('error', (event) => {
    console.error('❌ Erreur globale:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('❌ Promise rejetée:', event.reason);
});

// Gestion de la visibilité de la page (économie de batterie)
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        console.log('📱 Application en arrière-plan');
    } else {
        console.log('📱 Application au premier plan');
        if (window.taskManager && window.taskManager.socket && !window.taskManager.socket.connected) {
            window.taskManager.socket.connect();
        }
    }
});

// Service Worker pour PWA (si disponible)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(() => {
            console.log('📱 Service Worker enregistré');
        }).catch(() => {
            console.log('📱 Service Worker non disponible');
        });
    });
}