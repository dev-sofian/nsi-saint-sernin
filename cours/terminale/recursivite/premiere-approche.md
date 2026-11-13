# La récursivité

Une fonction est **récursive** quand elle s'appelle elle-même.

Il faut toujours :

1. un **cas de base**, qui arrête les appels ;
2. un **appel récursif** sur un problème plus petit.

## Exemple : la factorielle

```python
def factorielle(n):
    if n == 0:          # cas de base
        return 1
    return n * factorielle(n - 1)   # appel récursif

print(factorielle(5))   # 120
```

## À essayer

Écris une fonction récursive `somme(n)` qui renvoie 1 + 2 + … + n.
