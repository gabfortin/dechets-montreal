# Matières résiduelles Montréal — bilan massique

Tableau de bord des tonnes de matières résiduelles **générées** dans chacun
des 33 arrondissements et villes liées de l'agglomération de Montréal, de 2012
à 2024, par catégorie. Pour les citoyen·nes, les élu·es et les journalistes
qui veulent comparer les territoires ou suivre l'évolution d'un arrondissement.

**En ligne :** [dechets.gabfortin.com](https://dechets.gabfortin.com)

## Contenu

| Section | Ce qu'elle montre |
|---|---|
| **En-tête** | Chiffres clés du Plateau-Mont-Royal pour la dernière année publiée, date des données |
| **Catégories affichées** | Boutons qui affichent ou masquent une catégorie dans **tous** les graphiques |
| **Le Plateau-Mont-Royal** | Graphique en vedette (barres empilées par année) |
| **Tous les arrondissements et villes liées** | Un graphique par territoire, ordre alphabétique |
| **Sources et limites** | Source, colonne utilisée, correspondance des catégories, limites |

Chaque graphique a sa version en tableau (« Voir les données en tableau »).

## Données

### Sources

| Source | Producteur, licence | Utilisée pour |
|---|---|---|
| [Matières résiduelles — bilan massique](https://donnees.montreal.ca/dataset/matieres-residuelles-bilan-massique) | Ville de Montréal, CC BY 4.0 | Tout le site. Fichier `matieres-residuelles-bilan-massique.csv` ; colonnes `annee`, `matiere`, `territoire`, `quantite_generee_donnees_agglo` (quantité générée, en tonnes) |

### Mise à jour

**À la main**, quand la Ville publie un nouveau fichier (pas de robot : la
source change environ une fois par année) :

```bash
# 1. remplacer matieres-residuelles-bilan-massique.csv par la nouvelle version
python3 genTables.py          # régénère data/bilan-massique.json
python3 -m http.server 8000   # vérifier la page sur http://localhost:8000
```

Le script s'arrête avec une erreur, plutôt que de publier un chiffre faux, si
une quantité est illisible, si une nouvelle catégorie apparaît sans être
déclarée dans `MATIERES`, ou si deux variantes d'un même nom de territoire se
retrouvent la même année.

### Mises en garde

- **Quantité générée seulement** : les quantités collectées, taux de
  récupération et données CMM de la source ne sont pas affichés.
- **« NA » dans la source** = aucune valeur : rien dans le graphique, « — »
  dans le tableau. Les RDD ne sont publiés par territoire que de 2012 à 2019 ;
  plusieurs catégories (ordures ménagères, textiles, électroniques…) n'ont
  aucune quantité générée par territoire et n'apparaissent pas. La liste est
  calculée par le script (`meta.sans_donnees`) et affichée dans la page.
- **Territoires agrégés exclus** (`EXCLUDED`) : Agglomération de Montréal,
  Ville de Montréal, Écocentres, Écocentres et collectes itinérantes.
- **Noms harmonisés** (`NAME_MAP`) : la source écrit certains noms de deux
  façons selon l'année (« Rosemont - La Petite-Patrie » /
  « Rosemont–La Petite-Patrie »).
- **Séparateur de milliers** : en 2024, la source écrit les milliers avec une
  espace insécable (« 15 523 »). Avant novembre 2026, le script ne retirait
  que les espaces ordinaires et ces 84 valeurs étaient affichées à 0
  (recyclables, organiques et CRD de 2024). Corrigé dans `parse_quantity()`.
- **Échelle propre à chaque graphique** : comparer les tonnes, pas la hauteur
  des barres.
- Initiative indépendante : ni produite ni approuvée par la Ville de Montréal.

## Utilisation locale

```bash
python3 -m http.server 8000   # http://localhost:8000
```

Un serveur est nécessaire : la page charge `data/bilan-massique.json` par
requête réseau.

## Architecture

```
matieres-residuelles-bilan-massique.csv → genTables.py (stdlib) → data/bilan-massique.json → index.html + css/ + js/ (statiques)
```

`data/bilan-massique.json` est le seul fichier régénéré : la page se modifie
sans relancer le script.

| Fichier | Rôle |
|---|---|
| `index.html` | Page (statique) |
| `confidentialite.html` | Politique de confidentialité |
| `genTables.py` | Agrégation (Python, bibliothèque standard seulement) |
| `matieres-residuelles-bilan-massique.csv` | Source (Ville de Montréal) |
| `data/bilan-massique.json` | Généré par `genTables.py` : ne pas modifier à la main |
| `css/style.css` | Mise en page et palette des catégories (`--mat-*`) |
| `css/hybride.css` | Habillage du style D (copié d'artm-data) et blocs communs |
| `js/main.js` | Graphiques Chart.js, filtres, tableaux |
| `js/apropos.js`, `js/titre-barre.js` | Composants communs (bouton « i », titre dans la barre) |
| `img/gabriel-fortin.jpg`, `img/apercu.jpg` | Photo de la barre du haut, aperçu de partage (1200 × 630) |

Style D de [DESIGN-PAGES.md](../DESIGN-PAGES.md) (référence : artm-data).
Mode sombre selon l'appareil ; les graphiques lisent leurs couleurs dans les
variables CSS et se redessinent au changement de thème et à l'impression.
Composants communs : `.communs.json`.

### Catégories et couleurs

Définies une seule fois : clé et libellé dans `MATIERES` (`genTables.py`),
couleur dans `css/style.css` (jetons `--mat-*`).

| Catégorie | Jeton | Couleur |
|---|---|---|
| CRD & encombrants | `--mat-crd` | `#f97316` |
| Recyclables | `--mat-recyclables` | `#3b82f6` |
| Organiques | `--mat-organiques` | `#22c55e` |
| RDD | `--mat-rdd` | `#a855f7` |
| Ordures ménagères | `--mat-ordures` | `#ef4444` |

## Publication

GitHub Pages, branche `main`, domaine dans `CNAME`. Version x.y.z et `?v=`
écrits par le hook de commit (`version.txt`, `.version.json`).

## Confidentialité

Aucun cookie, aucun stockage local.

| Quand | Ce qui est envoyé | À qui |
|---|---|---|
| Chaque visite | Page, site d'origine, appareil, pays | GoatCounter (mesure d'audience anonyme) |
| Chaque visite | Requêtes ordinaires du navigateur | GitHub Pages, jsDelivr (Chart.js), Google Fonts (Inter) |

Détails : [confidentialite.html](confidentialite.html), à mettre à jour (avec
sa date) si un service externe est ajouté.

## Crédits

- [Chart.js](https://www.chartjs.org) 4.4.4 (MIT), chargé depuis jsDelivr
- Police [Inter](https://rsms.me/inter/) (SIL OFL 1.1), depuis Google Fonts
- Données © Ville de Montréal (CC BY 4.0)

## Auteur

Développé par [Gabriel Fortin](https://gabfortin.com), via qui passer pour
toute question.
