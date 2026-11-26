"""Génère data/bilan-massique.json à partir du CSV de la Ville de Montréal.

La page (index.html + css/ + js/) est statique : elle lit ce fichier JSON.
Relancer ce script seulement quand le CSV change.

    python3 genTables.py

Bibliothèque standard seulement.
"""
import csv
import json
import re
from collections import defaultdict
from datetime import date
from pathlib import Path

CSV_FILE = "matieres-residuelles-bilan-massique.csv"
OUTPUT_FILE = Path("data/bilan-massique.json")
SOURCE_URL = "https://donnees.montreal.ca/dataset/matieres-residuelles-bilan-massique"
# Deux mesures, jamais additionnées entre elles : la page passe de l'une à l'autre.
# Clé → (colonne de la source, libellé, zéros gardés ?). La quantité collectée est
# la seule publiée pour cinq catégories (ordures ménagères et CRD éliminés,
# textiles, électroniques, RDD et PE) ; ses « 0 » sont gardés tels quels.
MESURES = {
    "generee": ("quantite_generee_donnees_agglo", "Quantité générée", False),
    "collectee": ("quantite_collectee_donnees_agglo", "Quantité collectée", True),
}

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

# Catégories cochées au chargement (clés courtes) ; les autres sont décochées
DEFAULT_VISIBLE = {"crd", "recyclables", "organiques", "rdd"}

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
    serait perdue. En 2025, la quantité collectée les écrit avec une virgule
    (« 8,916 ») : une virgule n'est acceptée que dans cette forme (groupes de
    trois chiffres), pour ne jamais prendre une décimale pour des milliers.
    """
    val = (val or "").strip()
    if val in ("", "NA"):
        return None
    for sep in (" ", "\u00a0", "\u202f"):
        val = val.replace(sep, "")
    if "," in val:
        if not re.fullmatch(r"\d{1,3}(,\d{3})+", val):
            raise ValueError(f"Virgule ambiguë dans le CSV (milliers ou décimale ?) : {val!r}")
        val = val.replace(",", "")
    try:
        return float(val)
    except ValueError:
        raise ValueError(f"Quantité illisible dans le CSV : {val!r}")


def load_data(colonne, garder_zero):
    # data[territoire][annee][matiere] = quantité
    data = defaultdict(lambda: defaultdict(lambda: defaultdict(float)))
    seen = defaultdict(int)
    matieres_seen = set()
    matieres_csv = set()      # toutes les catégories présentes, avec ou sans quantité
    annees_seen = set()

    # utf-8-sig : la version de juin 2026 commence par un BOM (sans lui, la colonne « annee » serait mal nommée)
    with open(CSV_FILE, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            territoire = NAME_MAP.get(row["territoire"], row["territoire"])
            if territoire in EXCLUDED:
                continue
            annee, matiere = row["annee"], row["matiere"]
            matieres_csv.add(matiere)
            quantite = parse_quantity(row[colonne])
            if quantite is None or quantite < 0 or (quantite == 0 and not garder_zero):
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

    # CRD & encombrants en premier, puis par volume total décroissant
    matieres = sorted(matieres_seen, key=lambda m: (
        0 if m == CRD_MATIERE else 1,
        -sum(data[t][a].get(m, 0) for t in data for a in data[t]),
    ))
    sans_donnees = sorted(matieres_csv - matieres_seen, key=lambda m: MATIERES[m][1])
    return data, set(data), annees_seen, matieres, sans_donnees


def build_json(mesures, territoires, annees):
    return {
        "meta": {
            "source_url": SOURCE_URL,
            "fichier": CSV_FILE,
            "unite": "tonnes",
            "annees": annees,
            "vedette": FEATURED,
            "exclus": sorted(EXCLUDED),
            "genere_le": date.today().isoformat(),
        },
        "mesures": {
            cle: {
                "colonne": MESURES[cle][0],
                "libelle": MESURES[cle][1],
                # catégories de la source sans aucune valeur de cette mesure par territoire
                "sans_donnees": [{"libelle": MATIERES[m][1], "nom_source": m} for m in sans_donnees],
                "matieres": [
                    {
                        "cle": MATIERES[m][0],
                        "libelle": MATIERES[m][1],
                        "couleur": MATIERES[m][2],
                        "nom_source": m,
                        "visible": MATIERES[m][0] in DEFAULT_VISIBLE,
                    }
                    for m in matieres
                ],
                # null = aucune valeur publiée cette année-là (« NA » dans la source)
                "territoires": [
                    {
                        "nom": t,
                        "valeurs": {
                            MATIERES[m][0]: [data[t][a].get(m) if t in data and m in data[t][a] else None for a in annees]
                            for m in matieres
                            if t in data and any(m in data[t][a] for a in annees)
                        },
                    }
                    for t in territoires
                ],
            }
            for cle, (data, matieres, sans_donnees) in mesures.items()
        },
    }


def main():
    mesures, tous_territoires, toutes_annees = {}, set(), set()
    for cle, (colonne, _, garder_zero) in MESURES.items():
        data, territoires, annees, matieres, sans_donnees = load_data(colonne, garder_zero)
        mesures[cle] = (data, matieres, sans_donnees)
        tous_territoires |= territoires
        toutes_annees |= annees
    territoires = [FEATURED] + sorted(t for t in tous_territoires if t != FEATURED)
    annees = sorted(toutes_annees)
    OUTPUT_FILE.parent.mkdir(exist_ok=True)
    payload = build_json(mesures, territoires, annees)
    OUTPUT_FILE.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    for cle, m in payload["mesures"].items():
        print(f"{m['libelle']} : {len(m['matieres'])} catégories ({', '.join(x['libelle'] for x in m['matieres'])})"
              + (f" ; sans données : {', '.join(x['libelle'] for x in m['sans_donnees'])}" if m["sans_donnees"] else ""))
    print(f"Généré : {OUTPUT_FILE}  ({len(territoires)} territoires, {annees[0]}–{annees[-1]})")


if __name__ == "__main__":
    main()
