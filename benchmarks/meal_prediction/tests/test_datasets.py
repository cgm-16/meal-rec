# ABOUTME: Checks real UCI imports and small hand-built join/missingness cases.
# ABOUTME: Keeps one outcome-free observation per rated pair and verifies source bytes.

import csv
import hashlib
import io
from pathlib import Path
from zipfile import ZipFile

import pytest

from meal_prediction import datasets


OFFICIAL_SHA256 = "dc61ec3779db8d3bd2cde8d65abf87dc07e9b22ae94f9b9ad6375d57f627e333"
DATA = Path(__file__).resolve().parents[1] / "data/uci-restaurant-consumer.zip"
PROFILE_FIELDS = "userID latitude longitude smoker drink_level dress_preference ambience transport marital_status hijos birth_year interest personality religion activity color weight budget height".split()
PLACE_FIELDS = "placeID latitude longitude the_geom_meter name address city state country fax zip alcohol smoking_area dress_code accessibility price url Rambience franchise area other_services".split()
RATINGS = [
    {"userID": "U1", "placeID": "P1", "rating": "0", "food_rating": "2", "service_rating": "1"},
    {"userID": "U1", "placeID": "P2", "rating": "2", "food_rating": "0", "service_rating": "2"},
    {"userID": "U2", "placeID": "P1", "rating": "1", "food_rating": "1", "service_rating": "0"},
    {"userID": "U3", "placeID": "P3", "rating": "2", "food_rating": "2", "service_rating": "2"},
]


def write_uci_zip(path, ratings=None, duplicate_profile=False):
    profiles = [
        dict.fromkeys(PROFILE_FIELDS, "?") | {"userID": "U1", "budget": "?"},
        dict.fromkeys(PROFILE_FIELDS, "?") | {"userID": "U2", "budget": "low"},
    ]
    if duplicate_profile:
        profiles.append(dict(profiles[0]))
    places = [
        dict.fromkeys(PLACE_FIELDS, "?") | {"placeID": "P1", "name": "Café", "price": "medium", "Rambience": "familiar"},
        dict.fromkeys(PLACE_FIELDS, "?") | {"placeID": "P2", "name": "Missing cuisine", "price": "?"},
    ]
    tables = {
        "rating_final.csv": ("userID placeID rating food_rating service_rating".split(), RATINGS if ratings is None else ratings),
        "userprofile.csv": (PROFILE_FIELDS, profiles),
        "geoplaces2.csv": (PLACE_FIELDS, places),
        "usercuisine.csv": (["userID", "Rcuisine"], [
            {"userID": "U1", "Rcuisine": value} for value in ("Mexican", "American", "Mexican")
        ] + [{"userID": "U2", "Rcuisine": "?"}]),
        "chefmozcuisine.csv": (["placeID", "Rcuisine"], [
            {"placeID": "P1", "Rcuisine": value} for value in ("Mexican", "Chinese", "Chinese")
        ] + [{"placeID": "P2", "Rcuisine": "?"}]),
        "userpayment.csv": (["userID", "Upayment"], [
            {"userID": "U1", "Upayment": value} for value in ("cash", "VISA", "cash")
        ]),
        "chefmozaccepts.csv": (["placeID", "Rpayment"], [
            {"placeID": "P1", "Rpayment": value} for value in ("cash", "VISA", "cash")
        ]),
        "chefmozparking.csv": (["placeID", "parking_lot"], [
            {"placeID": "P1", "parking_lot": value} for value in ("public", "street", "public")
        ]),
        "chefmozhours4.csv": (["placeID", "hours", "days"], [
            {"placeID": "P1", "hours": "09:00-17:00;", "days": "Mon;Tue;"},
            {"placeID": "P1", "hours": "10:00-16:00;", "days": "Wed;"},
            {"placeID": "P1", "hours": "09:00-17:00;", "days": "Mon;Tue;"},
        ]),
    }
    with ZipFile(path, "w") as archive:
        for name, (fields, rows) in tables.items():
            text = io.StringIO(newline="")
            writer = csv.DictWriter(text, fieldnames=fields)
            writer.writeheader()
            writer.writerows(rows)
            encoding = "cp1252" if name == "geoplaces2.csv" else "utf-8-sig"
            archive.writestr(name, text.getvalue().encode(encoding))
    return path


