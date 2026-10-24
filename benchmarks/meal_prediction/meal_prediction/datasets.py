# ABOUTME: Imports the licensed UCI restaurant food-rating proxy without invented occasions.
# ABOUTME: Aggregates static metadata before left joins and keeps all outcomes outside exposures.

"""Public meal keys retain geoplaces2 attributes plus cuisines/cuisine_missing,
payments, parking and opening_hours (sorted day/hour pairs). Context contains
profile attributes, cuisine_preferences and payments. These are raw static
metadata, not an automatic predictor selection or pilot meal traits.
"""

import csv
import hashlib
import io
from pathlib import Path
from urllib.request import urlopen
from zipfile import ZipFile

from meal_prediction.records import Dataset, Exposure, Target


UCI_URL = "https://archive.ics.uci.edu/static/public/232/restaurant+consumer+data.zip"
UCI_SHA256 = "dc61ec3779db8d3bd2cde8d65abf87dc07e9b22ae94f9b9ad6375d57f627e333"


def fetch_uci(destination: Path) -> Path:
    if destination.exists():
        data = destination.read_bytes()
    else:
        with urlopen(UCI_URL, timeout=30) as response:
            data = response.read()
    if hashlib.sha256(data).hexdigest() != UCI_SHA256:
        raise ValueError("UCI SHA-256 mismatch; expected the pinned official archive")
    if not destination.exists():
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
    return destination


def _rows(archive: ZipFile, name: str, required: tuple[str, ...]):
    encoding = "cp1252" if name == "geoplaces2.csv" else "utf-8-sig"
    reader = csv.DictReader(io.StringIO(archive.read(name).decode(encoding)))
    if reader.fieldnames is None or not set(required) <= set(reader.fieldnames):
        raise ValueError(f"{name}: missing required columns {required}")
    if len(set(reader.fieldnames)) != len(reader.fieldnames):
        raise ValueError(f"{name}: duplicate column names")
    rows = []
    for row in reader:
        if None in row or any(value is None for value in row.values()):
            raise ValueError(f"{name}: malformed CSV row")
        rows.append({key: None if value.strip() in ("?", "") else value.strip() for key, value in row.items()})
    return rows


def _identity(row, key, name):
    if row[key] is None:
        raise ValueError(f"{name}.{key}: expected a nonempty identity")
    return row[key]


def _single(archive: ZipFile, name: str, key: str):
    indexed = {}
    for row in _rows(archive, name, (key,)):
        identity = _identity(row, key, name)
        if identity in indexed:
            raise ValueError(f"{name}.{key}: duplicate identity {identity}")
        indexed[identity] = {field: value for field, value in row.items() if field != key}
    return indexed


def _multiple(archive: ZipFile, name: str, key: str, *fields: str):
    grouped = {}
    for row in _rows(archive, name, (key, *fields)):
        identity = _identity(row, key, name)
        values = tuple(row[field] for field in fields)
        if any(value is not None for value in values):
            grouped.setdefault(identity, set()).add(values)
    return {
        identity: tuple(
            values[0] if len(fields) == 1 else values
            for values in sorted(rows, key=lambda values: tuple(value or "" for value in values))
        )
        for identity, rows in grouped.items()
    }


def load_uci(zip_path: Path) -> Dataset:
    data = zip_path.read_bytes()
    with ZipFile(io.BytesIO(data)) as archive:
        ratings = _rows(archive, "rating_final.csv", ("userID", "placeID", "food_rating"))
        profiles = _single(archive, "userprofile.csv", "userID")
        places = _single(archive, "geoplaces2.csv", "placeID")
        preferences = _multiple(archive, "usercuisine.csv", "userID", "Rcuisine")
        cuisines = _multiple(archive, "chefmozcuisine.csv", "placeID", "Rcuisine")
        user_payments = _multiple(archive, "userpayment.csv", "userID", "Upayment")
        place_payments = _multiple(archive, "chefmozaccepts.csv", "placeID", "Rpayment")
        parking = _multiple(archive, "chefmozparking.csv", "placeID", "parking_lot")
        hours = _multiple(archive, "chefmozhours4.csv", "placeID", "days", "hours")
    events = []
    targets = {}
    for row in ratings:
        user = _identity(row, "userID", "rating_final.csv")
        place = _identity(row, "placeID", "rating_final.csv")
        identity = f"uci:{user}:{place}"
        if identity in targets:
            raise ValueError(f"rating_final.csv: duplicate rated pair {user}/{place}")
        if row["food_rating"] not in ("0", "1", "2"):
            raise ValueError("rating_final.csv.food_rating: expected code 0, 1 or 2")
        meal = dict(places.get(place, {}), id=place, cuisines=cuisines.get(place, ()),
                    cuisine_missing=not cuisines.get(place), payments=place_payments.get(place, ()),
                    parking=parking.get(place, ()), opening_hours=hours.get(place, ()))
        context = {"profile": dict(profiles.get(user, {})),
                   "cuisine_preferences": preferences.get(user, ()), "payments": user_payments.get(user, ())}
        events.append(Exposure(identity, user, place, None, meal, context))
        targets[identity] = Target(identity, int(row["food_rating"] == "2"), None)
    manifest = {
        "schemaVersion": 1,
        "sourceProvenance": {
            "name": "Restaurant & consumer data",
            "url": "https://archive.ics.uci.edu/dataset/232/restaurant+consumer+data",
            "license": "CC BY 4.0",
            "attribution": "Rafael Ponce Medellín and Juan Gabriel González Serna (creators); "
                           "Blanca Vargas-Govea and Juan Gabriel González Serna (donors). "
                           "Restaurant & consumer data. UCI Machine Learning Repository. "
                           "DOI: 10.24432/C5DP41. Modified by missing-value normalization, "
                           "set aggregation and a top-code food-rating binary target.",
        },
        "downloadUrl": UCI_URL,
        "sourceSha256": hashlib.sha256(data).hexdigest(),
        "targetDefinition": "food_rating == 2; codes 0 and 1 are valid negatives",
    }
    return Dataset("uci", manifest, tuple(events), targets, ())
