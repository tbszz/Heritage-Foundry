import secrets
import threading
from collections import OrderedDict
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from typing import Optional


TERMINAL_STATUSES = frozenset({"succeeded", "failed", "canceled"})


class TaskCapacityError(RuntimeError):
    pass


@dataclass(frozen=True)
class Task:
    id: str
    status: str
    progress: int
    created_at: str
    model_url: Optional[str] = None
    preview_url: Optional[str] = None
    error: Optional[str] = None


class TaskStore:
    def __init__(self, max_tasks: int = 100, on_evict=None):
        self._max_tasks = max(1, int(max_tasks))
        self._on_evict = on_evict
        self._tasks = OrderedDict()
        self._lock = threading.RLock()

    def create(self) -> Task:
        task = Task(
            id=secrets.token_hex(16),
            status="queued",
            progress=0,
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        evicted = None
        with self._lock:
            if len(self._tasks) >= self._max_tasks:
                evicted_id = next(
                    (
                        task_id
                        for task_id, existing in self._tasks.items()
                        if existing.status in TERMINAL_STATUSES
                    ),
                    None,
                )
                if evicted_id is None:
                    raise TaskCapacityError("all retained tasks are active")
                evicted = self._tasks.pop(evicted_id)
            self._tasks[task.id] = task
        if evicted is not None and self._on_evict is not None:
            self._on_evict(evicted)
        return task

    def get(self, task_id: str) -> Optional[Task]:
        with self._lock:
            return self._tasks.get(task_id)

    def update(self, task_id: str, **changes) -> Task:
        with self._lock:
            current = self._tasks.get(task_id)
            if current is None:
                raise KeyError(task_id)
            updated = replace(current, **changes)
            self._tasks[task_id] = updated
            return updated

    def delete(self, task_id: str) -> None:
        with self._lock:
            self._tasks.pop(task_id, None)
