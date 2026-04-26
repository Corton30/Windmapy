"""
fetch_openmeteo.py
==================
Récupère les données météo mondiales depuis l'API Open-Meteo (gratuite, sans clé)
et génère les mêmes fichiers .bin + meta.json que preprocess_grib_all.py.

Utilisation:
    python fetch_openmeteo.py

Dépendances:
    pip install requests numpy
"""

import json, os, math, time
import numpy as np
import requests
from datetime import datetime, timezone

# ===== CONFIGURATION =====
OUT_DIR        = "data/grids"
FORECAST_HOURS = 6      # nombre de pas de temps
STEP_DEG       = 5      # résolution de la grille d'échantillonnage en degrés (5° = bon compromis)

os.makedirs(OUT_DIR, exist_ok=True)

# Grille de sortie finale (2° de résolution)
NLAT = 91
NLON = 181
LATS_OUT = np.linspace(90, -90, NLAT)
LONS_OUT = np.linspace(-180, 180, NLON)

# Grille d'échantillonnage Open-Meteo
SAMPLE_LATS = np.arange(90,  -91, -STEP_DEG, dtype=float)
SAMPLE_LONS = np.arange(-180, 181,  STEP_DEG, dtype=float)
NS = len(SAMPLE_LATS)
NL = len(SAMPLE_LONS)


def fetch_point(lat, lon, retries=3):
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude":  round(lat, 2),
        "longitude": round(lon, 2),
        "hourly": "temperature_2m,surface_pressure,wind_speed_10m,wind_direction_10m",
        "forecast_days": 1,
        "timezone": "UTC",
        "timeformat": "iso8601",
        "wind_speed_unit": "ms"   # directement en m/s
    }
    for attempt in range(retries):
        try:
            r = requests.get(url, params=params, timeout=15)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(1)
            else:
                raise e


def wind_components(speed_ms, direction_deg):
    rad = math.radians(direction_deg)
    u = -speed_ms * math.sin(rad)
    v = -speed_ms * math.cos(rad)
    return u, v


def build_sample_grids():
    """Interroge Open-Meteo sur la grille d'échantillonnage."""
    temp_s = np.full((FORECAST_HOURS, NS, NL), np.nan, dtype=np.float64)
    pres_s = np.full((FORECAST_HOURS, NS, NL), np.nan, dtype=np.float64)
    u10_s  = np.full((FORECAST_HOURS, NS, NL), np.nan, dtype=np.float64)
    v10_s  = np.full((FORECAST_HOURS, NS, NL), np.nan, dtype=np.float64)
    times_list = None
    total = NS * NL
    done  = 0

    for i, lat in enumerate(SAMPLE_LATS):
        for j, lon in enumerate(SAMPLE_LONS):
            done += 1
            print(f"  [{done}/{total}] lat={lat:+.0f} lon={lon:+.0f}   ", end="\r")
            try:
                data = fetch_point(lat, lon)
                h = data["hourly"]
                if times_list is None:
                    times_list = h["time"][:FORECAST_HOURS]
                for ti in range(FORECAST_HOURS):
                    temp_s[ti, i, j] = h["temperature_2m"][ti]
                    pres_s[ti, i, j] = h["surface_pressure"][ti]
                    spd = h["wind_speed_10m"][ti]
                    direc = h["wind_direction_10m"][ti]
                    u, v = wind_components(spd, direc)
                    u10_s[ti, i, j] = u
                    v10_s[ti, i, j] = v
            except Exception as e:
                print(f"\n  Erreur ({lat},{lon}): {e}")

    print(f"\n{done} points récupérés.")
    return temp_s, pres_s, u10_s, v10_s, times_list


def bilinear_interp_grid(sample, s_lats, s_lons, out_lats, out_lons):
    """
    Interpolation bilinéaire propre d'une grille (NS x NL) vers (NLAT x NLON).
    s_lats va de 90 → -90 (décroissant).
    s_lons va de -180 → 180 (croissant).
    """
    T, NS, NL = sample.shape
    NO_LAT = len(out_lats)
    NO_LON = len(out_lons)
    result = np.zeros((T, NO_LAT, NO_LON), dtype=np.float32)

    # Pré-calculer indices pour lat et lon
    for io, olat in enumerate(out_lats):
        # s_lats est décroissant → interpoler correctement
        # Trouver i0 tel que s_lats[i0] >= olat > s_lats[i0+1]
        fi = np.searchsorted(-s_lats, -olat)  # index dans tableau décroissant
        i0 = max(0, min(NS-2, fi-1))
        i1 = i0 + 1
        # fraction entre i0 et i1
        denom_lat = s_lats[i0] - s_lats[i1]
        ty = (s_lats[i0] - olat) / denom_lat if denom_lat != 0 else 0

        for jo, olon in enumerate(out_lons):
            fj = np.searchsorted(s_lons, olon)
            j0 = max(0, min(NL-2, fj-1))
            j1 = j0 + 1
            denom_lon = s_lons[j1] - s_lons[j0]
            tx = (olon - s_lons[j0]) / denom_lon if denom_lon != 0 else 0

            for ti in range(T):
                v00 = sample[ti, i0, j0]
                v10 = sample[ti, i0, j1]
                v01 = sample[ti, i1, j0]
                v11 = sample[ti, i1, j1]
                val = (v00*(1-tx) + v10*tx)*(1-ty) + (v01*(1-tx) + v11*tx)*ty
                result[ti, io, jo] = val

    return result


