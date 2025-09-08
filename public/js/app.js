// Application Collaborative Maya & Rayanha - Version Client-Side Stable
class TaskManager {
    constructor() {
        // Initialise l'état de l'application
        this.currentUser = 'Maya';
        this.data = {
            tasks: [] // Une seule liste de tâches maintenant
        };
        // Charge les éléments du DOM
        this.elements = this._getElements();
        // Initialisation complète
        this._init();
    }

    /**
     * Méthode d'initialisation principale
     */
    _init() {
        console.log("🚀 Application initialisée");
        this._loadState(); // Charger les données sauvegardées
        this._setupEventListeners(); // Attacher les écouteurs d'événements
        this._render(); // Afficher l'état initial
    }

    /**
     * Récupère tous les éléments du DOM nécessaires
     */
    _getElements() {
        return {
            currentUserSelect: document.getElementById('currentUser'),
            tabs: document.querySelectorAll('.tab-link'),
            tabContents: document.querySelectorAll('.tab-content'),
            pendingTasksContainer: document.getElementById('pendingTasksContainer'),
            activeTasksContainer: document.getElementById('activeTasksContainer'),
            completedTasksContainer: document.getElementById('completedTasksContainer'),
            pendingEmpty: document.getElementById('pendingEmpty'),
            activeEmpty: document.getElementById('activeEmpty'),
            completedEmpty: document.getElementById('completedEmpty'),
            pendingBadge: document.getElementById('pendingBadge'),
            activeBadge: document.getElementById('activeBadge'),
            addTaskBtn: document.getElementById('addTaskBtn'),
            modal: document.getElementById('taskModal'),
            modalTitle: document.getElementById('modalTitle'),
            closeModalBtn: document.getElementById('closeModalBtn'),
            taskForm: document.getElementById('taskForm'),
            taskTitleInput: document.getElementById('taskTitleInput'),
            taskDescInput: document.getElementById('taskDescInput')
        };
    }

