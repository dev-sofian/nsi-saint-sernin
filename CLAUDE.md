# Instructions pour Claude

Avant toute tâche, lis `README.md` (architecture, conventions, règles de sécurité) puis `TODO.md` (feuille de route et décisions en attente).
Réponds et commente le code en français.

- Règles Firebase : modifier `outils/regles.template.jsonc`, puis `node outils/generer-regles.mjs`. Ne jamais modifier `database.rules.json` à la main.
- Vérifications avant de proposer un commit : `node --test serveur/jetons/` et `node outils/generer-regles.mjs --verifier`.
- Le serveur de visio tourne sur le PC personnel d'un élève : la sécurité passe avant la facilité. Aucun secret dans le dépôt.
