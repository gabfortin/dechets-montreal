import csv
import json
from collections import defaultdict

CSV_FILE = "matieres-residuelles-bilan-massique.csv"
OUTPUT_FILE = "index.html"

# Territories to exclude (aggregates, not arrondissements)
EXCLUDED = {
    "Agglomération de Montréal",
    "Ville de Montréal",
    "Écocentres",
    "Écocentres et collectes itinérantes",
}

# Matières to exclude from charts
EXCLUDED_MATIERES = {
    "Résidus de construction, rénovation, démolition et encombrants",
    "Résidus de construction, rénovation, démolition et encombrants éliminés",
    "Résidus domestiques dangereux",
    "Résidus domestiques dangereux et PE",
}

# Normalize territory names (different dash/space variants across years)
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

MATIERE_COLORS = {
    "Ordures ménagères éliminées": "#ef4444",
    "Matières recyclables": "#3b82f6",
    "Matières organiques": "#22c55e",
    "Résidus de construction, rénovation, démolition et encombrants": "#f97316",
    "Résidus de construction, rénovation, démolition et encombrants éliminés": "#fb923c",
    "Résidus domestiques dangereux": "#a855f7",
    "Résidus domestiques dangereux et PE": "#c084fc",
    "Textiles": "#ec4899",
    "Autres (produits électroniques)": "#14b8a6",
}

MATIERE_LABELS = {
    "Ordures ménagères éliminées": "Ordures ménagères",
    "Matières recyclables": "Recyclables",
    "Matières organiques": "Organiques",
    "Résidus de construction, rénovation, démolition et encombrants": "CRD & encombrants",
    "Résidus de construction, rénovation, démolition et encombrants éliminés": "CRD éliminés",
    "Résidus domestiques dangereux": "RDD",
    "Résidus domestiques dangereux et PE": "RDD et PE",
    "Textiles": "Textiles",
    "Autres (produits électroniques)": "Électroniques",
}


def parse_quantity(val):
    if not val or val.strip() in ("NA", ""):
        return 0
    try:
        return float(val.replace(",", "").replace(" ", ""))
    except ValueError:
        return 0