    /**
     * Attache tous les écouteurs d'événements
     */
    _setupEventListeners() {
        // Changement d'utilisateur
        this.elements.currentUserSelect.addEventListener('change', () => {
            this.currentUser = this.elements.currentUserSelect.value;
            this._saveState();
            this._render();
        });

        // Clic sur les onglets
        this.elements.tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                this._switchTab(tab.dataset.tab);
            });
        });

        // Ouvre la modale
        this.elements.addTaskBtn.addEventListener('click', () => this._openModal());

        // Ferme la modale
        this.elements.closeModalBtn.addEventListener('click', () => this._closeModal());
        this.elements.modal.addEventListener('click', (e) => {
            if (e.target === this.elements.modal) this._closeModal();
        });

        // Soumission du formulaire
        this.elements.taskForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const title = this.elements.taskTitleInput.value.trim();
            const description = this.elements.taskDescInput.value.trim();
            if (title) {
                this.proposeTask(title, description);
                this._closeModal();
            }
        });
    }

    /**
     * Logique de rendu principale, appelée après chaque changement
     */
    _render() {
        console.log("🔄 Rendu de l'interface...");

        // Filtrer les tâches pour chaque section
        const pendingTasks = this.data.tasks.filter(t => t.status === 'pending');
        const activeTasks = this.data.tasks.filter(t => t.status === 'active');
        const completedTasks = this.data.tasks.filter(t => t.status === 'completed');

        // Mettre à jour les badges
        this.elements.pendingBadge.textContent = pendingTasks.length;
        this.elements.activeBadge.textContent = activeTasks.length;
        this.elements.pendingBadge.style.display = pendingTasks.length > 0 ? 'inline-block' : 'none';
        this.elements.activeBadge.style.display = activeTasks.length > 0 ? 'inline-block' : 'none';

        // Afficher les tâches ou l'état vide
        this._renderTaskList(this.elements.pendingTasksContainer, pendingTasks, this.elements.pendingEmpty);
        this._renderTaskList(this.elements.activeTasksContainer, activeTasks, this.elements.activeEmpty);
        this._renderTaskList(this.elements.completedTasksContainer, completedTasks, this.elements.completedEmpty);
    }

    /**
     * Affiche une liste de tâches dans son conteneur
     */
    _renderTaskList(container, tasks, emptyState) {
        container.innerHTML = ''; // Vider la liste
        if (tasks.length === 0) {
            emptyState.style.display = 'block';
        } else {
            emptyState.style.display = 'none';
            tasks.forEach(task => {
                container.appendChild(this._createTaskCard(task));
            });
        }
    }

    /**
     * Crée l'élément HTML pour une seule tâche
     */
    _createTaskCard(task) {
        const card = document.createElement('div');
        card.className = 'task-card';

        const isProposer = task.proposer === this.currentUser;
        let actionsHtml = '';

        switch (task.status) {
            case 'pending':
                if (!isProposer) {
                    actionsHtml = `<button class="btn btn-success" data-action="validate" data-id="${task.id}"><i class="fas fa-check"></i> Valider</button>
                                   <button class="btn btn-danger" data-action="reject" data-id="${task.id}"><i class="fas fa-times"></i> Rejeter</button>`;
                } else {
                    actionsHtml = `<button class="btn" disabled><i class="fas fa-clock"></i> En attente</button>
                                   <button class="btn btn-danger" data-action="delete" data-id="${task.id}"><i class="fas fa-trash"></i> Annuler</button>`;
                }
                break;
            case 'active':
                actionsHtml = `<button class="btn btn-primary" data-action="complete" data-id="${task.id}"><i class="fas fa-check-double"></i> Terminer</button>`;
                break;
            case 'completed':
                actionsHtml = `<button class="btn btn-danger" data-action="delete" data-id="${task.id}"><i class="fas fa-trash"></i> Effacer</button>`;
                break;
        }

        const descriptionHtml = task.description ? `<p class="task-description">${task.description}</p>` : '';
        const metaInfo = task.status === 'pending' ? `Proposée par ${task.proposer}` : `Validée par ${task.validator}`;

        card.innerHTML = `
            <div class="task-header">${task.title}</div>
            ${descriptionHtml}
            <div class="task-meta">${metaInfo}</div>
            <div class="task-actions">${actionsHtml}</div>
        `;

        // Attacher l'écouteur d'événement pour les boutons de la carte
        card.querySelector('.task-actions').addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            const id = e.target.dataset.id;
            if (action && id) {
                this._handleTaskAction(action, id);
            }
        });

        return card;
    }

    /**
     * Gère toutes les actions sur les tâches (valider, terminer, etc.)
     */
    _handleTaskAction(action, id) {
        // Trouver la tâche correspondante
        const taskIndex = this.data.tasks.findIndex(t => t.id === id);
        if (taskIndex === -1) return;

        switch (action) {
            case 'validate':
                this.data.tasks[taskIndex].status = 'active';
                this.data.tasks[taskIndex].validator = this.currentUser;
                break;
            case 'reject':
            case 'delete':
                this.data.tasks.splice(taskIndex, 1); // Supprimer la tâche
                break;
            case 'complete':
                this.data.tasks[taskIndex].status = 'completed';
                break;
        }

        this._saveState(); // Sauvegarder le nouvel état
        this._render();   // Mettre à jour l'affichage
    }
    
    /**
     * Sauvegarde l'état actuel dans le localStorage
     */
    _saveState() {
        localStorage.setItem('taskAppData', JSON.stringify(this.data));
        localStorage.setItem('taskAppUser', this.currentUser);
        console.log("💾 État sauvegardé.");
    }

    /**
     * Charge l'état depuis le localStorage
     */
    _loadState() {
        const savedData = localStorage.getItem('taskAppData');
        const savedUser = localStorage.getItem('taskAppUser');
        if (savedData) {
            this.data = JSON.parse(savedData);
        }
        if (savedUser) {
            this.currentUser = savedUser;
            this.elements.currentUserSelect.value = savedUser;
        }
        console.log("📂 État chargé.");
    }

    /**
     * Gère le changement d'onglet
     */
    _switchTab(tabName) {
        this.elements.tabs.forEach(tab => tab.classList.remove('active'));
        this.elements.tabContents.forEach(content => content.classList.remove('active'));

        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(`${tabName}-content`).classList.add('active');
    }

    /**
     * Gère l'ouverture et la fermeture de la modale
     */
    _openModal() {
        this.elements.modal.classList.add('show');
        this.elements.taskTitleInput.focus();
    }
    _closeModal() {
        this.elements.modal.classList.remove('show');
        this.elements.taskForm.reset();
    }

    // --- ACTIONS UTILISATEUR PUBLIQUES ---
    // ========================================================================
    // SECTION DES ACTIONS UTILISATEUR (CONNECTÉE AU SERVEUR)
    // ========================================================================

    /**
     * Gère toutes les actions en communiquant avec le serveur.
     * C'est la fonction centrale qui remplace toutes les anciennes.
     * @param {string} action - L'action à effectuer (propose, validate, complete, delete)
     * @param {object} payload - Les données à envoyer au serveur
     */
    async _performServerAction(action, payload = {}) {
        // On arrête le rafraîchissement automatique pour éviter les conflits
        this.stopPolling(); 

        const endpoint = '/api/tasks'; // L'URL de base de votre API sur Vercel
        const body = {
            action: action,
            user: this.currentUser,
            ...payload
        };

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                throw new Error("Le serveur a retourné une erreur.");
            }

            // Le serveur répond avec la nouvelle liste de tâches à jour
            const updatedTasks = await response.json();
            this.data.tasks = updatedTasks; // On met à jour nos données locales

            this._saveState(); // On sauvegarde ce nouvel état
            this._render();   // On rafraîchit l'affichage

        } catch (error) {
            console.error("Erreur lors de l'action serveur :", error);
            // En cas d'erreur, on affiche un message à l'utilisateur
        } finally {
            // Quoi qu'il arrive, on relance le rafraîchissement automatique
            this.startPolling(); 
        }
    }

    // Les fonctions ci-dessous deviennent de simples raccourcis vers la fonction centrale
    proposeTask(title, description) {
        this._performServerAction('propose', { title, description });
    }

    _handleTaskAction(action, id) {
        this._performServerAction(action, { taskId: id });
    }

   
}

// Démarrage de l'application
document.addEventListener('DOMContentLoaded', () => {
    new TaskManager();
});
