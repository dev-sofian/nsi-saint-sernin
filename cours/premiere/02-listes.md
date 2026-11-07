# Listes et parcours

*Exemple de cours : remplace-le par le contenu de ton prof.*

## Créer une liste

```python
notes = [12, 15, 9, 18]
print(notes[0])     # premier élément : 12
print(len(notes))   # nombre d'éléments : 4
```

## Parcourir une liste

```python
total = 0
for n in notes:
    total = total + n
print("Moyenne :", total / len(notes))
```

## Ajouter un élément

```python
notes.append(14)
```

## À essayer

Écris une fonction `maximum(liste)` qui renvoie le plus grand élément **sans** utiliser `max()`.
