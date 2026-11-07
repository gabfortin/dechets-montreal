# Matières résiduelles Montréal — bilan massique

Tableau de bord des tonnes de matières résiduelles **générées** dans chacun des
33 arrondissements et villes liées de l'agglomération de Montréal, de 2012 à
2024, par catégorie. Pour les citoyen·nes, les élu·es et les journalistes qui
veulent comparer les territoires ou suivre l'évolution d'un arrondissement.

**Site en ligne** : [dechets.gabfortin.com](https://dechets.gabfortin.com)

## Contenu

| Section | Ce qu'elle montre |
|---|---|
| En-tête | Chiffres clés du Plateau-Mont-Royal pour la dernière année publiée |
| Catégories affichées | Boutons qui affichent ou masquent une catégorie dans **tous** les graphiques |
| Le Plateau-Mont-Royal | Graphique en vedette (barres empilées par année) |
| Tous les arrondissements et villes liées | Un graphique par territoire, ordre alphabétique |
| Sources et limites | Source, colonne utilisée, correspondance des catégories, limites |

Chaque graphique a sa version en tableau (« Voir les données en tableau »).

## Source des données

[Matières résiduelles — bilan massique](https://donnees.montreal.ca/dataset/matieres-residuelles-bilan-massique),
Ville de Montréal, données ouvertes. Fichier : `matieres-residuelles-bilan-massique.csv`.

Colonnes utilisées : `annee`, `matiere`, `territoire`,
`quantite_generee_donnees_agglo` (quantité générée, en tonnes).

## Mise à jour

Manuelle, quand la Ville publie un nouveau fichier :

```bash
# 1. remplacer matieres-residuelles-bilan-massique.csv par la nouvelle version
python3 genTables.py          # régénère data/bilan-massique.json
python3 -m http.server 8000   # vérifier la page sur http://localhost:8000
```

Le script s'arrête avec une erreur (plutôt que d'afficher un chiffre faux) si une
quantité est illisible, si une nouvelle catégorie apparaît sans être déclarée dans
`MATIERES`, ou si deux variantes d'un même nom de territoire se retrouvent la même
année.

## Mises en garde

- **Quantité générée seulement** : les quantités collectées, taux de récupération et
  données CMM de la source ne sont pas affichés.
- **« NA » dans la source** = aucune valeur : rien dans le graphique, « — » dans le
  tableau. Les RDD ne sont publiés par territoire que de 2012 à 2019 ; plusieurs
  catégories (ordures ménagères, textiles, électroniques…) n'ont aucune quantité
  générée par territoire et n'apparaissent pas. La liste est calculée par le script
  (`meta.sans_donnees`) et affichée dans la page.
- **Territoires agrégés exclus** (`EXCLUDED`) : Agglomération de Montréal, Ville de
  Montréal, Écocentres, Écocentres et collectes itinérantes.
- **Noms harmonisés** (`NAME_MAP`) : la source écrit certains noms de deux façons
  selon l'année (« Rosemont - La Petite-Patrie » / « Rosemont–La Petite-Patrie »).
- **Séparateur de milliers** : en 2024, la source écrit les milliers avec une espace
  insécable (« 15 523 »). Avant novembre 2026, le script ne retirait que les espaces
  ordinaires et ces 84 valeurs étaient affichées à 0 (recyclables, organiques et CRD
  de 2024). Corrigé dans `parse_quantity()`.
- **Échelle propre à chaque graphique** : comparer les tonnes, pas la hauteur des barres.
- Initiative indépendante, ni produite ni approuvée par la Ville de Montréal.

## Architecture

```
matieres-residuelles-bilan-massique.csv   # source (Ville de Montréal)
   → genTables.py                          # agrège (stdlib seulement)
      → data/bilan-massique.json           # seul fichier régénéré
         → index.html + css/ + js/main.js  # statiques, modifiables sans relancer le script
```

```
.
├── index.html               # page (statique)
├── confidentialite.html     # politique de confidentialité
├── css/style.css            # mise en page + palette des catégories (--mat-*)
├── css/hybride.css          # habillage du style D (copié d'artm-data)
├── js/main.js               # graphiques Chart.js 4.4.4, filtres, tableaux
├── data/bilan-massique.json # généré par genTables.py
├── genTables.py
├── img/gabriel-fortin.jpg   # photo de la barre du haut
├── img/apercu.jpg           # aperçu pour les réseaux sociaux (1200 × 630)
└── CNAME                    # dechets.gabfortin.com
```

Style **D, dashboard détaillé (hybride)** de `~/Developer/DESIGN-PAGES.md`
(référence : `artm-data`). Mode sombre automatique ; les graphiques lisent leurs
couleurs dans les variables CSS et se redessinent au changement de thème et à
l'impression. Après une modification de CSS ou de JS, changer le `?v=` dans les deux
pages HTML.

### Catégories et couleurs

Définies une seule fois : clé et libellé dans `MATIERES` (`genTables.py`), couleur
dans `css/style.css` (jetons `--mat-*`).

| Catégorie | Jeton | Couleur |
|---|---|---|
| CRD & encombrants | `--mat-crd` | `#f97316` |
| Recyclables | `--mat-recyclables` | `#3b82f6` |
| Organiques | `--mat-organiques` | `#22c55e` |
| RDD | `--mat-rdd` | `#a855f7` |
| Ordures ménagères | `--mat-ordures` | `#ef4444` |

## Confidentialité

Aucun cookie, aucun stockage local. Mesure d'audience anonyme avec GoatCounter.
Services contactés par le navigateur : GitHub Pages, GoatCounter, jsDelivr
(Chart.js), Google Fonts (Inter). Voir `confidentialite.html`.

## Contact

Gabriel Fortin, via [gabfortin.com](https://gabfortin.com).