def test_uci_left_join_preserves_unique_pairs(tmp_path):
    dataset = datasets.load_uci(write_uci_zip(tmp_path / "fixture.zip"))
    assert [event.event_id for event in dataset.events] == [
        "uci:U1:P1", "uci:U1:P2", "uci:U2:P1", "uci:U3:P3"
    ]
    assert [target.y for target in dataset.targets.values()] == [1, 0, 0, 1]
    first, missing_cuisine, _, missing_metadata = dataset.events
    assert first.meal["name"] == "Café"
    assert first.meal["cuisines"] == ("Chinese", "Mexican")
    assert first.meal["cuisine_missing"] is False
    assert first.context["cuisine_preferences"] == ("American", "Mexican")
    assert first.context["profile"]["budget"] is None
    assert first.context["payments"] == ("VISA", "cash")
    assert first.meal["payments"] == ("VISA", "cash")
    assert first.meal["parking"] == ("public", "street")
    assert first.meal["opening_hours"] == (
        ("Mon;Tue;", "09:00-17:00;"), ("Wed;", "10:00-16:00;")
    )
    assert missing_cuisine.meal["cuisine_missing"] is True
    assert missing_cuisine.meal["cuisines"] == ()
    assert missing_cuisine.meal["price"] is None
    assert missing_metadata.context["profile"] == {}
    assert missing_metadata.meal["cuisine_missing"] is True
    assert len(dataset.targets) == len(dataset.events) == 4


def test_uci_companion_outcomes_are_not_features(tmp_path):
    original = datasets.load_uci(write_uci_zip(tmp_path / "original.zip"))
    changed_ratings = [dict(row, rating="99", service_rating="99") for row in RATINGS]
    changed = datasets.load_uci(write_uci_zip(tmp_path / "changed.zip", changed_ratings))
    assert changed.events == original.events
    assert changed.targets == original.targets
    for event in original.events:
        assert not {"rating", "food_rating", "service_rating", "y", "answer"} & event.meal.keys()
        assert not {"rating", "food_rating", "service_rating", "y", "answer"} & event.context.keys()
        assert event.displayed_at is None
        assert not {"hunger", "weather", "displayedAt", "receivedAt"} & event.context.keys()
    assert all(target.received_at is None for target in original.targets.values())


def test_real_uci_archive_audit():
    dataset = datasets.load_uci(datasets.fetch_uci(DATA))
    assert hashlib.sha256(DATA.read_bytes()).hexdigest() == OFFICIAL_SHA256
    assert len(dataset.events) == len(dataset.targets) == 1161
    assert sum(target.y for target in dataset.targets.values()) == 516
    assert len({event.event_id for event in dataset.events}) == 1161
    assert len({event.participant_id for event in dataset.events}) == 138
    assert len({event.item_id for event in dataset.events}) == 130
    assert sum(event.meal["cuisine_missing"] for event in dataset.events) == 288
    assert all(event.displayed_at is None for event in dataset.events)
    assert all(target.received_at is None for target in dataset.targets.values())
    assert dataset.manifest["sourceProvenance"]["license"] == "CC BY 4.0"
    assert dataset.manifest["sourceSha256"] == OFFICIAL_SHA256


@pytest.mark.parametrize("food_rating", ["?", "3", ""])
def test_uci_rejects_unknown_food_rating(tmp_path, food_rating):
    ratings = [dict(RATINGS[0], food_rating=food_rating)]
    with pytest.raises(ValueError, match="food_rating"):
        datasets.load_uci(write_uci_zip(tmp_path / "invalid.zip", ratings))


def test_uci_rejects_duplicate_rated_pair(tmp_path):
    with pytest.raises(ValueError, match="duplicate"):
        datasets.load_uci(write_uci_zip(tmp_path / "duplicate.zip", RATINGS + [RATINGS[0]]))


def test_fetch_uci_downloads_verified_official_bytes(tmp_path):
    destination = tmp_path / "download" / "official.zip"
    assert datasets.fetch_uci(destination) == destination
    assert destination.stat().st_size == 39674
    assert hashlib.sha256(destination.read_bytes()).hexdigest() == OFFICIAL_SHA256


def test_fetch_uci_rejects_corrupted_cache_without_overwriting(tmp_path):
    destination = tmp_path / "corrupted.zip"
    destination.write_bytes(b"not the official source")
    with pytest.raises(ValueError, match="SHA-256"):
        datasets.fetch_uci(destination)
    assert destination.read_bytes() == b"not the official source"


def test_uci_rejects_duplicate_profile_key(tmp_path):
    with pytest.raises(ValueError, match="duplicate"):
        datasets.load_uci(write_uci_zip(tmp_path / "duplicate-profile.zip", duplicate_profile=True))


def test_uci_rejects_missing_rating_column(tmp_path):
    path = tmp_path / "missing-column.zip"
    with ZipFile(path, "w") as archive:
        archive.writestr("rating_final.csv", "userID,placeID\nU1,P1\n")
    with pytest.raises(ValueError, match="food_rating"):
        datasets.load_uci(path)


def test_uci_rejects_missing_pair_identity(tmp_path):
    with pytest.raises(ValueError, match="userID"):
        datasets.load_uci(write_uci_zip(tmp_path / "missing-user.zip", [dict(RATINGS[0], userID="?")]))
