import importlib.util, json
from datetime import datetime

spec = importlib.util.spec_from_file_location("appmod", "../app.py")
# app.py lives one level up from reviewer-web/tests -> use absolute path
import os
here = os.path.dirname(os.path.abspath(__file__))
app_path = os.path.normpath(os.path.join(here, "..", "..", "app.py"))
spec = importlib.util.spec_from_file_location("appmod", app_path)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

FIXED = datetime(2026, 1, 1, 12, 0, 0)

class _Frozen(datetime):
    @classmethod
    def now(cls, tz=None):
        return FIXED

m.datetime = _Frozen  # freeze clock for deterministic due_at

def make_config(algo):
    cfg = json.loads(json.dumps(m.DEFAULT_CONFIG))
    cfg["scheduler"]["algorithm"] = algo
    return cfg

new_row = {
    "stability": 2.5, "difficulty": 5.0, "interval_days": 0.0,
    "ease_factor": 2.5, "review_count": 0, "last_review_at": None,
}
reviewed_row = {
    "stability": 5.0, "difficulty": 3.0, "interval_days": 8.0,
    "ease_factor": 2.3, "review_count": 3,
    "last_review_at": "2025-12-22T12:00:00",  # 10 days before FIXED
}

cases = []
for algo in ("FSRS-Lite", "SM-2", "Fixed"):
    cfg = make_config(algo)
    for label, row in (("new", new_row), ("reviewed", reviewed_row)):
        for rating in (0, 1, 2, 3):
            expected = m.calculate_schedule(dict(row), rating, cfg)
            cases.append({
                "algo": algo, "label": label, "rating": rating,
                "row": row, "expected": expected,
            })

print(json.dumps(cases))