def load_data():
    # data[territoire][annee][matiere] = quantite
    data = defaultdict(lambda: defaultdict(lambda: defaultdict(float)))
    matieres_seen = set()
    annees_seen = set()

    with open(CSV_FILE, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            territoire = NAME_MAP.get(row["territoire"], row["territoire"])
            if territoire in EXCLUDED:
                continue
            annee = row["annee"]
            matiere = row["matiere"]
            if matiere in EXCLUDED_MATIERES:
                continue
            quantite = parse_quantity(row["quantite_generee_donnees_agglo"])
            if quantite > 0:
                data[territoire][annee][matiere] += quantite
                matieres_seen.add(matiere)
                annees_seen.add(annee)

    annees = sorted(annees_seen)
    matieres = sorted(matieres_seen, key=lambda m: -sum(
        data[t][a].get(m, 0) for t in data for a in data[t]
    ))
    territoires = sorted(data.keys())
    return data, territoires, annees, matieres


def build_chart_config(territoire, data, annees, matieres):
    datasets = []
    for matiere in matieres:
        values = [data[territoire][a].get(matiere, 0) for a in annees]
        if any(v > 0 for v in values):
            datasets.append({
                "label": MATIERE_LABELS.get(matiere, matiere),
                "data": values,
                "backgroundColor": MATIERE_COLORS.get(matiere, "#94a3b8"),
                "borderColor": MATIERE_COLORS.get(matiere, "#94a3b8"),
                "borderWidth": 0,
                "borderRadius": 3,
            })
    return {
        "type": "bar",
        "data": {"labels": annees, "datasets": datasets},
        "options": {
            "responsive": True,
            "maintainAspectRatio": False,
            "plugins": {
                "legend": {"display": False},
                "tooltip": {
                    "mode": "index",
                    "intersect": False,
                    "callbacks": {},
                },
            },
            "scales": {
                "x": {
                    "stacked": True,
                    "grid": {"display": False},
                    "ticks": {"color": "#94a3b8", "font": {"size": 11}},
                },
                "y": {
                    "stacked": True,
                    "grid": {"color": "rgba(148,163,184,0.1)"},
                    "ticks": {"color": "#94a3b8", "font": {"size": 11}},
                    "title": {"display": True, "text": "Tonnes", "color": "#94a3b8", "font": {"size": 11}},
                },
            },
        },
    }


def build_html(data, territoires, annees, matieres):
    charts_js = []
    cards_html = []

    for i, territoire in enumerate(territoires):
        config = build_chart_config(territoire, data, annees, matieres)
        config_json = json.dumps(config, ensure_ascii=False)
        chart_id = f"chart_{i}"

        # Compute total for the latest available year
        latest = max((a for a in annees if any(
            data[territoire][a].get(m, 0) for m in matieres
        )), default=annees[-1])
        total_latest = sum(data[territoire][latest].get(m, 0) for m in matieres)
        total_all = sum(
            data[territoire][a].get(m, 0)
            for a in annees for m in matieres
        )

        cards_html.append(f"""
        <div class="card">
          <div class="card-header">
            <div>
              <h2 class="card-title">{territoire}</h2>
              <p class="card-sub">{total_latest:,.0f} t en {latest}</p>
            </div>
            <div class="card-badge">{total_all / 1000:,.0f} kt total</div>
          </div>
          <div class="chart-wrap">
            <canvas id="{chart_id}"></canvas>
          </div>
        </div>""")

        charts_js.append(f"""
    new Chart(document.getElementById('{chart_id}'), {config_json});""")

    legend_items = "".join(
        f'<span class="legend-item"><span class="legend-dot" style="background:{MATIERE_COLORS.get(m, "#94a3b8")}"></span>{MATIERE_LABELS.get(m, m)}</span>'
        for m in matieres
    )

    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bilan massique — Matières résiduelles · Montréal</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"></script>
  <style>
    *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}

    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      min-height: 100vh;
    }}

    header {{
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      border-bottom: 1px solid #1e293b;
      padding: 2.5rem 2rem 2rem;
      text-align: center;
    }}

    header h1 {{
      font-size: clamp(1.5rem, 4vw, 2.25rem);
      font-weight: 700;
      letter-spacing: -0.02em;
      background: linear-gradient(90deg, #60a5fa, #34d399);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }}

    header p {{
      margin-top: 0.5rem;
      color: #64748b;
      font-size: 0.9rem;
    }}

    header .source {{
      margin-top: 0.75rem;
      font-size: 0.78rem;
      color: #475569;
    }}

    header .source a {{
      color: #60a5fa;
      text-decoration: none;
    }}

    header .source a:hover {{
      text-decoration: underline;
    }}

    .legend {{
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 0.5rem 1.25rem;
      padding: 1.25rem 2rem;
      border-bottom: 1px solid #1e293b;
      background: #0f172a;
    }}

    .legend-item {{
      display: flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.78rem;
      color: #94a3b8;
    }}

    .legend-dot {{
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }}

    .grid {{
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(440px, 1fr));
      gap: 1.25rem;
      padding: 1.5rem;
      max-width: 1600px;
      margin: 0 auto;
    }}

    .card {{
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 14px;
      padding: 1.25rem 1.25rem 1rem;
      transition: border-color 0.2s, box-shadow 0.2s;
    }}

    .card:hover {{
      border-color: #475569;
      box-shadow: 0 4px 24px rgba(0,0,0,0.4);
    }}

    .card-header {{
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1rem;
    }}

    .card-title {{
      font-size: 0.95rem;
      font-weight: 600;
      color: #f1f5f9;
      line-height: 1.3;
    }}

    .card-sub {{
      font-size: 0.75rem;
      color: #64748b;
      margin-top: 0.2rem;
    }}

    .card-badge {{
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 99px;
      padding: 0.2rem 0.65rem;
      font-size: 0.72rem;
      color: #64748b;
      white-space: nowrap;
      flex-shrink: 0;
      margin-left: 0.75rem;
    }}

    .chart-wrap {{
      position: relative;
      height: 200px;
    }}

    footer {{
      text-align: center;
      padding: 2rem;
      color: #475569;
      font-size: 0.78rem;
      border-top: 1px solid #1e293b;
      margin-top: 1rem;
    }}

    footer a {{ color: #60a5fa; text-decoration: none; }}
  </style>
</head>
<body>
  <header>
    <h1>Matières résiduelles — Bilan massique</h1>
    <p>Quantités générées par arrondissement · Agglomération de Montréal · {annees[0]}–{annees[-1]}</p>
    <p class="source">Source : <a href="https://donnees.montreal.ca/dataset/matieres-residuelles-bilan-massique" target="_blank">Données ouvertes — Ville de Montréal</a></p>
  </header>

  <div class="legend">
    {legend_items}
  </div>

  <div class="grid">
    {"".join(cards_html)}
  </div>

  <footer>
    Source : <a href="https://donnees.montreal.ca" target="_blank">Données ouvertes Montréal</a> · Ville de Montréal
  </footer>

  <script>
  Chart.defaults.color = "#94a3b8";
  (function() {{
    {"".join(charts_js)}
  }})();
  </script>
</body>
</html>"""


def main():
    data, territoires, annees, matieres = load_data()
    html = build_html(data, territoires, annees, matieres)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"Généré : {OUTPUT_FILE}  ({len(territoires)} arrondissements, {annees[0]}–{annees[-1]})")


if __name__ == "__main__":
    main()
