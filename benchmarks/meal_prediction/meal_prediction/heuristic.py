# ABOUTME: Mirrors the pinned core deterministic meal score for file-only pilot benchmarks.
# ABOUTME: Maps strictly prior definite receipts to feedback without surprise or sampling noise.

from datetime import timedelta
from typing import Mapping

from meal_prediction.features import _weather_usable
from meal_prediction.records import Exposure, Target


HEURISTIC_VERSION = "core-deterministic-v1"
HEURISTIC_INPUT_MAPPING = {
    "quiz_spiciness": 2, "ingredients_to_avoid": "exposure.context.dietaryExclusions",
    "surprise": "excluded", "yes": "like", "no": "dislike", "not_sure": "excluded",
    "history": "same-person latest definite receipt per meal; strictly prior; 14-day inclusive window; event-ID ties",
    "weather": "core rain codes 50-99 before temperature <=10 cold / >=28 hot; missing/unusable falls back to normal",
}
AVOIDED_INGREDIENT_ALIASES = {"nuts": ("peanuts", "tree nuts", "peanut sauce"),
                              "eggs": ("egg noodles",), "onions": ("onion", "pearl onions")}


def validate_history(events: tuple[Exposure, ...], targets: Mapping[str, Target]) -> dict[str, Exposure]:
    indexed = {event.event_id: event for event in events}
    if len(indexed) != len(events):
        raise ValueError("fit_events: duplicate event ID")
    for identity, target in targets.items():
        if identity not in indexed or target.event_id != identity:
            raise ValueError("fit_targets: target must match an event in the fitting partition")
        display, receipt = indexed[identity].displayed_at, target.received_at
        if (display is None or receipt is None or display.utcoffset() is None
                or receipt.utcoffset() is None or receipt <= display):
            raise ValueError("fit_targets: receipt must be aware and strictly after displayed_at")
    return indexed


def _weather(event):
    recorded = event.context.get("weather") or {}
    if not _weather_usable(event, recorded):
        return "normal"
    code, temperature = recorded.get("weatherCode"), recorded.get("temperatureC")
    if code is not None and 50 <= code <= 99:
        return "rain"
    if temperature is not None:
        if temperature <= 10:
            return "cold"
        if temperature >= 28:
            return "hot"
    return "normal"


def _similarity(meal, other):
    similarity = .5 if meal.get("cuisine") and meal["cuisine"] == other.get("cuisine") else 0
    if abs((meal.get("heaviness") or 0) - (other.get("heaviness") or 0)) <= 1:
        similarity += .25
    if abs((meal.get("spiciness") or 0) - (other.get("spiciness") or 0)) <= 1:
        similarity += .25
    return similarity


def heuristic_score(event: Exposure, prior_events: tuple[Exposure, ...], prior_targets: Mapping[str, Target]) -> float:
    if event.displayed_at is None or event.displayed_at.utcoffset() is None:
        raise ValueError("displayed_at: heuristic requires an aware prediction time")
    indexed = validate_history(prior_events, prior_targets)
    meal = event.meal
    if any(term in meal.get("primaryIngredients", ()) or term in meal.get("allergens", ())
           for avoided in event.context.get("dietaryExclusions", ())
           for term in (avoided, *AVOIDED_INGREDIENT_ALIASES.get(avoided, ()))):
        return 0.0
    cutoff = event.displayed_at-timedelta(days=14)
    receipts = sorted((target.received_at, identity) for identity, target in prior_targets.items()
                      if identity != event.event_id and indexed[identity].participant_id == event.participant_id
                      and cutoff <= target.received_at < event.displayed_at)
    latest = {indexed[identity].item_id: (indexed[identity], prior_targets[identity]) for _, identity in receipts}
    score = 1.0
    if event.item_id in latest:
        score += .4 if latest[event.item_id][1].y else -.4
    others = [(history, target) for item, (history, target) in latest.items() if item != event.item_id]
    if others:
        score += .2 * sum((1 if target.y else -1) * _similarity(meal, history.meal) for history, target in others) / len(others)
    score += -.05 * abs(2 - (meal.get("spiciness") or 0))
    if _weather(event) in meal.get("weather", ()):
        score += .2
    return score
