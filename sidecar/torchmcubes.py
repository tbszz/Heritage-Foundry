try:
    from triposr_sidecar.marching import marching_cubes_numpy
except ModuleNotFoundError:
    from sidecar.triposr_sidecar.marching import marching_cubes_numpy


def marching_cubes(volume, level, tensor_factory=None):
    vertices, faces = marching_cubes_numpy(
        volume.detach().cpu().numpy(),
        level=float(level),
    )
    if tensor_factory is None:
        import torch

        tensor_factory = torch.from_numpy
    return (
        tensor_factory(vertices).to(volume.device),
        tensor_factory(faces).to(volume.device),
    )
