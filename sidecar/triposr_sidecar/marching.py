import numpy as np
from skimage import measure


def marching_cubes_numpy(volume, level=0.0):
    values = np.asarray(volume, dtype=np.float32)
    if values.ndim != 3:
        raise ValueError("marching cubes expects a three-dimensional density grid")
    vertices, faces, _normals, _samples = measure.marching_cubes(
        values,
        level=float(level),
        allow_degenerate=False,
    )
    # torchmcubes reports coordinates as (z, y, x). TripoSR deliberately
    # converts that order back to (x, y, z) after this compatibility call.
    vertices = vertices[:, [2, 1, 0]]
    return vertices.astype(np.float32), faces.astype(np.int64)
