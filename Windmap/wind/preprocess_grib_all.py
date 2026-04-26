import json
import os
import numpy as np
import xarray as xr

INPUT_GRIB = "data/input.grib2"
OUT_DIR = "data/grids"
os.makedirs(OUT_DIR, exist_ok=True)

# On va sortir: temp, pression, pluie, u10, v10
# Selon les GRIB, les noms peuvent varier: msl vs prmsl, tp vs apcp
CANDIDATES = {
    "temp": ["t2m"],
    "pressure": ["msl", "prmsl"],
    "precip": ["tp", "apcp"],
    "u10": ["u10"],
    "v10": ["v10"],
}

# filtres cfgrib: on sépare les familles de niveaux
FILTERS = {
    # temp 2m + vent 10m
    "heightAboveGround_2": {"typeOfLevel": "heightAboveGround", "level": 2},
    "heightAboveGround_10": {"typeOfLevel": "heightAboveGround", "level": 10},
    # pression niveau mer
    "meanSea": {"typeOfLevel": "meanSea"},
    # précip surface (souvent stepType=accum)
    "surface": {"typeOfLevel": "surface"},
}

def try_open(filter_keys):
    return xr.open_dataset(
        INPUT_GRIB,
        engine="cfgrib",
        backend_kwargs={"filter_by_keys": filter_keys, "indexpath": ""}  # pas de .idx
    )

def pick_var(ds, wanted_names):
    for n in wanted_names:
        if n in ds.data_vars:
            return n
    return None

def norm_lon_lat(da):
    da = da.transpose("latitude", "longitude")
    lat = da.latitude.values
    lon = da.longitude.values
    grid = da.values.astype(np.float32)

    # lon 0..360 -> -180..180
    if lon.min() >= 0 and lon.max() > 180:
        lon2 = ((lon + 180) % 360) - 180
        order = np.argsort(lon2)
        lon = lon2[order]
        grid = grid[:, order]

    # lat nord->sud
    if lat[0] < lat[-1]:
        lat = lat[::-1]
        grid = grid[::-1, :]

    return lat, lon, grid

def convert_units(kind, grid):
    # heuristiques: GFS est souvent en Kelvin / Pa / m
    if kind == "temp":
        if np.nanmean(grid) > 100:
            return grid - 273.15, "°C"
        return grid, "°C"
    if kind == "pressure":
        if np.nanmean(grid) > 2000:
            return grid / 100.0, "hPa"
        return grid, "hPa"
    if kind == "precip":
        # tp/apcp souvent en m d'eau => mm
        if np.nanmean(grid) < 10:
            return grid * 1000.0, "mm"
        return grid, "mm"
    if kind in ("u10", "v10"):
        return grid, "m/s"
    return grid, ""

def main():
    print("=== preprocess_grib_all.py ===")
    print("GRIB:", INPUT_GRIB)

    # Ouvrir les datasets par filtres
    ds_2m = try_open(FILTERS["heightAboveGround_2"])
    ds_10m = try_open(FILTERS["heightAboveGround_10"])
    ds_msl = try_open(FILTERS["meanSea"])
    ds_sfc = try_open(FILTERS["surface"])

    # Trouver les noms réels
    var_temp = pick_var(ds_2m, CANDIDATES["temp"])
    var_u10 = pick_var(ds_10m, CANDIDATES["u10"])
    var_v10 = pick_var(ds_10m, CANDIDATES["v10"])
    var_prs = pick_var(ds_msl, CANDIDATES["pressure"])
    var_prc = pick_var(ds_sfc, CANDIDATES["precip"])

    print("Vars trouvées:",
          {"temp": var_temp, "pressure": var_prs, "precip": var_prc, "u10": var_u10, "v10": var_v10})

    if not var_temp:
        raise SystemExit("t2m introuvable (température 2m). Télécharge un GRIB avec TMP 2m.")
    if not var_u10 or not var_v10:
        raise SystemExit("u10/v10 introuvables. Télécharge un GRIB avec UGRD/VGRD 10m.")
    if not var_prs:
        print("pression msl introuvable (msl/prmsl). On continue sans pression.")
    if not var_prc:
        print("précip introuvable (tp/apcp). On continue sans pluie.")

    # Déterminer la liste des temps commune (on prend celle de temp si existe)
    da_temp = ds_2m[var_temp]
    times = da_temp.time.values if "time" in da_temp.dims else np.array(["single"])
    times = [str(t) for t in times]

    # Extraire une grille "référence" (lat/lon) depuis temp (time=0)
    da0 = da_temp.isel(time=0) if "time" in da_temp.dims else da_temp
    lat, lon, grid0 = norm_lon_lat(da0)

    meta = {
        "shape": [int(grid0.shape[0]), int(grid0.shape[1])],
        "lat": {"min": float(lat.min()), "max": float(lat.max())},
        "lon": {"min": float(lon.min()), "max": float(lon.max())},
        "times": times,
        "vars": {}
    }

    def write_grid(kind, ds, varname):
        if not varname:
            return
        da = ds[varname]
        # boucle temps
        for ti in range(len(times)):
            dai = da.isel(time=ti) if "time" in da.dims else da
            _, _, grid = norm_lon_lat(dai)
            grid, unit = convert_units(kind, grid)
            out = os.path.join(OUT_DIR, f"{kind}_{ti}.bin")
            grid.astype(np.float32).tofile(out)

            if kind not in meta["vars"]:
                finite = grid[np.isfinite(grid)]
                meta["vars"][kind] = {
                    "unit": unit,
                    "vmin": float(np.min(finite)) if finite.size else 0.0,
                    "vmax": float(np.max(finite)) if finite.size else 1.0
                }

    write_grid("temp", ds_2m, var_temp)
    write_grid("u10", ds_10m, var_u10)
    write_grid("v10", ds_10m, var_v10)
    write_grid("pressure", ds_msl, var_prs)
    write_grid("precip", ds_sfc, var_prc)

    # Sauver meta
    with open(os.path.join(OUT_DIR, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    print("OK")
    print("Sortie:", OUT_DIR)
    print(" - meta.json")
    print(" - temp_*.bin u10_*.bin v10_*.bin (+ pressure/precip si dispo)")

if __name__ == "__main__":
    main()