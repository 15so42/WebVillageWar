// 描边豁免标记：细叶类不透明材质往颜色缓冲 alpha 写入低于 1 的值，
// Game.js 的 OutlineShader 读到标记后跳过描边并把 alpha 还原为 1。
// 画布是透明上下文，描边 pass 未运行时标记会直接透到页面上，
// 所以只有描边 pass 实际生效的帧才写入标记值，其余帧写 1。
export const OUTLINE_EXEMPT_ALPHA = 0.3;

export const OUTLINE_MASK_UNIFORMS = {
  uOutlineExemptAlpha: { value: 1 }
};

export function setOutlineMaskActive(active) {
  OUTLINE_MASK_UNIFORMS.uOutlineExemptAlpha.value = active ? OUTLINE_EXEMPT_ALPHA : 1;
}

export function markOutlineExempt(shader) {
  shader.uniforms.uOutlineExemptAlpha = OUTLINE_MASK_UNIFORMS.uOutlineExemptAlpha;
  shader.fragmentShader = `uniform float uOutlineExemptAlpha;\n${shader.fragmentShader}`.replace(
    '#include <dithering_fragment>',
    `#include <dithering_fragment>
    gl_FragColor.a = uOutlineExemptAlpha;`
  );
}
