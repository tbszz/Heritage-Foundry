import unittest

import numpy as np

try:
    from sidecar.triposr_sidecar.marching import marching_cubes_numpy
except ModuleNotFoundError:
    marching_cubes_numpy = None


class MarchingCubesTests(unittest.TestCase):
    def test_extracts_a_finite_triangle_surface_from_a_density_grid(self):
        self.assertIsNotNone(marching_cubes_numpy, "marching-cubes fallback is missing")
        axis = np.linspace(-1.0, 1.0, 24, dtype=np.float32)
        x, y, z = np.meshgrid(axis, axis, axis, indexing="ij")
        sphere = x * x + y * y + z * z - 0.45

        vertices, faces = marching_cubes_numpy(sphere, level=0.0)

        self.assertGreater(len(vertices), 0)
        self.assertGreater(len(faces), 0)
        self.assertEqual(vertices.shape[1], 3)
        self.assertEqual(faces.shape[1], 3)
        self.assertTrue(np.isfinite(vertices).all())
        self.assertTrue(np.isfinite(faces).all())


if __name__ == "__main__":
    unittest.main()
