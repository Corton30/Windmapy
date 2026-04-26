x"""
app.py — Serveur Flask pour Windmap
Utilise l'API Open-Meteo batch (plusieurs points en 1 requête)
pour éviter le rate limiting.
"""

import threading, time, json, os, math, logging
from datetime import datetime, timezone
import numpy as np
import requests
from flask import Flask, jsonify, send_from_directory

DATA_DIR       = "data/grids"
REFRESH_HOURS  = 1
FORECAST_HOURS = 1
PORT           = 8000

os.makedirs(DATA_DIR, exist_ok=True)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("windmap")

app = Flask(__name__, static_folder=".", static_url_path="")

status = {"last_update": None, "next_update": None, "status": "init", "message": "Démarrage..."}

# Grille de sortie
NLAT     = 91
NLON     = 181
LATS_OUT = np.linspace(90, -90, NLAT)
LONS_OUT = np.linspace(-180, 180, NLON)

# Grille d'échantillonnage 20° (9x19 = 171 points)
STEP     = 20
S_LATS   = np.arange(80, -81, -STEP, dtype=float)
S_LONS   = np.arange(-180, 181, STEP, dtype=float)
NS, NL   = len(S_LATS), len(S_LONS)


def fetch_batch(lats, lons):
    """
    Appelle Open-Meteo avec plusieurs points en UNE SEULE requête.
    Beaucoup plus efficace — évite le rate limiting.
    """
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude":        ",".join(str(round(la, 1)) for la in lats),
        "longitude":       ",".join(str(round(lo, 1)) for lo in lons),
        "hourly":          "temperature_2m,surface_pressure,wind_speed_10m,wind_direction_10m",
        "forecast_days":   1,
        "timezone":        "UTC",
        "timeformat":      "iso8601",
        "wind_speed_unit": "ms"
    }
    r = requests.get(url, params=params, timeout=60)
    r.raise_for_status()
    return r.json()


def wind_uv(speed, direction):
    rad = math.radians(direction)
    return -speed * math.sin(rad), -speed * math.cos(rad)


def build_grids():
    """Construit les grilles en faisant des appels batch (max 50 points par requête)."""
    all_lats = [la for la in S_LATS for _ in S_LONS]
    all_lons = [lo for _ in S_LATS for lo in S_LONS]
    total = len(all_lats)

    temp_flat = np.full((FORECAST_HOURS, total), np.nan)
    pres_flat = np.full((FORECAST_HOURS, total), np.nan)
    u10_flat  = np.full((FORECAST_HOURS, total), np.nan)
    v10_flat  = np.full((FORECAST_HOURS, total), np.nan)
    times_list = None

    BATCH = 50  # max 50 points par requête
    for start in range(0, total, BATCH):
        end = min(start + BATCH, total)
        batch_lats = all_lats[start:end]
        batch_lons = all_lons[start:end]
        log.info(f"  Batch {start//BATCH + 1}/{math.ceil(total/BATCH)} ({end}/{total} points)...")

        try:
            data = fetch_batch(batch_lats, batch_lons)
            # Si un seul point → envelopper dans une liste
            if isinstance(data, dict):
                data = [data]

            for k, item in enumerate(data):
                h = item.get("hourly", {})
                if times_list is None:
                    times_list = h.get("time", [])[:FORECAST_HOURS]
                idx = start + k
                for ti in range(FORECAST_HOURS):
                    temp_flat[ti, idx] = h.get("temperature_2m", [np.nan]*24)[ti]
                    pres_flat[ti, idx] = h.get("surface_pressure", [np.nan]*24)[ti]
                    spd = h.get("wind_speed_10m", [0]*24)[ti]
                    direc = h.get("wind_direction_10m", [0]*24)[ti]
                    u, v = wind_uv(spd, direc)
                    u10_flat[ti, idx] = u
                    v10_flat[ti, idx] = v

            time.sleep(1.0)  # pause entre les batches

        except Exception as e:
            log.warning(f"Erreur batch {start}-{end}: {e}")
            time.sleep(5.0)

    # Reshape en grilles 2D
    def reshape(flat):
        return flat.reshape(FORECAST_HOURS, NS, NL)

    return reshape(temp_flat), reshape(pres_flat), reshape(u10_flat), reshape(v10_flat), times_list


def bilinear_interp(sample, s_lats, s_lons, out_lats, out_lons):
    T = sample.shape[0]
    result = np.zeros((T, len(out_lats), len(out_lons)), dtype=np.float32)
    for io, olat in enumerate(out_lats):
        fi = np.searchsorted(-s_lats, -olat)
        i0 = max(0, min(len(s_lats)-2, fi-1)); i1 = i0+1
        denom = s_lats[i0]-s_lats[i1]
        ty = (s_lats[i0]-olat)/denom if denom else 0
        for jo, olon in enumerate(out_lons):
            fj = np.searchsorted(s_lons, olon)
            j0 = max(0, min(len(s_lons)-2, fj-1)); j1 = j0+1
            denom2 = s_lons[j1]-s_lons[j0]
            tx = (olon-s_lons[j0])/denom2 if denom2 else 0
            for ti in range(T):
                v00=sample[ti,i0,j0]; v10=sample[ti,i0,j1]
                v01=sample[ti,i1,j0]; v11=sample[ti,i1,j1]
                result[ti,io,jo]=(v00*(1-tx)+v10*tx)*(1-ty)+(v01*(1-tx)+v11*tx)*ty
    return result


