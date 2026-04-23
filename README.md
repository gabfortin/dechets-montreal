# Matières résiduelles — Bilan massique · Montréal

Visualisation interactive des quantités de matières résiduelles générées par arrondissement sur l'agglomération de Montréal, de 2012 à 2024.

**Site en ligne** : [dechets.gabfortin.com](https://dechets.gabfortin.com)

---

## Aperçu

Chaque arrondissement est représenté par un graphique à barres empilées montrant l'évolution annuelle par catégorie de matière (CRD & encombrants, recyclables, organiques, RDD, etc.). Un bouton de filtre par catégorie permet de comparer les tendances à travers tous les arrondissements simultanément.

## Source des données

[Données ouvertes — Ville de Montréal](https://donnees.montreal.ca/dataset/matieres-residuelles-bilan-massique)

Fichier CSV : `matieres-residuelles-bilan-massique.csv`

Colonnes utilisées :
- `annee` — année de collecte
- `matiere` — type de matière résiduelle
- `territoire` — arrondissement ou ville liée
- `quantite_generee_donnees_agglo` — quantité générée (tonnes), données agglomération

## Structure du projet

```
.
├── genTables.py                            # Script de génération du HTML
├── matieres-residuelles-bilan-massique.csv # Données source
├── index.html                              # Page générée (ne pas éditer manuellement)
├── img/
│   ├── Gabriel Fortin.png                  # Photo de profil (lien auteur)
│   └── recycle.svg                         # Favicon
└── CNAME                                   # Domaine GitHub Pages
```

## Génération

`index.html` est entièrement généré par `genTables.py` — ne pas l'éditer à la main.

```bash
python3 genTables.py
```

Dépendances : bibliothèque standard Python uniquement (`csv`, `json`, `collections`).

## Fonctionnement de `genTables.py`

### 1. Chargement des données (`load_data`)

- Lit le CSV et agrège les quantités par territoire / année / matière
- Exclut les territoires agrégés (`Agglomération de Montréal`, `Ville de Montréal`, `Écocentres`, etc.)
- Normalise les variantes de noms d'arrondissements (`NAME_MAP`)
- Trie les matières : CRD & encombrants en premier, puis par volume total décroissant

### 2. Construction des graphiques (`build_chart_config`)

- Génère une config [Chart.js 4](https://www.chartjs.org/) par territoire
- Graphique à barres empilées, une série par matière présente
- Les matières hors `DEFAULT_VISIBLE` reçoivent `hidden: true` dans la config du dataset — l'échelle Y est ainsi correcte dès le premier rendu, sans recalcul JavaScript post-chargement

### 3. Génération du HTML (`build_html`)

- Le Plateau-Mont-Royal est affiché en carte vedette (pleine largeur) en tête de grille
- Les autres arrondissements sont triés alphabétiquement
- Les boutons de filtre reflètent `DEFAULT_VISIBLE` via la classe `active`
- Le JS du toggle lit les boutons actifs dans le DOM (`querySelectorAll('.toggle-btn.active')`) — les boutons HTML sont la seule source de vérité pour l'état par défaut

## Catégories et couleurs

| Catégorie | Couleur |
|---|---|
| CRD & encombrants | `#f97316` |
| Recyclables | `#3b82f6` |
| Organiques | `#22c55e` |
| RDD | `#a855f7` |
| Ordures ménagères | `#ef4444` |

## Déploiement

Le site est hébergé sur **GitHub Pages** avec domaine personnalisé (`dechets.gabfortin.com` via `CNAME`).

Après chaque mise à jour des données ou du script :

```bash
python3 genTables.py
git add index.html
git commit -m "Mise à jour"
git push
```
