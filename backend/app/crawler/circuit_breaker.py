"""A minimal per-source circuit breaker.

After N consecutive failures a source is 'open' (skipped) for a cooldown window,
so one flaky provider can't slow every search.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field

from app.core.config import settings


@dataclass
class _State:
    failures: int = 0
    opened_at: float | None = None


@dataclass
class CircuitBreakerRegistry:
    threshold: int = settings.circuit_breaker_threshold
    cooldown: int = settings.circuit_breaker_cooldown_seconds
    _states: dict[str, _State] = field(default_factory=dict)

    def _state(self, name: str) -> _State:
        return self._states.setdefault(name, _State())

    def is_open(self, name: str) -> bool:
        st = self._state(name)
        if st.opened_at is None:
            return False
        if time.monotonic() - st.opened_at >= self.cooldown:
            # cooldown elapsed -> half-open (allow a trial call)
            st.opened_at = None
            st.failures = 0
            return False
        return True

    def record_success(self, name: str) -> None:
        self._states[name] = _State()

    def record_failure(self, name: str) -> None:
        st = self._state(name)
        st.failures += 1
        if st.failures >= self.threshold and st.opened_at is None:
            st.opened_at = time.monotonic()


breakers = CircuitBreakerRegistry()
