// C'est notre "base de données" en mémoire.
// Elle sera partagée par tous les utilisateurs de votre application.
let tasks = [];
let pendingTasks = [];

// C'est la fonction principale de notre serveur.
// Elle reçoit la requête de l'application et y répond.
export default function handler(request, response) {
    // On s'assure que la requête est bien de type POST
    if (request.method !== 'POST') {
        return response.status(405).json({ success: false, error: 'Méthode non autorisée' });
    }

    // On récupère les données envoyées par l'application
    const { action, user, taskId, title, description } = request.body;

    // On traite l'action demandée
    try {
        switch (action) {
            case 'propose':
                const newTask = {
                    id: `task_${Date.now()}`,
                    title,
                    description,
                    proposer: user,
                    validator: null,
                    status: 'pending',
                    validations: [],
                    proposedAt: new Date().toISOString()
                };
                pendingTasks.push(newTask);
                break;

            case 'validate':
                const taskToValidateIndex = pendingTasks.findIndex(t => t.id === taskId);
                if (taskToValidateIndex > -1) {
                    const task = pendingTasks[taskToValidateIndex];
                    // On vérifie qu'un utilisateur ne valide pas sa propre tâche
                    if (task.proposer !== user) {
                        pendingTasks.splice(taskToValidateIndex, 1); // On la retire de "en attente"
                        task.status = 'active';
                        task.validator = user;
                        task.approvedAt = new Date().toISOString();
                        tasks.push(task); // On l'ajoute à "actives"
                    }
                }
                break;

            case 'complete':
                const taskToComplete = tasks.find(t => t.id === taskId);
                if (taskToComplete) {
                    taskToComplete.status = 'completed';
                    taskToComplete.completedBy = user;
                    taskToComplete.completedAt = new Date().toISOString();
                }
                break;
            
            case 'reject':
                pendingTasks = pendingTasks.filter(t => t.id !== taskId);
                break;

            case 'delete':
                tasks = tasks.filter(t => t.id !== taskId);
                pendingTasks = pendingTasks.filter(t => t.id !== taskId);
                break;

            default:
                throw new Error('Action non reconnue');
        }

        // Si tout s'est bien passé, on renvoie la nouvelle liste de tâches complète.
        // C'est cette réponse qui met à jour l'application pour tout le monde.
        response.status(200).json({ success: true, tasks, pendingTasks });

    } catch (error) {
        response.status(400).json({ success: false, error: error.message });
    }
}