def write_bins(name, grids):
    vmin, vmax = float("inf"), float("-inf")
    for ti, grid in enumerate(grids):
        grid.astype(np.float32).tofile(os.path.join(DATA_DIR, f"{name}_{ti}.bin"))
        f = grid[np.isfinite(grid)]
        if f.size:
            vmin = min(vmin, float(np.min(f)))
            vmax = max(vmax, float(np.max(f)))
    return vmin, vmax


def refresh_data():
    global status
    status["status"] = "updating"
    status["message"] = "Récupération des données..."
    log.info("=== Mise à jour des données ===")

    try:
        temp_s, pres_s, u10_s, v10_s, times_list = build_grids()
        if times_list is None:
            raise Exception("Aucune donnée récupérée")

        log.info("Interpolation...")
        temp_f = bilinear_interp(temp_s, S_LATS, S_LONS, LATS_OUT, LONS_OUT)
        pres_f = bilinear_interp(pres_s, S_LATS, S_LONS, LATS_OUT, LONS_OUT)
        u10_f  = bilinear_interp(u10_s,  S_LATS, S_LONS, LATS_OUT, LONS_OUT)
        v10_f  = bilinear_interp(v10_s,  S_LATS, S_LONS, LATS_OUT, LONS_OUT)

        log.info("Écriture des .bin...")
        t_min, t_max = write_bins("temp",     [temp_f[ti] for ti in range(FORECAST_HOURS)])
        p_min, p_max = write_bins("pressure", [pres_f[ti] for ti in range(FORECAST_HOURS)])
        u_min, u_max = write_bins("u10",      [u10_f[ti]  for ti in range(FORECAST_HOURS)])
        v_min, v_max = write_bins("v10",      [v10_f[ti]  for ti in range(FORECAST_HOURS)])

        wind_max = max(abs(u_min), abs(u_max), abs(v_min), abs(v_max))
        meta = {
            "shape": [NLAT, NLON],
            "lat":   {"min": float(LATS_OUT.min()), "max": float(LATS_OUT.max())},
            "lon":   {"min": float(LONS_OUT.min()), "max": float(LONS_OUT.max())},
            "times": times_list,
            "source": "Open-Meteo API",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "vars": {
                "temp":     {"unit": "°C",  "vmin": -50.0,   "vmax": 45.0},
                "pressure": {"unit": "hPa", "vmin": 970.0,   "vmax": 1040.0},
                "u10":      {"unit": "m/s", "vmin": u_min,   "vmax": u_max},
                "v10":      {"unit": "m/s", "vmin": v_min,   "vmax": v_max},
                "wind":     {"unit": "m/s", "vmin": 0.0,     "vmax": wind_max}
            }
        }
        with open(os.path.join(DATA_DIR, "meta.json"), "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2)

        now = datetime.now(timezone.utc)
        status["last_update"] = now.isoformat()
        status["status"]      = "ok"
        status["message"]     = f"Données mises à jour à {now.strftime('%H:%M UTC')}"
        log.info("=== Mise à jour terminée ===")

    except Exception as e:
        status["status"]  = "error"
        status["message"] = str(e)
        log.error(f"Erreur: {e}")


def background_loop():
    refresh_data()
    while True:
        time.sleep(REFRESH_HOURS * 3600)
        refresh_data()


@app.route("/")
def index():
    return send_from_directory(".", "windmap.html")

@app.route("/api/status")
def api_status():
    return jsonify(status)

@app.route("/api/refresh", methods=["POST"])
def api_refresh():
    if status["status"] == "updating":
        return jsonify({"error": "Déjà en cours"}), 409
    threading.Thread(target=refresh_data, daemon=True).start()
    return jsonify({"message": "Lancé"})

@app.route("/data/<path:filename>")
def serve_data(filename):
    return send_from_directory("data", filename)

@app.route("/<path:filename>")
def serve_static(filename):
    return send_from_directory(".", filename)


if __name__ == "__main__":
    log.info("=" * 50)
    log.info("Windmap — Serveur Flask")
    log.info(f"Mise à jour automatique toutes les {REFRESH_HOURS}h")
    log.info(f"Ouvre: http://localhost:{PORT}")
    log.info("=" * 50)
    threading.Thread(target=background_loop, daemon=True).start()
    app.run(host="0.0.0.0", port=PORT, debug=False)