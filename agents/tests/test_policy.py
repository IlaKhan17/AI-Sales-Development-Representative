"""Unit tests for core.policy with fake db/redis (no network)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core.policy import (  # noqa: E402
    DEFAULT_DAILY_CAP,
    check_send_allowed,
    daily_counter_key,
    record_send,
    resolve_daily_cap,
)

# ── Fakes ────────────────────────────────────────────────────────


class FakeResult:
    def __init__(self, data):
        self.data = data


class FakeQuery:
    def __init__(self, rows):
        self._rows = list(rows)

    def select(self, *_args, **_kw):
        return self

    def eq(self, key, value):
        self._rows = [r for r in self._rows if r.get(key) == value]
        return self

    def in_(self, key, values):
        self._rows = [r for r in self._rows if r.get(key) in values]
        return self

    def order(self, *_args, **_kw):
        return self

    def limit(self, n):
        self._rows = self._rows[:n]
        return self

    def execute(self):
        return FakeResult(self._rows)


class FakeDB:
    def __init__(self, tables=None):
        self.tables = tables or {}

    def table(self, name):
        return FakeQuery(self.tables.get(name, []))


class FakeRedis:
    def __init__(self):
        self.store = {}
        self.ttls = {}

    def get(self, key):
        return self.store.get(key)

    def incr(self, key):
        self.store[key] = int(self.store.get(key, 0)) + 1
        return self.store[key]

    def expire(self, key, ttl):
        self.ttls[key] = ttl


WS = "ws-1"


def make_message(**overrides):
    msg = {
        "id": "msg-1",
        "status": "approved",
        "to_email": "jane@acme.com",
        "prospect_id": "p-1",
        "idempotency_key": "p-1:1",
        "enrollment_id": None,
    }
    msg.update(overrides)
    return msg


def make_db(**overrides):
    tables = {
        "suppression_entries": [],
        "messages": [],
        "sequence_enrollments": [],
        "prospects_v2": [{"id": "p-1", "email_confidence": "verified"}],
        "product_profiles": [],
    }
    tables.update(overrides)
    return FakeDB(tables)


def codes(result):
    return [v["code"] for v in result.violations]


# ── Happy path ───────────────────────────────────────────────────


def test_happy_path_allowed():
    result = check_send_allowed(make_db(), FakeRedis(), WS, {"daily_cap": 10}, make_message())
    assert result.allowed
    assert result.violations == []


# ── Individual violations ────────────────────────────────────────


def test_not_approved():
    result = check_send_allowed(
        make_db(), FakeRedis(), WS, None, make_message(status="pending_approval")
    )
    assert not result.allowed
    assert "NOT_APPROVED" in codes(result)


def test_suppressed_recipient():
    db = make_db(
        suppression_entries=[
            {"id": "s-1", "workspace_id": WS, "email": "jane@acme.com", "reason": "unsubscribe"}
        ]
    )
    result = check_send_allowed(db, FakeRedis(), WS, None, make_message())
    assert "SUPPRESSED" in codes(result)


def test_daily_cap_reached():
    redis = FakeRedis()
    redis.store[daily_counter_key(WS)] = "5"
    result = check_send_allowed(make_db(), redis, WS, {"daily_cap": 5}, make_message())
    assert "DAILY_CAP" in codes(result)


def test_daily_cap_uses_min_of_campaign_profile_default():
    db = make_db(product_profiles=[{"workspace_id": WS, "daily_send_limit": 3}])
    assert resolve_daily_cap(db, WS, {"daily_cap": 10}) == 3
    assert resolve_daily_cap(make_db(), WS, {"daily_cap": 100}) == DEFAULT_DAILY_CAP
    assert resolve_daily_cap(make_db(), WS, None) == DEFAULT_DAILY_CAP


def test_duplicate_idempotency_key():
    db = make_db(
        messages=[{"id": "msg-old", "idempotency_key": "p-1:1", "status": "sent"}]
    )
    result = check_send_allowed(db, FakeRedis(), WS, None, make_message())
    assert "DUPLICATE" in codes(result)


def test_same_message_already_marked_sent_is_not_duplicate():
    # The row for THIS message being 'sent' should not trip DUPLICATE
    db = make_db(messages=[{"id": "msg-1", "idempotency_key": "p-1:1", "status": "sent"}])
    result = check_send_allowed(db, FakeRedis(), WS, None, make_message())
    assert "DUPLICATE" not in codes(result)


def test_enrollment_stopped():
    db = make_db(
        sequence_enrollments=[{"id": "e-1", "status": "stopped_reply"}],
    )
    result = check_send_allowed(db, FakeRedis(), WS, None, make_message(enrollment_id="e-1"))
    assert "ENROLLMENT_STOPPED" in codes(result)


def test_enrollment_active_ok():
    db = make_db(sequence_enrollments=[{"id": "e-1", "status": "active"}])
    result = check_send_allowed(db, FakeRedis(), WS, None, make_message(enrollment_id="e-1"))
    assert result.allowed


def test_low_confidence_email_blocked():
    db = make_db(prospects_v2=[{"id": "p-1", "email_confidence": "unverifiable"}])
    result = check_send_allowed(db, FakeRedis(), WS, None, make_message())
    assert "LOW_CONFIDENCE_EMAIL" in codes(result)


def test_low_confidence_email_override():
    db = make_db(prospects_v2=[{"id": "p-1", "email_confidence": "unknown"}])
    result = check_send_allowed(
        db, FakeRedis(), WS, None, make_message(low_confidence_override=True)
    )
    assert "LOW_CONFIDENCE_EMAIL" not in codes(result)
    assert result.allowed


def test_multiple_violations_collected():
    db = make_db(
        suppression_entries=[{"workspace_id": WS, "email": "jane@acme.com", "reason": "manual"}],
        prospects_v2=[{"id": "p-1", "email_confidence": "unknown"}],
    )
    result = check_send_allowed(db, FakeRedis(), WS, None, make_message(status="draft"))
    assert set(codes(result)) >= {"NOT_APPROVED", "SUPPRESSED", "LOW_CONFIDENCE_EMAIL"}


# ── record_send ──────────────────────────────────────────────────


def test_record_send_increments_with_ttl():
    redis = FakeRedis()
    record_send(redis, WS)
    record_send(redis, WS)
    key = daily_counter_key(WS)
    assert redis.store[key] == 2
    assert redis.ttls[key] == 48 * 3600
