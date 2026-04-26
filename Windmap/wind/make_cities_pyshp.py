import json
import shapefile  # pyshp pour lire le fichier .shp

IN_SHP = "data/raw/ne_places/ne_10m_populated_places.shp"   #fichier source (Natural Earth)
OUT_JSON = "data/cities.json"
N = 2000

def main():
    r = shapefile.Reader(IN_SHP, encoding="utf-8", errors="ignore")

    fields = [f[0] for f in r.fields[1:]]  # skip DeletionFlag
    idx_name = fields.index("NAME") if "NAME" in fields else None
    idx_country = fields.index("ADM0NAME") if "ADM0NAME" in fields else (fields.index("SOV0NAME") if "SOV0NAME" in fields else None)
    idx_pop = fields.index("POP_MAX") if "POP_MAX" in fields else None

    rows = []
    for rec, shp in zip(r.records(), r.shapes()):
        # point lon/lat
        if not shp.points:
            continue
        lon, lat = shp.points[0][0], shp.points[0][1]

        name = rec[idx_name] if idx_name is not None else "Unknown"
        country = rec[idx_country] if idx_country is not None else ""
        pop = rec[idx_pop] if idx_pop is not None else 0

        rows.append((pop, {
            "name": str(name),
            "country": str(country),
            "lat": float(lat),
            "lon": float(lon),
        }))

    # Trier par population décroissante
    rows.sort(key=lambda x: x[0], reverse=True)

    cities = [row[1] for row in rows[:N]]

    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(cities, f, ensure_ascii=False, indent=2)

    print(f"OK: {len(cities)} villes -> {OUT_JSON}")

if __name__ == "__main__":
    main()











