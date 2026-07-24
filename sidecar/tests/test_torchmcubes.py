import unittest

import numpy as np

try:
    from sidecar.torchmcubes import marching_cubes
except ModuleNotFoundError:
    marching_cubes = None


class FakeTensor:
    def __init__(self, values, device="cuda:0"):
        self.values = values
        self.device = device

    def detach(self):
        return self

    def cpu(self):
        return self

    def numpy(self):
        return self.values


class FakeOutput:
    def __init__(self, values):
        self.values = values
        self.device = None

    def to(self, device):
        self.device = device
        return self


class TorchMcubesCompatibilityTests(unittest.TestCase):
    def test_matches_torchmcubes_zyx_vertex_order_expected_by_triposr(self):
        coordinates = np.indices((6, 6, 6), dtype=np.float32)
        volume = FakeTensor(coordinates[0] - 2.5)

        vertices, _faces = marching_cubes(
            volume,
            0.0,
            tensor_factory=lambda values: FakeOutput(values),
        )

        self.assertTrue(np.allclose(vertices.values[:, 2], 2.5))
        self.assertGreater(np.ptp(vertices.values[:, 0]), 4.0)

    def test_returns_tensor_like_vertices_and_faces_on_the_input_device(self):
        self.assertIsNotNone(marching_cubes, "torchmcubes compatibility module is missing")
        axis = np.linspace(-1.0, 1.0, 20, dtype=np.float32)
        x, y, z = np.meshgrid(axis, axis, axis, indexing="ij")
        volume = FakeTensor(x * x + y * y + z * z - 0.5)

        vertices, faces = marching_cubes(
            volume,
            0.0,
            tensor_factory=lambda values: FakeOutput(values),
        )

        self.assertGreater(len(vertices.values), 0)
        self.assertGreater(len(faces.values), 0)
        self.assertEqual(vertices.device, "cuda:0")
        self.assertEqual(faces.device, "cuda:0")


if __name__ == "__main__":
    unittest.main()
