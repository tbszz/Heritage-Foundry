import unittest

try:
    from sidecar.triposr_sidecar.jobs import TaskStore
except ModuleNotFoundError:
    TaskStore = None


class TaskStoreTests(unittest.TestCase):
    def test_tracks_a_task_from_queue_to_success(self):
        self.assertIsNotNone(
            TaskStore,
            "sidecar.triposr_sidecar.jobs.TaskStore is not implemented",
        )
        store = TaskStore(max_tasks=4)

        task = store.create()
        processing = store.update(task.id, status="processing", progress=35)
        succeeded = store.update(
            task.id,
            status="succeeded",
            progress=100,
            model_url=f"/v1/artifacts/{task.id}.glb",
        )

        self.assertEqual(task.status, "queued")
        self.assertEqual(processing.status, "processing")
        self.assertEqual(succeeded.status, "succeeded")
        self.assertEqual(succeeded.progress, 100)
        self.assertEqual(store.get(task.id), succeeded)


if __name__ == "__main__":
    unittest.main()
