import * as THREE from 'three';

const SOFT_PARTICLE_TEXTURE_SIZE = 32;
const softParticleTextures = new Map();

export function getSoftParticleTexture(falloff = 'soft') {
  const profile = falloff === 'tight' ? 'tight' : 'soft';
  if (softParticleTextures.has(profile)) return softParticleTextures.get(profile);

  const size = SOFT_PARTICLE_TEXTURE_SIZE;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = ((x + 0.5) / size) * 2 - 1;
      const dy = ((y + 0.5) / size) * 2 - 1;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const falloffRadius = profile === 'tight' ? 0.66 : 1;
      const radial = THREE.MathUtils.clamp(1 - distance / falloffRadius, 0, 1);
      const smoothRadial = radial * radial * (3 - 2 * radial);
      const alpha = smoothRadial * smoothRadial;
      const offset = (y * size + x) * 4;
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = Math.round(alpha * alpha * 255);
    }
  }

  const texture = new THREE.DataTexture(
    data,
    size,
    size,
    THREE.RGBAFormat,
    THREE.UnsignedByteType
  );
  texture.name = profile === 'tight'
    ? 'SharedTightFalloffParticleTexture'
    : 'SharedSoftParticleTexture';
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  // This one small texture is shared by all soft particles for the lifetime of the game.
  // Per-object disposal must not invalidate other active effects.
  texture.userData.sharedEffectResource = true;
  texture.userData.particleFalloff = profile;
  softParticleTextures.set(profile, texture);
  return texture;
}

export function createSoftParticleMaterial(color = '#ffffff', options = {}) {
  return new THREE.SpriteMaterial({
    color,
    map: getSoftParticleTexture(options.falloff),
    transparent: true,
    opacity: options.opacity ?? 1,
    depthTest: options.depthTest ?? false,
    depthWrite: false,
    blending: options.blending ?? THREE.AdditiveBlending,
    toneMapped: options.toneMapped ?? false,
    rotation: options.rotation ?? 0
  });
}

export function createSoftParticleSprite(color = '#ffffff', options = {}) {
  const sprite = new THREE.Sprite(createSoftParticleMaterial(color, options));
  sprite.userData.isSoftParticle = true;
  return sprite;
}