def write_bins(name, grids):
    vmin, vmax = float("inf"), float("-inf")
    for ti, grid in enumerate(grids):
        path = os.path.join(OUT_DIR, f"{name}_{ti}.bin")
        grid.astype(np.float32).tofile(path)
        finite = grid[np.isfinite(grid)]
        if finite.size:
            vmin = min(vmin, float(np.min(finite)))
            vmax = max(vmax, float(np.max(finite)))
    return vmin, vmax


def main():
    print("=" * 55)
    print("fetch_openmeteo.py — Données météo Open-Meteo")
    print(f"Grille échantillon : {NS}×{NL} points ({STEP_DEG}° résolution)")
    print(f"Grille sortie      : {NLAT}×{NLON} (2° résolution)")
    print(f"Pas de temps       : {FORECAST_HOURS}")
    print("=" * 55)

    # 1. Récupérer depuis Open-Meteo
    temp_s, pres_s, u10_s, v10_s, times_list = build_sample_grids()

    if times_list is None:
        raise SystemExit("Aucune donnée récupérée. Vérifie ta connexion internet.")

    # 2. Interpoler sur grille de sortie
    print("Interpolation bilinéaire sur la grille de sortie...")
    temp_full = bilinear_interp_grid(temp_s, SAMPLE_LATS, SAMPLE_LONS, LATS_OUT, LONS_OUT)
    pres_full = bilinear_interp_grid(pres_s, SAMPLE_LATS, SAMPLE_LONS, LATS_OUT, LONS_OUT)
    u10_full  = bilinear_interp_grid(u10_s,  SAMPLE_LATS, SAMPLE_LONS, LATS_OUT, LONS_OUT)
    v10_full  = bilinear_interp_grid(v10_s,  SAMPLE_LATS, SAMPLE_LONS, LATS_OUT, LONS_OUT)
    print("Interpolation terminée.")

    # 3. Écrire les .bin
    print("Écriture des fichiers .bin...")
    t_min, t_max = write_bins("temp",     [temp_full[ti] for ti in range(FORECAST_HOURS)])
    p_min, p_max = write_bins("pressure", [pres_full[ti] for ti in range(FORECAST_HOURS)])
    u_min, u_max = write_bins("u10",      [u10_full[ti]  for ti in range(FORECAST_HOURS)])
    v_min, v_max = write_bins("v10",      [v10_full[ti]  for ti in range(FORECAST_HOURS)])

    # 4. meta.json
    wind_max = max(abs(u_min), abs(u_max), abs(v_min), abs(v_max))
    meta = {
        "shape": [NLAT, NLON],
        "lat":   {"min": float(LATS_OUT.min()), "max": float(LATS_OUT.max())},
        "lon":   {"min": float(LONS_OUT.min()), "max": float(LONS_OUT.max())},
        "times": times_list,
        "source": "Open-Meteo API (open-meteo.com)",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "vars": {
            "temp":     {"unit": "°C",  "vmin": t_min, "vmax": t_max},
            "pressure": {"unit": "hPa", "vmin": 950.0, "vmax": 1050.0},
            "u10":      {"unit": "m/s", "vmin": u_min, "vmax": u_max},
            "v10":      {"unit": "m/s", "vmin": v_min, "vmax": v_max},
            "wind":     {"unit": "m/s", "vmin": 0.0,   "vmax": wind_max}
        }
    }

    with open(os.path.join(OUT_DIR, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    print("\n===== TERMINÉ =====")
    print(f"Fichiers dans {OUT_DIR}/")
    print(f"  {FORECAST_HOURS} pas de temps : {', '.join(times_list)}")
    print(f"  temp     : {t_min:.1f} → {t_max:.1f} °C")
    print(f"  pressure : {p_min:.1f} → {p_max:.1f} hPa")
    print(f"  u10/v10  : ±{wind_max:.1f} m/s")
    print("\nRelance python3 -m http.server et recharge le globe !")


if __name__ == "__main__":
    main()