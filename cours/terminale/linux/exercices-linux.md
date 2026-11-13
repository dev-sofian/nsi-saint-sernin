# Linux : la ligne de commande, mémo et exercices

> 📝 **Fiche complémentaire écrite pour le site NSI St Sernin** : ce n'est pas un document du prof.
> Le cours de référence reste le sien. Si quelque chose ne colle pas avec ce qu'il a dit en classe, c'est lui qui a raison.

## Où s'entraîner

- **Linux** ou **macOS** : ouvre l'application *Terminal*.
- **Windows** : installe *Git for Windows* et ouvre *Git Bash*, ou active WSL (Linux dans Windows).

Les commandes sont les mêmes partout. Fais les exercices **sur papier d'abord**, puis vérifie dans un terminal.

## L'arborescence

Sous Linux, tous les fichiers sont rangés dans un seul arbre dont la racine s'appelle `/`.
Voici l'arbre utilisé dans les exercices :

```
/
├── etc
├── home
│   └── eleve                ← dossier personnel de l'utilisateur eleve
│       ├── Documents
│       │   └── nsi
│       │       ├── cours.txt
│       │       └── tp
│       │           └── tp1.py
│       └── Images
│           └── chat.png
└── tmp
```

- Un **chemin absolu** part de la racine et commence par `/` : `/home/eleve/Images/chat.png`.
- Un **chemin relatif** part du **répertoire courant** (celui où l'on se trouve, affiché par `pwd`).
- `.` désigne le répertoire courant, `..` le répertoire parent, `~` le dossier personnel (ici `/home/eleve`).

## Mémo des commandes

| Commande | Effet |
|---|---|
| `pwd` | affiche le répertoire courant |
| `ls` | liste le contenu du répertoire courant |
| `ls -l` | liste détaillée (droits, propriétaire, taille, date) |
| `ls -a` | liste aussi les fichiers cachés (ceux qui commencent par `.`) |
| `cd nsi` | entre dans le répertoire `nsi` |
| `cd ..` | remonte au répertoire parent |
| `cd` (seul) | retourne au dossier personnel |
| `mkdir tp2` | crée le répertoire `tp2` |
| `touch a.py` | crée le fichier vide `a.py` (ou met à jour sa date s'il existe) |
| `cat a.py` | affiche le contenu du fichier |
| `cp a.py b.py` | copie `a.py` en `b.py` |
| `cp -r tp tp_copie` | copie un répertoire et tout son contenu |
| `mv a.py tp/` | déplace `a.py` dans `tp` |
| `mv a.py b.py` | renomme `a.py` en `b.py` |
| `rm a.py` | supprime le fichier (**pas de corbeille !**) |
| `rm -r tp` | supprime le répertoire et tout son contenu (**prudence**) |
| `echo "bonjour" > f.txt` | écrit dans `f.txt` en **écrasant** son contenu |
| `echo "bonjour" >> f.txt` | écrit à la **fin** de `f.txt` |
| `commande1 \| commande2` | envoie le résultat de la commande 1 à la commande 2 (le *pipe*) |
| `man ls` | affiche le manuel de la commande `ls` (touche `q` pour quitter) |

## Les droits

`ls -l` affiche par exemple :

```
-rwxr-x---  1 eleve nsi  120 nov. 13 10:00 script.sh
```

Le premier caractère donne le type (`-` fichier, `d` répertoire). Viennent ensuite **trois groupes de trois lettres** :
les droits du **propriétaire** (`u`), du **groupe** (`g`), puis des **autres** (`o`).

- `r` : lire, `w` : écrire (modifier), `x` : exécuter (pour un répertoire : y entrer).
- En chiffres : `r = 4`, `w = 2`, `x = 1`, et on additionne. Ici `rwx r-x ---` donne `7 5 0`.

On change les droits avec `chmod` :

```bash
chmod 750 script.sh     # rwx r-x ---
chmod u+x script.sh     # ajoute x pour le propriétaire
chmod go-w notes.txt    # retire w au groupe et aux autres
```

---

## 🟢 Exercice 1 : les chemins

On se trouve dans `/home/eleve/Documents/nsi`. Donne :

1. le chemin **absolu** de `tp1.py` ;
2. le chemin **relatif** de `tp1.py` ;
3. le chemin **relatif** de `chat.png` ;
4. le chemin de `chat.png` en utilisant `~`.

<details>
<summary><b>Voir la réponse</b></summary>

1. `/home/eleve/Documents/nsi/tp/tp1.py`
2. `tp/tp1.py` (ou `./tp/tp1.py`)
3. `../../Images/chat.png` : on remonte deux fois (`nsi` → `Documents` → `eleve`), puis on descend dans `Images`.
4. `~/Images/chat.png`

</details>

## 🟢 Exercice 2 : où suis-je ?

On part de `/home/eleve` et on tape :

```bash
cd Documents/nsi/tp
cd ..
cd ../../Images
pwd
```

Qu'affiche `pwd` ? Donne le répertoire courant après **chaque** ligne.

<details>
<summary><b>Voir la réponse</b></summary>

| Commande | Répertoire courant |
|---|---|
| `cd Documents/nsi/tp` | `/home/eleve/Documents/nsi/tp` |
| `cd ..` | `/home/eleve/Documents/nsi` |
| `cd ../../Images` | `/home/eleve/Images` |

`pwd` affiche donc `/home/eleve/Images`.

</details>

## 🟡 Exercice 3 : créer un projet

Depuis ton dossier personnel, écris les commandes qui créent cette arborescence,
où `README.txt` contient la ligne `Mon projet` :

```
projet
├── README.txt
├── src
│   └── main.py
└── tests
```

<details>
<summary><b>Voir une solution</b></summary>

```bash
mkdir projet
cd projet
mkdir src tests
touch src/main.py
echo "Mon projet" > README.txt
```

Pour vérifier : `ls` affiche `README.txt  src  tests`, et `cat README.txt` affiche `Mon projet`.

</details>

## 🟡 Exercice 4 : écraser ou ajouter ?

Dans un répertoire **vide**, on tape :

```bash
echo "ligne 1" > notes.txt
echo "ligne 2" >> notes.txt
echo "ligne 3" > notes.txt
cat notes.txt
cp notes.txt copie.txt
mv copie.txt sauvegarde.txt
ls
```

1. Qu'affiche `cat notes.txt` ?
2. Qu'affiche `ls` à la fin ?

<details>
<summary><b>Voir la réponse</b></summary>

1. Seulement `ligne 3`. La 2ᵉ commande ajoute `ligne 2` à la fin, mais la 3ᵉ utilise `>`, qui **écrase** tout le contenu.
2. `notes.txt  sauvegarde.txt` : `copie.txt` a été renommé par `mv`, il n'existe plus sous ce nom.

</details>

## 🟡 Exercice 5 : les droits

1. Que peuvent faire le propriétaire, le groupe et les autres sur un fichier `-rw-r--r--` ? Donne le nombre à 3 chiffres.
2. Même question pour un répertoire `drwxr-x---`.
3. Quelle commande donne à `jeu.py` les droits : propriétaire tout, groupe et autres seulement lire et exécuter ?
4. Quelle commande rend `journal.txt` **privé** (seul le propriétaire peut le lire et le modifier) ?

<details>
<summary><b>Voir la réponse</b></summary>

1. Propriétaire : lire et écrire ; groupe et autres : lire seulement. `rw- r-- r--` donne `644`.
2. C'est un répertoire (`d`). Propriétaire : tout ; groupe : lister et entrer ; autres : rien. `750`.
3. `chmod 755 jeu.py`
4. `chmod 600 journal.txt` (ou `chmod go-rwx journal.txt` s'il avait déjà `rw` pour le propriétaire).

</details>

## 🟡 Exercice 6 : le pipe

`wc -l` compte les lignes de ce qu'il reçoit, et `grep motif` ne garde que les lignes qui contiennent `motif`.
Que font ces commandes ?

```bash
ls | wc -l
grep "def" tp1.py
grep "def" tp1.py | wc -l
```

<details>
<summary><b>Voir la réponse</b></summary>

1. `ls | wc -l` compte les fichiers et répertoires (non cachés) du répertoire courant : `ls` en écrit un par ligne quand son résultat part dans un pipe.
2. `grep "def" tp1.py` affiche les lignes de `tp1.py` qui contiennent `def` : en Python, ce sont surtout les définitions de fonctions.
3. Le pipe envoie ces lignes à `wc -l` : on obtient leur **nombre**, donc à peu près le nombre de fonctions du fichier.

</details>

## 🔴 Exercice 7 : les processus

Un programme en cours d'exécution s'appelle un **processus**. Le système lui donne un numéro unique, le **PID**.

| Commande | Effet |
|---|---|
| `ps` | liste les processus lancés depuis ce terminal |
| `ps aux` | liste **tous** les processus du système |
| `top` | affiche les processus en direct, les plus gourmands en haut (`q` pour quitter) |
| `kill 4242` | demande au processus de PID 4242 de s'arrêter |
| `kill -9 4242` | arrête le processus de force (s'il ne répond plus) |

Tu as lancé `python3 boucle.py`, qui contient une boucle infinie, et ton terminal ne répond plus.

1. Comment l'arrêter **depuis ce terminal** ?
2. Comment l'arrêter **depuis un autre terminal** ? Donne les deux commandes.

<details>
<summary><b>Voir la réponse</b></summary>

1. `Ctrl + C` interrompt le programme qui tourne au premier plan.
2. On cherche son PID, puis on l'arrête :

```bash
ps aux | grep boucle.py     # la 2e colonne est le PID, par exemple 4242
kill 4242                   # et kill -9 4242 s'il refuse de s'arrêter
```

</details>

## 🔴 Exercice 8 : un premier script

Un **script** est un fichier qui contient une suite de commandes. Voici `sauvegarde.sh` :

```bash
#!/bin/bash
mkdir -p sauvegarde
cp *.py sauvegarde/
echo "Sauvegarde terminée"
```

1. Que fait ce script ? (`*.py` désigne tous les fichiers dont le nom finit par `.py`, et `-p` évite une erreur si le répertoire existe déjà.)
2. `ls -l` affiche `-rw-r--r--` pour `sauvegarde.sh`. Pourquoi `./sauvegarde.sh` est-il refusé ? Comment corriger ?

<details>
<summary><b>Voir la réponse</b></summary>

1. Il crée le répertoire `sauvegarde` s'il n'existe pas, y copie tous les fichiers Python du répertoire courant, puis affiche `Sauvegarde terminée`.
2. Personne n'a le droit `x` (exécution). On l'ajoute au propriétaire avec `chmod u+x sauvegarde.sh`, puis `./sauvegarde.sh` fonctionne.

</details>

---

## ✅ Bilan

- Un chemin **absolu** commence par `/` ; un chemin **relatif** part du répertoire courant (`pwd`), avec `.` et `..`.
- `>` **écrase**, `>>` **ajoute** ; `|` envoie le résultat d'une commande à la suivante.
- Les droits `rwx` se lisent par trois : propriétaire, groupe, autres ; `chmod` les modifie (`r=4`, `w=2`, `x=1`).
- `rm` ne passe pas par une corbeille : vérifie toujours avec `pwd` et `ls` avant de supprimer.
