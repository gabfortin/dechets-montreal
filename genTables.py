"""Génère data/bilan-massique.json à partir du CSV de la Ville de Montréal.

La page (index.html + css/ + js/) est statique : elle lit ce fichier JSON.
Relancer ce script seulement quand le CSV change.

    python3 genTables.py

Bibliothèque standard seulement.
"""
import csv
import json
from collections import defaultdict
from datetime import date
from pathlib import Path

CSV_FILE = "matieres-residuelles-bilan-massique.csv"
OUTPUT_FILE = Path("data/bilan-massique.json")
SOURCE_URL = "https://donnees.montreal.ca/dataset/matieres-residuelles-bilan-massique"
COLONNE = "quantite_generee_donnees_agglo"

# Territoires agrégés (pas des arrondissements ni des villes liées) : exclus
EXCLUDED = {
    "Agglomération de Montréal",
    "Ville de Montréal",
    "Écocentres",
    "Écocentres et collectes itinérantes",
}

# Le CSV écrit certains noms de deux façons selon l'année (trait d'union
# entouré d'espaces ou tiret demi-cadratin, « (Le) » à la fin) : on harmonise.
NAME_MAP = {
    "Côte-des-Neiges - Notre-Dame-de-Grâce": "Côte-des-Neiges–Notre-Dame-de-Grâce",
    "Dollard-Des Ormeaux": "Dollard-des Ormeaux",
    "L'Île-Bizard - Sainte-Geneviève": "L'Île-Bizard–Sainte-Geneviève",
    "Mercier - Hochelaga-Maisonneuve": "Mercier–Hochelaga-Maisonneuve",
    "Plateau-Mont-Royal (Le)": "Le Plateau-Mont-Royal",
    "Rivière-des-Prairies - Pointe-aux-Trembles": "Rivière-des-Prairies–Pointe-aux-Trembles",
    "Rosemont - La Petite-Patrie": "Rosemont–La Petite-Patrie",
    "Sud-Ouest (Le)": "Le Sud-Ouest",
    "Villeray - Saint-Michel - Parc-Extension": "Villeray–Saint-Michel–Parc-Extension",
}

CRD_MATIERE = "Résidus de construction, rénovation, démolition et encombrants"

# Catégories affichées au chargement (les autres sont masquées)
DEFAULT_VISIBLE = {CRD_MATIERE}

FEATURED = "Le Plateau-Mont-Royal"

# Nom dans la source → clé courte, libellé affiché et jeton de couleur CSS
# (couleurs définies dans css/style.css, section « Catégories »).
MATIERES = {
    CRD_MATIERE: ("crd", "CRD & encombrants", "--mat-crd"),
    "Résidus de construction, rénovation, démolition et encombrants éliminés": ("crd-elimines", "CRD éliminés", "--mat-crd-elimines"),
    "Matières recyclables": ("recyclables", "Recyclables", "--mat-recyclables"),
    "Matières organiques": ("organiques", "Organiques", "--mat-organiques"),
    "Ordures ménagères éliminées": ("ordures", "Ordures ménagères", "--mat-ordures"),
    "Résidus domestiques dangereux": ("rdd", "RDD", "--mat-rdd"),
    "Résidus domestiques dangereux et PE": ("rdd-pe", "RDD et PE", "--mat-rdd-pe"),
    "Textiles": ("textiles", "Textiles", "--mat-textiles"),
    "Autres (produits électroniques)": ("electroniques", "Électroniques", "--mat-electroniques"),
}


def parse_quantity(val):
    """Retourne la quantité en tonnes, ou None si la source n'en publie pas (« NA »).

    En 2024, la source écrit les milliers avec une espace insécable
    (« 15 523 ») : on retire tous les types d'espaces, sinon la valeur
    serait perdue.
    """
    val = (val or "").strip()
    if val in ("", "NA"):
        return None
    for sep in (",", " ", " ", " "):
        val = val.replace(sep, "")
    try:
        return float(val)
    except ValueError:
        raise ValueError(f"Quantité illisible dans le CSV : {val!r}")


def load_data():
    # data[territoire][annee][matiere] = quantité
    data = defaultdict(lambda: defaultdict(lambda: defaultdict(float)))
    seen = defaultdict(int)
    matieres_seen = set()
    matieres_csv = set()      # toutes les catégories présentes, avec ou sans quantité
    annees_seen = set()

    with open(CSV_FILE, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            territoire = NAME_MAP.get(row["territoire"], row["territoire"])
            if territoire in EXCLUDED:
                continue
            annee, matiere = row["annee"], row["matiere"]
            matieres_csv.add(matiere)
            quantite = parse_quantity(row[COLONNE])
            if quantite is None or quantite <= 0:
                continue
            seen[(territoire, annee, matiere)] += 1
            data[territoire][annee][matiere] += quantite
            matieres_seen.add(matiere)
            annees_seen.add(annee)

    # Garde-fou : deux variantes d'un même nom la même année seraient additionnées
    doublons = [k for k, n in seen.items() if n > 1]
    if doublons:
        raise ValueError(f"Valeurs en double après harmonisation des noms : {doublons[:5]}")

    inconnues = matieres_csv - MATIERES.keys()
    if inconnues:
        raise ValueError(f"Catégories absentes de MATIERES : {sorted(inconnues)}")

    annees = sorted(annees_seen)
    # CRD & encombrants en premier, puis par volume total décroissant
    matieres = sorted(matieres_seen, key=lambda m: (
        0 if m == CRD_MATIERE else 1,
        -sum(data[t][a].get(m, 0) for t in data for a in data[t]),
    ))
    territoires = [FEATURED] + sorted(t for t in data if t != FEATURED)
    sans_donnees = sorted(matieres_csv - matieres_seen, key=lambda m: MATIERES[m][1])
    return data, territoires, annees, matieres, sans_donnees


def build_json(data, territoires, annees, matieres, sans_donnees):
    return {
        "meta": {
            "source_url": SOURCE_URL,
            "fichier": CSV_FILE,
            "colonne": COLONNE,
            "unite": "tonnes",
            "annees": annees,
            "vedette": FEATURED,
            "exclus": sorted(EXCLUDED),
            # catégories de la source sans aucune quantité générée par territoire
            "sans_donnees": [{"libelle": MATIERES[m][1], "nom_source": m} for m in sans_donnees],
            "genere_le": date.today().isoformat(),
        },
        "matieres": [
            {
                "cle": MATIERES[m][0],
                "libelle": MATIERES[m][1],
                "couleur": MATIERES[m][2],
                "nom_source": m,
                "visible": m in DEFAULT_VISIBLE,
            }
            for m in matieres
        ],
        # null = aucune quantité publiée cette année-là (« NA » dans la source)
        "territoires": [
            {
                "nom": t,
                "valeurs": {
                    MATIERES[m][0]: [data[t][a].get(m) for a in annees]
                    for m in matieres
                    if any(data[t][a].get(m) for a in annees)
                },
            }
            for t in territoires
        ],
    }


def main():
    data, territoires, annees, matieres, sans_donnees = load_data()
    OUTPUT_FILE.parent.mkdir(exist_ok=True)
    payload = build_json(data, territoires, annees, matieres, sans_donnees)
    OUTPUT_FILE.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Généré : {OUTPUT_FILE}  ({len(territoires)} territoires, {annees[0]}–{annees[-1]})")


if __name__ == "__main__":
    main()
