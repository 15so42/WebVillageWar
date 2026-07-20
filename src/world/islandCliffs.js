export function createIslandCliffs(scene, THREE, worldConfig, createRock, addStaticCulledObject) {
  const config = worldConfig();
  const radius = Math.max(config.ground.width, config.ground.depth) * 0.16;
  const numCliffs = 40;
  for (let i = 0; i < numCliffs; i++) {
    const angle = (i / numCliffs) * Math.PI * 2;
    // Jitter angle
    const jitterAngle = angle + (Math.random() - 0.5) * 0.1;
    const r = radius + (Math.random() - 0.5) * 12;
    const x = Math.cos(jitterAngle) * r;
    const z = Math.sin(jitterAngle) * r;
    
    // Check path distance so we don't block the path
    const w = 12 + Math.random() * 8;
    const h = 8 + Math.random() * 6;
    
    const cliff = createRock(1, {
      color: '#7b878c',
      snowCap: true,
      snowColor: '#f0f4ea'
    });
    cliff.scale.set(w, h, w);
    cliff.rotation.y = Math.random() * Math.PI * 2;
    cliff.position.set(x, -h * 0.3, z);
    
    addStaticCulledObject(scene, cliff);
  }
}
