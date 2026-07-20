export function disposeObject3D(object, options = {}) {
  const disposeMaterials = Boolean(options.materials);
  const geometries = new Set();
  const materials = new Set();

  object?.traverse?.((node) => {
    if (node.geometry && !geometries.has(node.geometry)) {
      geometries.add(node.geometry);
      node.geometry.dispose?.();
    }

    if (!disposeMaterials || !node.material) return;
    const nodeMaterials = Array.isArray(node.material) ? node.material : [node.material];
    nodeMaterials.forEach((material) => {
      if (material) materials.add(material);
    });
  });

  materials.forEach(disposeMaterial);
}

export function disposeMaterial(material) {
  if (!material) return;
  Object.keys(material).forEach((key) => {
    const value = material[key];
    if (value?.isTexture) {
      value.dispose?.();
    }
  });
  material.dispose?.();
}
