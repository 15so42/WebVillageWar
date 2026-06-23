# Art Asset Drop Zone

Runtime assets should live under this folder so Vite can serve them directly.
Keep source art files such as `.blend`, `.psd`, and high-resolution exports outside
`public/`, then export optimized runtime files here.

Recommended structure:

```text
public/assets/
  models/
    units/
      swordsman.glb
      archer.glb
      raider.glb
    buildings/
      player-base.glb
      enemy-camp.glb
  vfx/
    meteor.glb
    fire-impact.glb
  textures/
    shared-palette.png
```

Naming rule: gameplay code should refer to stable keys such as `unit.swordsman`
and `vfx.meteor`, not raw file names. The mapping belongs in the art layer.
