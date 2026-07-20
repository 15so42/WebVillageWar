import {
  CARD_DEFINITIONS,
  CARD_META,
  DECK_SIZE,
  LEVEL_DEFINITIONS,
  STARTER_CARD_IDS
} from '../data/gameData.js';
import { buildEnchantmentEncyclopediaSections } from '../data/enchantmentEncyclopedia.js';
import { cardEnergyCost, cardThemeColor, cardUseBarMarkup, createCardArtMarkup } from './CardSystem.js';

const STORAGE_KEY = 'village-war-meta-v1';
const STARTING_COINS = 10000;
const STARTING_COINS_VERSION = 1;
const MAX_LEVEL_DIFFICULTY = 10;
const WAVE_DIFFICULTY_GROWTH_PER_SELECTED_DIFFICULTY = 0.16;
const TEST_VERSION_LABEL = '测试版本 v0.2.45';
const CHANGELOG_ENTRIES = [
  {
    date: '2026-07-19',
    title: '重新设计：纯正中世纪桌游面板',
    items: [
      '全面颠覆Web样式布局，重新构建极致深沉的中世纪战争沙盘UI，采用真实的木材、羊皮纸与金属材质。',
      '重做手牌与卡面结构：剪裁卡角并搭配真实的魔法红蜡费用印记，费用边框动态升级（黑铁、秘银、紫罗兰、真金）。',
      '重构主界面布局：取消半透明悬浮框，将战役状态收束至顶部中央悬挂的“木制战略指挥牌”内，配以铁钉铆接。',
      '重做主菜单系统：将主菜单替换为中世纪羊皮纸画卷风格。',
      '将主界面的整体背景修改为羊皮纸质感的手绘世界地图，并铺满整个屏幕以适应横屏布局；移除了原先的简易手绘插画底纹以保持界面整洁。',
      '深度增强了全屏地图背景的信息密度：添加了带有低对比度的手绘山脉、河流、森林、道路、探险路线以及城堡与村庄的位置标记，同时加入了古老的王国边界线与探险指南针等丰富细节。',
      '彻底重新设计了中世纪王国徽章与战旗：制作了一面具有极高厚重感的深色锻造铁质盾徽，边缘采用旧化金属包边，并带有逼真的磨损、划痕与氧化痕迹；徽章背后悬挂了一面带有金色刺绣与自然布料褶皱的深红色旧式战旗，两者共同构成了一个极具历史年代感的王国标志。',
      '修复了战旗和徽章SVG材质因为Alpha通道混合导致的方形模糊白边问题。',
      '将测试版本标识移动到了屏幕最底部水平居中位置，避免和右侧其他元素冲突。',]
  },

  {
    date: '2026-07-19',
    title: '后处理优化、环境参数与材质升级',
    items: [
      '应用全新环境预设：全量对齐并应用了全新调配的雪原场景环境参数 JSON，调整描边线宽度为 0.7、颜色微调为温暖的 #fea97c，并结合最新的 0.26 深度阈值，使画面呈现更加干净通透、轮廓立体和低面数艺术质感。',
      '岩石山体材质重构：重构岩石材质着色器，引入基于世界坐标（World Position）的低频 3D 噪声，实现在同一块岩石的不同多边形（Polygon）之间呈现自然、柔和的颜色差异，且不生成明显的纹理或脏点，完全不影响材质粗糙度与法线。',
      '世界法线面向色彩：新增基于世界法线方向（World Normal）的朝向颜色过渡。岩石顶部面自动叠加少量暖色调并增加亮度，侧面保持冷灰底色，底部与背光面则降低亮度并融入少量冷色调，强化 Low Poly 块面的几何雕塑感。',
      '树木材质高度渐变：树木叶片/针叶材质专属定制世界高度渐变着色器（World Height Gradient），使树木底部颜色稍暗、顶部颜色稍亮且略微带灰（霜冻退色感），并配置智能色彩感知公式，完美确保叶片表面的白雪覆盖层在渐变中保持明亮纯净。',
      '特效与指示环排除描边：利用 Three.js 图层渲染机制（Layer 1），成功将所有卡牌特效、粒子系统、法术魔法阵、投射物、飘字、单位选中环、攻击范围环、以及祭坛占领进度环与地面掉落卡牌环与主描边流程解耦，避免其受到描边后处理影响，保持纯净柔和的发光与半透明效果。',
      '分层后处理流水线：重构了 EffectComposer 渲染管线，依次进行主场景常规物体（Layer 0）渲染、SAO环境遮蔽、Bloom辉光与描边计算，随后将非描边指示物及特效（Layer 1）无缝叠加覆盖，实现极致干净的 Low Poly 画面观感。'
    ]
  },
  {
    date: '2026-07-18',
    title: '第一关渲染参数与阴影参数精调',
    items: [
      '渲染参数精细化：将第一关（雪原营地）的默认渲染参数深度对齐，包括设置 AO 缩放为 2.5，阳光强度 3.58，阳光颜色 #fead5d，太阳位置 (-65, 30, -59)，且天空、半球、雾等各项参数完全和调优配置合一。',
      '阴影强度参数：新增阳光阴影强度控制，并将第一关的默认阴影强度固定为 0.8（不可调节），使场景的光影遮蔽效果更加立体且极具 Low Poly 特色质感。',
      '相机初始高度拉高：将第一关的相机初始高度及距离比例提升 30%，扩展战场可视边界与战术深度感。',
      '山体布局微调：将第一关的所有丘陵、山脊以及背景岩石布局坐标等比向内收拢 5%，让地形骨架更加聚拢和紧凑。',
      '雪地平滑着色：将雪地地表等地形渲染方式由分面着色（flatShading: true）统一调整为平滑着色（smooth shading），消除过度破碎的三角面片感，展现纯净且连贯的冬日雪野质感。',
      '场景轻微描边：实现并引入了全新的基于颜色距离的高性能后处理描边效果，强化了 Low Poly 物体间的轮廓与空间感，并可在渲染面板自由调节描边粗细、颜色和阈值。'
    ]
  },
  {
    date: '2026-07-18',
    title: '引入 Bad North 风格化场景增强',
    items: [
      '视觉中心强化：在雪地冷色调中加入了具有暖色屋顶的木屋和守卫旗帜，建立道路入口与途径点的视觉焦点。',
      '树群设计重构：取消了随机散落的树木，重新将其分布为具有边界感和道路入口包围感的树群。',
      '岩壁材质调整：将基于 face/world position noise 的低频颜色变化幅度调整为 ±5%，进一步凸显 Low Poly 大色块表现。',
      '雪地质感优化：为地形材质添加了基于噪声的粗糙度 (roughness) 映射，提升了雪地在夕阳光照下的微观层次。'
    ]
  },
  {
    date: '2026-07-18',
    title: '场景材质全面优化',
    items: [
      '岩壁材质升级：优化低频程序化颜色变化（world position noise），noise scale 保持 0.08，将 albedo variation 调整为 ±4%，去除多余的纹理污渍，突显干净的大色块 Low Poly 风格。',
      '雪地道路优化：为雪地增加低频程序化变化，高低与色彩的变化幅度控制在 3% 以内；同时移除了道路上的草丛，保持纯粹的雪地观感。',
      '树木材质调整：将雪地松树暗部绿色材质的亮度提高了约 10%，在保留冬季冷色基调的同时增加场景明快感。'
    ]
  },
  {
    date: '2026-07-18',
    title: '调整场景光照微调（第五版）',
    items: [
      '光照参数更新：将阳光的位置调整至 (x: -65, y: 30, z: -59)。'
    ]
  },
  {
    date: '2026-07-18',
    title: '重构岩壁材质并增加随机色差 Shader',
    items: [
      '材质升级：移除了岩石/山体可能的生硬色块，通过自定义 GLSL Shader 引入基于世界坐标 (world position) 的低频 3D 噪声 (scale 0.08)。',
      '视觉效果：不再依赖纹理贴图与污渍，在保持低多边形 (low poly) 干净大色块风格的前提下，为岩壁漫反射 (Albedo) 增加了 ±3% 的低频色差。',
      '粗糙度适配：配合噪声，将岩石表面的粗糙度动态映射到 0.85 ~ 1.0 的区间，提升光影质感。'
    ]
  },
  {
    date: '2026-07-18',
    title: '调整场景光照微调（第四版）',
    items: [
      '光照参数更新：将阳光颜色微调至更深橘色 (#fead5d)。',
      'AO效果减弱：将环境光遮蔽的缩放 (Scale) 从 2.8 降低到 2.3，减轻阴影的过度堆叠。'
    ]
  },
  {
    date: '2026-07-18',
    title: '调整场景光照微调（第三版）',
    items: [
      '光照参数更新：恢复曝光度为 1，提高亮度至 1.15，环境光强度降至 0.96 并调整了天地颜色以更加融合。',
      'AO效果增强：将环境光遮蔽的缩放 (Scale) 从 2.6 提高到 2.8。',
      '背景色更新：背景色微调至 #b4c8d2。'
    ]
  },
  {
    date: '2026-07-18',
    title: '调整场景光照微调',
    items: [
      '光照参数更新：根据请求调整了光照参数。增加了曝光度（Exposure 0.96），提高了对比度（1.06）与饱和度（0.99），将阳光颜色微调至更偏黄的橘色 (#ff9233)，并扩大了雾气的可见距离范围 (20 至 215)。'
    ]
  },
  {
    date: '2026-07-18',
    title: '调整场景光照回暖橘色夕阳',
    items: [
      '光照调整：根据设定将直射光恢复为暖橘色 (fe7d0b) 夕阳，太阳强度回升至 3.5。',
      '环境光回滚：撤销了之前的低角度冷色环境设定，HemisphereLight 恢复为原本的蓝灰色调组合，并去除了冗余的泛光与补充环境光。'
    ]
  },
  {
    date: '2026-07-18',
    title: '调整场景为夕阳光照与去除地面雾气',
    items: [
      '环境氛围：移除了地面的全局雾气效果（Volume Mist），使底部视野更加清晰。',
      '光照重构：将主光源改为低角度暖色夕阳光（DirectionalLight 调低位置并赋暖色），阴影覆盖范围扩大。',
      '环境补光：新增冷色 AmbientLight 以提供基础蓝调照明，并与 HemisphereLight 配合，形成暖色直射光与冷色环境阴影的对比。',
      '材质优化：降低了所有材质的金属感（Metalness 归零），提升了雪地（0.9）与岩壁（0.85）的粗糙度。',
      '后处理增强：新增轻微的泛光效果（Bloom，强度 0.15）和暖色域色彩校正（Warmth 滤镜）。'
    ]
  },
  {
    date: '2026-07-18',
    title: '回滚过度调整并微调场景材质',
    items: [
      '色彩与光影还原：全面恢复了此前雪地战场的色彩表现、树木基色、岩壁明暗层次和自然光照体系。',
      '岩石质感打磨：保留了低模纯净风格和法线、高度的面级色彩变化，仅微调提升了粗糙度（Roughness 0.88-1.0）并降低了环境反射，减少金属感与塑料感。',
      '光照微调：略微下调了主光源直射强度（Sun Intensity），适当降低纯白曝光，让蓝色阴影和明暗对比更加自然舒适。',
      '植被色调优化：在原版冷杉绿色基础上略微降低了 10%-15% 的饱和度，并轻微融入蓝灰色调，更好地融入冷色冬季场景。'
    ]
  },
  {
    date: '2026-07-18',
    title: '岩壁材质纯净重塑：三层色彩平滑渐变',
    items: [
      '低模纯净风格：完全移除了所有岩石表面的噪声纹理、污渍、裂纹及黑点，回归最纯粹的低模 (Low-poly) 色块风格。',
      '法线方向着色：引入基于法线的定制着色算法。顶部面保持雪白偏冷灰，垂直受光面呈现中灰蓝色，而背光面平滑过渡至深灰蓝色，显著增强了立体感。',
      '世界高度渐变：岩壁整体根据世界坐标高度呈现极微弱的平滑亮度渐变（顶部略亮、底部略暗），消除水平分层感，使大山体更加自然。',
      '几何面随机微调：以网格面 (Mesh Face) 为单位添加了固定 8% 的随机基础色偏移，并引入了 0.75 到 0.95 的面级粗糙度 (Roughness) 随机变化，使材质在光照下更具质感，保持低模纯净风格。'
    ]
  },
  {
    date: '2026-07-18',
    title: '调整雪地散落碎石',
    items: [
      '材质还原：雪地上的小型岩石已恢复为原有的低面数（Low-poly）极简风格。',
      '分布优化：重新调整了小型岩石的生成规则，不再随机散落在道路中央，而是主要分布在道路两旁靠近山体和林缘的位置。'
    ]
  },
  {
    date: '2026-07-18',
    title: '优化场景随机度：水平顶点偏移重构与场景减负',
    items: [
      '精准水平顶点偏移：重新设计了悬崖和岩石的顶点偏移 (Jitter) 算法，现在仅对物体的“腰部”水平横向移动。这完美保留了顶部平滑形状和底部基座形状，彻底消除了顶点断层撕裂和错位穿模现象。',
      '精简场景装饰：调低了中央通路和路边的环境散落石头数量，并进一步降低了道路旁碎石生成的随机概率，让雪地留白更多，视觉焦点更集中。',
      '紧急修复尖刺BUG：修正了大型悬崖在应用顶点偏移时，未能抵消网格缩放倍率导致偏移量被异常放大的问题，消除了画面中出现的巨大撕裂尖刺。'
    ]
  },
  {
    date: '2026-07-18',
    title: '修复材质报错问题',
    items: [
      '代码修复：修复了场景生成时调用未定义的 proceduralMat 导致渲染崩溃的错误，现已统一回正确的低多边形基础材质。',
    ]
  },
  {
    date: '2026-07-18',
    title: '优化场景随机度：大幅降低岩石撕裂与场景元素堆积',
    items: [
      '顶点扰动优化：经过重新计算，将所有微观顶点随机偏移 (Jitter) 的幅度下调了约 70%，在保留 Low Poly 表面自然风化感的同时，解决了顶点偏移过大导致的过度破碎与撕裂感。',
      '精简场景装饰：调低了中央通路和路边的环境散落石头数量，并进一步降低了道路旁碎石生成的随机概率，让雪地留白更多，视觉焦点更集中。'
    ]
  },
  {
    date: '2026-07-18',
    title: '修复场景雪山顶点撕裂问题',
    items: [
      '顶点合并问题：修复了在引入顶点随机扰动 (Jitter) 时使用了全局随机数或基于索引的随机数，导致 Three.js 在 toNonIndexed() 或圆柱体接缝处，由于同一位置的多个顶点发生不同方向偏移而产生的模型面片撕裂 (Tearing) 现象。',
      '确定性哈希：通过重构所有高山、崖壁、岩石的扰动算法，改为基于顶点的原始空间坐标 (x, y, z) 计算确定性哈希 (Deterministic Hash)，确保了在同一空间位置的重叠顶点产生完全一致的三维形变，恢复了无缝闭合的平滑雪地 Low Poly 质感。'
    ]
  },
  {
    date: '2026-07-18',
    title: '强化场景边缘高山 (Island Cliffs)：增加网格细分与自然顶点扰动',
    items: [
      '更丰富的山体轮廓：修复了先前只改动了中小型岩石和雪盖柱的遗漏。现在，场景两侧巨大的平顶高山 (Island Cliffs) 径向分段数已从 6~8 边提升至 16~21 边，并增加了多个高度分段 (4 段岩体 + 2 段积雪)。',
      '微观顶点随机扰动 (Micro Vertex Jitter)：同样在巨型山体上引入了基于面法线的连续顶点级三维坐标随机偏移（Jitter），让整个场景最外围的峭壁真正摆脱了光滑生硬的圆柱感，展现出真实的、富有低多边形块面质感的风化岩壁效果。'
    ]
  },
  {
    date: '2026-07-18',
    title: '强化背景山峰几何体：增加网格细分与自然顶点扰动',
    items: [
      '显著的自然侵蚀感：将大型六角形山峰 (Background Snow Rock) 的面数从原本的 5~7 边增加至 12~18 边，高度分段数从 1 段提升至 4 段。在保持 Low Poly 风格的同时，使原先巨大的平直线条变得更加生动。',
      '微观顶点随机扰动 (Micro Vertex Jitter)：同步在基础的扭曲之上加入了 0.15 * size 幅度的微观随机位移，让岩壁更具有凹凸不平的自然质感。'
    ]
  },
  {
    date: '2026-07-18',
    title: '强化岩壁几何体：放大微观顶点扰动幅度',
    items: [
      '显著的自然侵蚀感：将大型崖壁柱 (Cliff Pillar) 的顶点微观随机扰动幅度从 0.06 提升至 0.15，使不规则面片结构和凹凸感在远景和近景下都更加明显，告别平滑的柱体。',
      '雪盖同步畸变：同步调大了雪盖顶点的畸变系数，使积雪在受风化岩壁边缘的包裹和覆盖更具真实感。'
    ]
  },
  {
    date: '2026-07-18',
    title: '强化雪山山峰：同步提升模型精度与自然感',
    items: [
      '模型细分 (Geometry Subdivisions)：背景山峰的 ConeGeometry 径向分段数从 7 提升至 12 面，并增加了 4 个高度分段。',
      '山顶随机位移 (Peak Vertex Jitter)：在山峰岩体和顶部雪盖中也引入了随机的顶点 X/Z 轴偏移，避开了顶点撕裂，使原本规则的圆锥形雪山呈现出自然侵蚀的岩石嶙峋感。'
    ]
  },
  {
    date: '2026-07-18',
    title: '强化岩壁几何体：增加网格细分与自然顶点扰动',
    items: [
      '提升面数模型精度：将大型雪地崖壁 (Cliff Pillar) 的径向分段数从 5~7 面提升至 12~18 面，高度分段数从 3 段翻倍至 6 段。在保持 Low Poly 块面感的同时，大幅增加了模型的轮廓细节。',
      '微观顶点随机扰动 (Micro Vertex Jitter)：在基础的大型块面形变之上，引入了更为细腻的顶点级 3D 随机位移。模拟了自然岩石表面的崎岖与凹凸不平，打破了纯几何圆柱的死板僵硬，使岩壁轮廓更加生动真实。'
    ]
  },
  {
    date: '2026-07-18',
    title: '修复地形材质：移除多余的彩色噪点',
    items: [
      '消除彩色色斑：移除了之前由随机 RGB 噪声导致的红绿蓝（彩色）斑点。现在的岩壁色彩随机被严格限制在极其微小的明度变化（±3%）和暖冷倾向（±1%），回归高级灰设定。',
      '无缝面级过渡：优化了噪点对世界坐标的采样频率，确保大型平整岩壁（如柱状节理）在拥有微小色彩差异的同时，单一面内不会出现不自然的颜色渐变。'
    ]
  },
  {
    date: '2026-07-18',
    title: '修复地形材质：解决岩壁面级随机导致的像素噪点问题',
    items: [
      '重构随机算法：修复了 GPU 2x2 像素块导数 (dFdx/dFdy) 精度微小差异被向下取整放大导致的“电视雪花”噪点。',
      '平滑连续采样：废弃了断层式的 Floor + Hash，改为向连续 3D 噪波 (Simplex Noise) 传入面法线与世界坐标。',
      '保留面级色差：在同一个平面上颜色保持平滑一致（无像素块），而在跨越岩石折角时，因法线突变能完美产生面与面之间的独立色彩差异，彻底修复了材质显示异常。'
    ]
  },
  {
    date: '2026-07-18',
    title: '重构地形 Shader：极致风格化 Low Poly 岩壁与面级色彩随机',
    items: [
      '面级色彩随机 (Face-Level Randomness)：去除了所有 Albedo 噪声，改为基于模型面法线 (Face Normal) 生成稳定的随机 Hash。完美实现了“以 Triangle / Face 为单位”的轻微颜色差异（明度 ±5%，色相 ±3%），彻底杜绝了插值渐变和脏污感。',
      '法线朝向叠色 (Normal Based Color Stacking)：根据岩壁面的真实朝向进行颜色映射。向上的面呈现明亮冷灰，垂直面保持中灰，背光/向下的面叠印深灰蓝色，赋予了干净的 Low Poly 块面体积感。',
      '纯粹粗糙度扰动 (Roughness Only Noise)：World Space FBM Noise 现在仅作用于材质的 Roughness（粗糙度）层。岩石整体保持极简色块，但不同反光角度下呈现丰富的受光质感层次。',
      '自动曲率与高度雪盖 (Curvature & Snow Cover)：利用 dFdx/dFdy 动态计算面级曲率 AO，凹陷和底部自然变暗。山岩顶部基于世界高度和平缓度，自然生成冷白色的柔和雪盖，降低 Specular，完美融入雪地环境。'
    ]
  },
  {
    date: '2026-07-18',
    title: '重构地形 Shader：风格化 Low Poly 纯净岩石',
    items: [
      '极致纯净岩石 (Stylized Low Poly Rock)：剥离了表面所有容易导致“脏污感”的明显的 Albedo Noise，仅保留 0~3% 极微弱低频色彩扰动以防色带断裂。岩石回归高度纯色干净的本质。',
      '世界空间噪波驱动粗糙度 (World Space Roughness Noise)：将 FBM 噪波的作用范围严格限制在 Roughness (粗糙度) 层。岩石整体保持高粗糙度，但在不同光照角度下呈现出细微且丰富的受光质感，打破了死板的均匀反光，细节全由 Lighting 赋予，而非贴图。',
      '法线曲率环境遮蔽 (AO / Curvature)：基于 dFdx/dFdy 动态计算面法线，并在 Shader 中实现了自动曲率遮蔽——岩石边缘、底面、凹陷处自动生成轻微、柔和的暗部过渡，不带任何脏污噪点。',
      '高度融合雪盖 (Snow Cover Blend)：在岩石材质中内置了基于世界高度与面朝向的柔和雪层生成逻辑。随海拔升高和顶部朝向，岩石顶端会自然过渡出冷白色的雪盖积层，Specular 降至极低，让场景融为一体。',
      '重调天光环境 (Cool Environment Light)：移除了容易染红整个场景的过量暖色调光，保留了清透的冷蓝色环境天光。日落金光仅严格作用于迎光面，整个世界明暗对比清冽自然。'
    ]
  },
  {
    date: '2026-07-18',
    title: '重构地形 Shader：回归纯净 Low Poly 与光影质感',
    items: [
      '修复半透明 Bug：修正了材质缓存 key 的生成逻辑，修复了因缓存冲突导致山脉/岩石错误应用半透明材质的问题。',
      '净化岩石材质：去除了岩石表面的高频噪声和污渍纹理（BaseColor 现保持几乎纯色，仅有极弱的 1% 极低频过渡），彻底杜绝了“脏污”或“水泥”感。',
      '纯净雪地渲染：雪地取消了所有颜色扰动噪声，还原最为纯粹干净的白雪质感。',
      '保留粗糙度细节：将程序化噪声的作用域严格限制在材质粗糙度（Roughness）和微弱的朝向环境光遮蔽（AO）上，在保持视觉干净极简的同时，赋予了在受光面流转时光影的质感变化。'
    ]
  },
  {
    date: '2026-07-18',
    title: '全面启用程序化材质 Shader：纯粹 Low Poly 自然体验',
    items: [
      '程序化岩石材质：舍弃了单一顶点颜色的岩石，全面重构为基于 3D Simplex Noise 的程序化 Shader。颜色产生自然微弱的纹理变化，同时通过曲率 AO 计算自动加深岩缝和阴影部位。',
      '纯粹雪地渲染：去除了雪层的纯白过曝，雪地如今引入了极弱的高频噪点来打破死板，呈现出更为松软和自然的冷暖过渡。',
      '松树材质优化：松树冠调整为深冷绿色，并微弱加入了材质本身的自发光（Emissive），有效去除了背光面的纯黑死角，树冠上的积雪也变得更为冷白清透。',
      '光影精调：保留落日方向，完全去除了全局滤镜的暖色偏移（Warmth 归零），提升了天光冷蓝比重，整体质感清冽。'
    ]
  },
  {
    date: '2026-07-18',
    title: '全局光影与材质再平衡：柔和雪原与清透冷灰',
    items: [
      '光照与曝光优化：大幅降低了全局曝光（Exposure）和暖色光晕滤镜（Warmth），保留了落日余晖的柔和暖黄，并增强了环境光（Ambient）的冷蓝色调，避免了雪地大面积过曝发白。',
      '纯粹冷灰岩壁：进一步调校了岩石材质，完全摒弃金属感（Metalness 0, 高 Roughness），雪盖岩石的高光边缘调整为冷暖中和的微灰暖白，还原最纯粹的自然灰蓝色岩壁质感。',
      '战损泥雪路径：为中央战场路径的雪地引入了更强烈的自然噪点（Crust Noise）和些许灰色泥雪斑驳（Dirt Noise），打破纯色平面的枯燥，呈现真实的冰雪行军踩踏感。',
      '深绿松林微调：降低了树木阴影区过重的黑色，整体提升了松针的色彩饱和度（改为深冷绿色），搭配纯冷白色的树冠积雪，使松林在夕阳下更具通透感。'
    ]
  },
  {
    date: '2026-07-18',
    title: '冷暖对比深化：天然冷灰岩石与战损路径',
    items: [
      '冷峻群山回归：去除崖壁材质中多余的粉/橙暖色泛光，将岩石基调回归冷灰蓝（#64707a），仅在受光边缘保留微弱暖白反射，与夕阳光照形成极其迷人的冷暖对比。',
      '风霜雪路刻画：深化中央战场的踏雪路径效果，通过算法添加微妙的雪地压痕噪点（Trampled noise）和车辙印记，让战场通道显得真实踩踏过，而非平坦空洞。',
      '路径散落碎石：在主路周边及边缘，极其克制地散落了微型天然灰石，强化“战场通道”的空间指引感和环境细节，打破原先过于单一平坦的雪面。',
      '浓郁针叶冷松：进一步优化松树冠的层次色彩（#355242 / #40614f），去除了纯黑生硬的阴影区，保持树顶落雪呈现清冷的纯白，让松林整体更显生机。'
    ]
  },
  {
    date: '2026-07-18',
    title: '材质色彩深度打磨：自然岩石与松软积雪（Bad North 风格）',
    items: [
      '天然无光岩石：全面移除了岩石材质的金属反光感（Roughness 接近 1.0），基础色调转向略带暖色的深灰（#7a7470），使其质感如 Bad North 中自然风化的无光岩壁般朴素、厚重。',
      '松软粉雪重塑：积雪材质增加全粗糙度（Roughness 1.0），去除了表面高光，大幅降低了雪顶与岩石间的生硬反差，让雪原呈现更加松软、粉状的天然质感。',
      '墨绿松林光影：重新调校了针叶林的色彩，树冠加深为更为浓郁的深松绿，并在背光处透出微妙的蓝绿色冷调阴影；树枝积雪调整为柔和的暖白，与树木形体自然相融。'
    ]
  },
  {
    date: '2026-07-18',
    title: '视觉风格精细调优：清透雪原与柔和暖阳（Bad North 风格）',
    items: [
      '暖冷平衡调优：微调了夕阳的饱和度（降低过度的橙色滤镜感），主光源调整为柔和暖色，环境光和背光面阴影保持冷灰蓝色，完美保留阳光与雪地的冷暖对比，同时让画面更加清透自然。',
      '冰雪质感优化：优化了雪地的反光色彩，使受光面呈现更为明亮的暖白，背光面呈现通透的冷蓝灰，彻底去除了类似冰面的深蓝色调，还原松软明亮的积雪感。',
      '岩壁色彩微调：修正了岩石在夕阳下的反射色，从强烈的橙色反射调整为轻微的暖色反光，确保岩石基础维持天然冷灰色调，杜绝“橙色岩石”的失真感。',
      '自然踏痕雪路：进一步降低道路与雪地的色差，让路径完美融合入白雪中，呈现极其柔和的、仅由于长年踩踏而形成的冰雪压痕质感。'
    ]
  },
  {
    date: '2026-07-18',
    title: '雪国大地图视觉质感重塑：光影、岩壁与林木有机交融',
    items: [
      '不规则天然岩壁：为悬崖峭壁（Cylinder基底）增加了不规则多段水平岩层 (Strata) 与倾斜斜切面，大幅减少人工切割感，呈现大气、拙朴 of Low-Poly 大形体轮廓。',
      '全动态实时冷暖光影：摒弃了硬编码的静态顶点颜色光照烘焙，将雪地完全接入 Three.js 实时标准光照管线（MeshStandardMaterial FlatShading），利用太阳光与半球光的颜色混合机制，完美呈现受光面暖白折射与背光面冷灰蓝的立体色温差，同时完美支持 [F4] 调参面板和实时光影滑块，让环境随心而变。',
      '森林生态有机分布：重构了林地噪点算法，移除整齐划一的网格块化排列，使树木呈现更平滑的随机丛聚 distribution；加入了极具生命力的高度尺寸变化，并且使树木根部根据自身尺度稍微下埋（-0.06 * height），完美契合坡度，杜绝了悬空感，彻底融入地貌。'
    ]
  },
  {
    date: '2026-07-18',
    title: '默认环境光遮蔽强度微调：超轻量柔和质感',
    items: [
      '更静谧纯净的画面表现：将默认环境遮蔽强度 (aoIntensity) 微调至极轻量的 `0.01`，遮蔽尺度 (aoScale) 保持稳定的 `2.60`。',
      '无暇雪原细节：使凹缝和夹角处的阴影表现更加丝滑、细腻、自然，彻底消除厚重感，保留最纯粹极简的雪国风貌。'
    ]
  },
  {
    date: '2026-07-18',
    title: 'AO 默认渲染参数微调：画面极简通透与立体感完美平衡',
    items: [
      '更通透优雅的默认预设：根据测试反馈，将默认环境遮蔽强度 (aoIntensity) 细调至极佳的 `0.02`，遮蔽尺度 (aoScale) 设定为稳定温和的 `2.60`。',
      '无瑕雪原细节：在维持极其干净纯白的 Low Poly 雪原视觉基底的前提下，保证了只有凹缝及接缝处隐约浮现柔和自然的立体阴影，质感更臻完美。'
    ]
  },
  {
    date: '2026-07-18',
    title: '后处理环境光遮蔽 (AO) 渲染优化：彻底解决发白/白边问题',
    items: [
      '彻底消除遮蔽发白与边界白边 (White Halos)：修复了由于 `saoScale` 尺度过大（14.0）导致的数值溢出 (NaN/Infinity) 现象，将遮蔽尺度默认限制在稳定的 `1.0` 范围内，配合全新的 `aoBias` 遮蔽偏移，使 AO 阴影表现自然稳定，杜绝任何边缘发白。',
      '新增「遮蔽偏移 (aoBias)」控制：在渲染调优控制面板（☼ 按钮）中，新增了「遮蔽偏移」滑块（默认 0.08），并优化了「遮蔽尺度」的调节范围（0.1 ~ 10.0），支持精细化的微小折皱阴影微调。'
    ]
  },
  {
    date: '2026-07-17',
    title: '立体光影质感重塑：加入屏幕空间环境光遮蔽 (AO) 效果',
    items: [
      '全新屏幕空间环境光遮蔽 (AO)：集成了基于 EffectComposer 与 SAOPass 的专业级屏幕后处理环境光遮蔽渲染。',
      '极简 Low Poly 形体阴影自阴影：通过在物体接触缝隙、山峦山谷洼地、兵营墙角和单位模型的交界处渲染柔和的微阴影（Micro-shadows），使纯白的雪地地貌瞬间拥有立体感和深度感，Low Poly 的棱角更加分明。',
      '无缝集成与调参面板：在「渲染调参」面板（☼ 按钮）中新增了「环境遮蔽 (AO)」专属调节模块，支持玩家在游戏内实时调整遮蔽强度（aoIntensity）、遮蔽尺度（aoScale）与采样半径（aoKernelRadius）。'
    ]
  },
  {
    date: '2026-07-17',
    title: '雪原生态纯净化：彻底移除所有植被与草皮',
    items: [
      '极简纯白雪原：应玩家要求，彻底移除了所有草皮、草丛、杂乱的3D立面折叶草以及所有的低矮植被色块。',
      '无瑕极简风貌：恢复了最纯粹的极简 Low Poly 冰雪地貌，保留纯白广袤的雪原、骨感的高耸松树、嶙峋的冬日山岩与波光粼粼的蔚蓝冰湖。',
      '清爽的战术视野：移除了地表的所有高频噪点与绿色斑块，现在玩家在进行战斗排兵布阵、卡牌施法时能享受到最干净、无杂质的纯净雪地战术体验。'
    ]
  },
  {
    date: '2026-07-17',
    title: '自然风貌与地貌细节重塑：告别规则棋子石',
    items: [
      '全面清除「围棋子」扁石：针对玩家反馈的中央平原与护盾祭坛周边存在生硬、扁平、类似围棋子的椭圆（Icosahedron/Dodecahedron）石头模型进行了彻底的重塑。现已将所有乱石和装饰石堆替换为全新高精度、立体的低多边形山岩，让地貌形态更加骨感、自然。',
      '全新山岩风格一体化：中央平原、大石群、山脚碎石、地标巨石及路边标记，均统一采用具备柱状节理切角的 Low Poly 迷你雪山体。雪盖与岩体相得益彰，形态苍劲有力。',
      '自然站立姿态与精确沉降：消除了原有的随机翻转与生硬方向，使所有地表岩石保持朝上直立状态并获得 5-6% 尺寸的物理沉降下沉，与白雪皑皑的地表自然融合。',
      '有机非平面悬崖与林带：优化了所有 Low Poly 崖面雪盖。在边缘加入自然的断裂、崩塌凹陷与不规则轮廓，打破了机械对称性。'
    ]
  },
  {
    date: '2026-07-17',
    title: '山顶生态优化：去除树木突出雪山之美',
    items: [
      '去除了山顶树木：根据玩家反馈，完全移除了山顶生成的松树，使白雪皑皑的山峦顶部更加干净挺拔、更具林海雪原的纯净冷峻美，仅保留偶有散落的乱石和低矮小屋，营造苍茫的史诗感。'
    ]
  },
  {
    date: '2026-07-17',
    title: '山顶生态修复：精准树高与散落随机化',
    items: [
      '消除树木半埋：由于之前固定的高比例截断，山顶的松树与房屋等装饰经常有约一半埋入山体雪盖下。现在使用最新的数学三维倾斜曲面重构算法，动态计算倾斜圆台顶面的精确世界 Y 轴高度，彻底消除树木埋入山体的穿模 Bug。',
      '山顶散落随机化：移除了之前山顶树木和石块局限在狭窄正中央的死板设定，将散落系数（decoSpread）大幅提升至 0.58，使其能够非常自然地铺展在整个白雪皑皑的山峦顶部。'
    ]
  },
  {
    date: '2026-07-17',
    title: '林木布局重构：林随山走，消除重叠',
    items: [
      '林随山走，环抱生成：重构了树林生成算法。现在松树林在生成时，如果随机点落在山体中心内，会被物理算法圆滑推移至山体外的「山脚怀抱带」（hill foothills belt）。这使得繁密的松树群能够自动围绕并环抱山体生成，视觉效果极佳。',
      '消除树山穿模重叠：加入了严苛的重叠退避和范围剔除检测，彻底根除了之前大量树木与悬崖峭壁、大山体中心生硬重合穿模、悬空嵌入的视觉毛刺。',
      '林间疏密有致：在山脚怀抱带，树林拥有极高且自然的保留率（约 90%）以突出山峦边界；而在远离山峦的主野，树林保持原有的随机稀疏点缀，完美兼顾了生态的自然随机美与宏观的地貌骨架。'
    ]
  },
  {
    date: '2026-07-17',
    title: '不规则凸多面体山体优化',
    items: [
      '经典低多边形山体细节：将悬崖山体圆台侧面数调整为合理的 6 至 8 边。这一改动让山体在视觉上既不显得过于圆润（避免了偏圆柱体的圆滑感），也不显得过于死板方正（避免了四角或五角的单一刻板感），呈现出最完美的高品质低多边形（Low Poly）折线雕塑感。',
      '有机随机凸多边形：采用更平缓的 0.88 ~ 1.12 径向顶点偏移，去除了尖锐的星形凹凸，使山体保持完美的自然凸多边形粗粝感。',
      '消除生硬六角雪盖：将边缘过渡小岩石、小雪堆和山顶乱石的几何结构从正十二面体（Dodecahedron）升级为细分的二十面体（Icosahedron），完全解决这些装饰物被压扁时产生生硬扁平六角突起或星形突起的视觉 Bug。'
    ]
  },
  {
    date: '2026-07-17',
    title: '悬崖碰撞消除与手机端阴影开启',
    items: [
      '消除岩石重叠：现在游戏场景内的自然散落岩石、巨石堆和地标岩石会智能避开悬崖群（hillZones）的位置，防止它们与山体错综重叠或悬空嵌入，显著提升整体山貌品质。',
      '解决奇怪六角凸起：修正了由于场景岩石与左边矮山重叠，导致其积雪覆顶突出呈现为六角凸起形的不自然现象。',
      '开启手机端阴影：默认在手机端等移动设备上开启实时动态阴影（Realtime Shadows），使移动端的微缩雪地模型层次感和质感更上一层楼。',
      '形态微调与林木丰富：将悬崖圆台由圆形回归多边形折线不规则表面，山顶覆雪更加自然，并保留了茂密山顶雪松林的生态细节。'
    ]
  },
  {
    date: '2026-07-17',
    title: '悬崖细节微调：积雪厚度与颜色同步',
    items: [
      '积雪色彩统一：修正了悬崖顶部积雪和环境雪地颜色不一致的问题，现在山顶积雪的白色和地面积雪完全一致，更加自然。',
      '厚度回调：在之前“极薄”的基础上稍微增加了一点点厚度，使其具备一定的雪层体积感，同时又不至于造成高光错觉。'
    ]
  },
  {
    date: '2026-07-17',
    title: '悬崖高度拉伸与积雪优化',
    items: [
      '高度拉伸：增加了所有岩石群落的核心高度，使其在视觉上更加挺拔高大。',
      '极薄积雪：修复了岩石顶部的积雪厚度，因为过厚的积雪在光照下容易像金属高光。现在将其压为极薄的一层，既保留了积雪质感，又避免了反光错觉。'
    ]
  },
  {
    date: '2026-07-17',
    title: '悬崖形态中和折中：兼具大形与群落层次',
    items: [
      '体积中和：缩小了原本过于巨大的单体岩壁，并将其分解为中大型岩柱的错落群落，保持了山体的体积感，又恢复了原本碎块设计的层次丰富度。',
      '重构高度与分布：核心山峰较高且宽阔，侧面和边缘的过渡平台逐渐变矮，形成具有主次关系的陡峭岛屿轮廓。',
      '顶端植被与结构：大块岩石顶端依旧保留雪顶与植被群，悬崖整体继续保持 Bad North 的竖直峭壁质感与多边形切面。'
    ]
  },
  {
    date: '2026-07-17',
    title: '悬崖形态大形化：Bad North 风格巨型岛屿岩壁',
    items: [
      '合并零碎悬崖：大幅减少了悬崖模块的数量，将原本分散的碎片化小台阶合并为少数几个巨型、高耸的岩石主体。',
      '增强山体轮廓：悬崖不再由许多小圆柱拼接，而是由 1~3 个粗壮的岩壁模块紧密结合，形成拥有清晰顶部平台的独立山体，远处看过去大形明确、轮廓鲜明。',
      '微调生态点缀：配合巨型平顶台阶，调整了山顶积雪、树木与少量房屋的点缀比例，确保风格更贴近简洁唯美的 Low Poly 岛屿感。'
    ]
  },
  {
    date: '2026-07-17',
    title: '全图自然风貌调优：悬崖、点缀与树林聚落',
    items: [
      '回归垂直峭壁：移除了过度倾斜的坡度，悬崖重新恢复为笔直险峻的垂直岩壁，保持其宏伟感，同时大幅减少了顶部的平铺面积。',
      '悬崖自然断裂与重叠：摒弃了单个大圆柱的死板几何轮廓，改由 2-4 个粗细、高度略微错落的岩柱交错组合而成，形成了自然的断层缺口与凹凸边缘，彻底去除了“人工阶梯”感。',
      '山顶生态繁荣：大幅增加了山顶的树木数量（1~3棵）、小岩石群以及偶尔出现的孤立小屋，避免了山顶变成一片光秃秃的纯白空地。',
      '中央谷地点缀：在主干道周边、开阔的雪地中散落了少量的小石块与积雪鼓包，打破了中央区域“纯平地板”的单调感，使战场更加丰富写实。',
      '树林自然簇拥：重构了树林的生成算法，引入了基于噪声的聚落算法。树木不再是均匀、整齐地排列，而是形成了“内部密集、边缘稀疏”的自然丛林，偶尔还有空地留白，整体形态更加野性。'
    ]
  },
  {
    date: '2026-07-17',
    title: '悬崖形态自然化：削减平顶台阶感',
    items: [
      '尖峰状轮廓：大幅缩小了岩石柱顶部的半径比例，悬崖不再像扁平的人工阶梯或圆桌，而是呈现出上窄下宽的山峰或断崖形态。',
      '消除堆叠层级：将原有的高度相似的双柱堆叠，改为“单主峰 + 极矮基岩”的组合，彻底打破了以往阶梯堆叠的生硬感，使每一座山峰都更加独立和自然。',
      '整体倾斜与重心调整：赋予了整个山峰更大幅度的自然倾斜（同时加深了底部在雪地里的埋深），岩壁切面有了更加狂野的朝向，还原了受风雪侵蚀的自然地貌，彻底告别了“规则圆柱台地”的违和感。',
      '收缩山顶生态：随着山顶变窄，山顶的树木和雪地小屋的生成范围同步收紧，使它们能够合理地矗立在险峻的断崖之巅。'
    ]
  },
  {
    date: '2026-07-17',
    title: '悬崖生成技术文档归档',
    items: [
      '新增架构文档：编写了 docs/TERRAIN_GENERATION.md，详细记录了《Bad North》风格的极简 Low Poly 悬崖生成方案。',
      '规范了三大核心技术：基础大块面几何拉伸、基于线性插值的无缝积雪贴合（彻底解决穿模与外翻）、以及基于分区的高度控制与顶部生态收拢。'
    ]
  },
  {
    date: '2026-07-17',
    title: '悬崖积雪完美贴合：解决模型穿模与帽子外翻',
    items: [
      '顶点几何完美堆叠：彻底重构了岩壁与顶部积雪的生成逻辑。现在岩石和雪顶由两个高度完美衔接且半径严密对应（基于高度线性插值）的几何体构成，彻底消除了任何模型穿插和接缝漏光。',
      '平滑雪面延伸：雪顶与下方的岩壁共享完全一致的面数与底部半径，实现了自然、平滑的体积过渡。积雪不再像一个生硬盖在上面的“外翻帽子”，而是呈现出真正积雪覆盖岩石的体感。',
      '保留陡峭轮廓：在修复了所有渲染瑕疵的同时，完整保留了此前优化的巨大垂直切面与陡峭的岛屿悬崖轮廓。'
    ]
  },
  {
    date: '2026-07-17',
    title: '重构地形与光影：还原《Bad North》美学特征',
    items: [
      '回归平坦地形：取消了夸张的山谷起伏，恢复了中央平缓的战斗区域。',
      '岛屿悬崖结构：在地图边缘与道路两侧放置了大尺度的 Low Poly 块面岩石，形成真正的“海岛悬崖”包围感。',
      'Golden Hour 光照：采用低角度暖橙色夕阳直射光，配合浅蓝色天空环境光与暖灰地面反射光，塑造强烈的冷暖色彩对比。',
      '统一植被色调：将松树调整为低饱和冷青色，树干融入夕阳暖色，去除细碎色彩变化，增强插画感。'
    ]
  },
  {
    date: '2026-07-16',
    title: '视觉风格重置：绝境北地风 (Bad North Style) 阶段一',
    items: [
      '色调调整：恢复了恰到好处的饱和度，森林与雪地现在呈现柔和清新的粉蓝、浅青色调，摆脱了灰暗感。',
      '材质优化：松树树冠改为温柔的冷杉色，木材与屋顶添加了暖灰色，提升了色彩呼吸感。',
      '环境氛围增强：在低地添加了体积雾，增加场景空气感与纵深感。',
      '植被丰富：增加了大面积的低性能消耗白色柔软草地，使地面不再单调干瘪。',
      '光照调整：开启实时物理阴影，并强化高曝光的 ACES Filmic 映射，光影更生动。'
    ]
  },
  {
    date: '2026-07-13',
    title: '联机大厅体验与创房稳定性',
    items: [
      '创建房间不再混放房间号输入；房间号仅用于加入好友房间。',
      '双方都准备后自动开局，去掉「开始合作」按钮。',
      '修复空槽位导致中继崩溃、以及创房失败却看不到提示的问题。'
    ]
  },
  {
    date: '2026-07-13',
    title: '双人合作：能力与军需铺分玩家、无归属击杀共享奖励',
    items: [
      '合作模式下能力卡、队伍升级、军需铺状态按玩家各自独立，互不影响。',
      '有归属击杀的能量与银币归击杀者；基地等无归属击杀时双方各得 1 能量与足额银币。',
      '联机 Client 会同步自己的能力图标状态。'
    ]
  },
  {
    date: '2026-07-13',
    title: '平衡调整与地形牌拖拽修复',
    items: [
      '塔盾兵攻击力调整为 5。',
      'Boss 最大生命值降低 30%；Boss 护盾上限校正为最大生命值的 50%。',
      '箭塔、维修站、食堂、信标建成时间减半为 15 秒，卡牌说明已同步。',
      '地形牌手牌冷却时间调整为 22 秒。',
      '修复地形牌与长说明卡牌（如矮人工匠）上滑时被浏览器当成滚动，导致未松手就误进冷却的问题。',
      '手机端拖拽提示位置改为贴在能量条上方，随 Ui 缩放联动。'
    ]
  },
  {
    date: '2026-07-13',
    title: '移动端 UI、地形卡与祭坛能力',
    items: [
      '手机端 Ui缩放默认 60%，可在 40% / 60% / 80% 三档切换；右侧栏新增竖屏按钮，横屏时工具栏保持显示。',
      '能量条位置跟随手牌缩放后的高度，波次预览、军需铺与波次奖励弹层接入 Ui缩放。',
      '手机端波次预告改为顶部仅显示 3 个节点，并压缩节点尺寸避免溢出。',
      '附魔卡移除冷却限制；地形卡（陨石、毒雾、白烟、瘟疫）改为 0 费，使用后留牌并进入 22 秒冷却，仅主动下滑弃牌才会进入弃牌堆。',
      '军需铺不再出售能力卡；祭坛首次占领触发能力三选一，重复占领无效。',
      '铁壁前线护甲阈值下调为 7；单关难度增长改为先慢后快，便于前期发育。'
    ]
  },
  {
    date: '2026-07-13',
    title: '军需铺、格挡与手机操作',
    items: [
      '军需铺复制、移除、升级改为只能从已有牌组选择；复制卡牌优先放入手牌空位。',
      '修复格挡不再消耗耐久的问题；F6 测试模式仅基地结构免耐久，单位攻击与格挡正常结算。',
      'F6 测试模式：基地无敌、基地防御 999 攻，Z / X / C 调整游戏速度。',
      '首关 Boss 改为冰霜巨魔；初始牌组加入能力牌，出战牌组上限调整为 36 张。',
      '卡牌拖拽松手距起点不足 24px 时取消出牌；弃牌固定消耗 1 能量。',
      '波次奖励与军需铺在手机竖屏下整体缩放；左侧命令栏新增框选按钮，框选空区域会取消选中。'
    ]
  },
  {
    date: '2026-07-12',
    title: '卡牌成长与基地修复',
    items: [
      '单位卡升级现在会提高召唤单位全属性，每级 +25%，通过属性修改器与兵种训练叠加。',
      '全队属性训练统一走修改器叠加，生命与武器耐久变化会同步当前比例。',
      '修复基地结构耐久归零会立刻判负的问题：耐久耗尽仅停火，可继续维修恢复。',
      '主菜单新增附魔百科，可查阅全部附魔效果与获取方式。'
    ]
  },
  {
    date: '2026-07-12',
    title: '战斗节奏与敌军附魔',
    items: [
      '原构筑核心全部转为能力牌，Boss 波奖励恢复为免费军需铺。',
      '集群波敌军固定携带集群附魔；波次 1–6 / 7–13 / 14–21 分别携带 1 / 2 / 3 个附魔。',
      '精英生命与护盾倍率下调；雪谷精英池加入雪暮萨满（霜爆 AOE + 冰缚）。',
      '军需铺支持升级、复制、移除卡牌；波次奖励可花银币重随或放弃。'
    ]
  },
  {
    date: '2026-07-07',
    title: '局外卡牌界面收敛',
    items: [
      '牌库、商店和升级页的卡牌改为更轻的半透明牌面，降低实心深色面板和发光描边。',
      '卡面插画区域放大，描述区去掉深色盒子，为后续卡面美术调整预留空间。',
      '出战牌组已加入状态改为卡面状态章，底部按钮降权为加入或移出操作。',
      '基础单位卡试接入 AI 生成的低多边形横向卡面，用于验证卡面美术方向。'
    ]
  },
  {
    date: '2026-07-07',
    title: '赤岩沙漠峡谷化',
    items: [
      '第三关地面增加轻微沙丘起伏，低处偏浅沙色，高处偏黄橙色。',
      '四周新增超宽层叠峡谷石柱作为山体遮挡，保留原有基础石柱布局。',
      '场景内补充更多碎石、仙人掌和沙漠灌木装饰。'
    ]
  },
  {
    date: '2026-07-07',
    title: '雪原场景重构',
    items: [
      '默认雪原重构为不对称海中雪岛，扩大海面、浮冰、冰湾和不规则海岸轮廓。',
      '主路改为更自然的 S 形压实雪路，重新组织左右林带、开阔雪地、冰湖、岩体和后景村落层次。',
      '枯草改为成簇放置，后景房屋扩大并形成村落群，减少随机散点和块状森林感。',
      '海岸悬崖改为交错石柱崖壁，统一干净石色光照，减少裂缝、水色渗入和过高石柱。'
    ]
  },
  {
    date: '2026-07-07',
    title: '触屏操作与奖励修复',
    items: [
      '雪原关卡相机距离恢复为标准关卡距离。',
      '修复手机端框选单位后点击地面偶尔不下达移动命令的问题。',
      '修复手机端波次奖励按钮偶尔无法进入二段选择界面的问题。'
    ]
  },
  {
    date: '2026-07-06',
    title: '三选一卡牌布局贴合',
    items: [
      '三选一弹窗宽度改为贴合三张候选卡的实际占用空间，减少左右空白。',
      '候选卡的卡面图片横向铺满卡牌宽度，强化卡牌感。'
    ]
  },
  {
    date: '2026-07-06',
    title: '三选一卡牌宽度调整',
    items: [
      '开局选牌和波次奖励的三选一卡牌改为固定卡牌宽度，并在弹窗中居中排列。',
      '窄屏仍保持单列信息卡布局，避免手机端内容拥挤。'
    ]
  },
  {
    date: '2026-07-06',
    title: '局外卡牌视觉收敛',
    items: [
      '商店、牌组和升级页面的卡牌改为低饱和深色面板，减少整张卡牌铺色带来的刺眼感。',
      '卡牌类型颜色保留在符文、细边和插画底色上，让卡牌界面更贴近当前局外 UI。'
    ]
  },
  {
    date: '2026-07-06',
    title: '主菜单版式微调',
    items: [
      '移除主菜单标题和按钮后方的大背景面板，让入口直接浮在雪原背景上。',
      '测试版本文字固定到屏幕底部，避免挤在主菜单按钮区域里。'
    ]
  },
  {
    date: '2026-07-06',
    title: '牌组开始修复',
    items: [
      '出战牌组数量恢复为 30 张，修复选择牌组后开始关卡被错误数量校验挡住的问题。',
      '初始牌组恢复为 30 张，并保留蛮兵、弓兵及多类型卡牌组合。',
      '旧存档里不足 30 张的默认出战牌组会在加载时重置为完整初始牌组。'
    ]
  },
  {
    date: '2026-07-06',
    title: '恢复普通 UI 风格',
    items: [
      '移除生图切片接入的按钮、面板和装饰素材，界面回到普通 CSS 风格。',
      '保留主菜单、选关、商店、玩法说明和更新日志的独立页面结构。'
    ]
  },
  {
    date: '2026-07-06',
    title: '主菜单结构调整',
    items: [
      '新增独立主菜单入口，选关、商店、玩法说明、更新日志改为独立页面。',
      '主菜单底部增加测试版本标识，后续更新需要同步补充更新日志。',
      '保留当前局外 UI 的游戏化硬边风格，并修正选关与商店混在同一导航中的问题。'
    ]
  }
];

export class MetaGameSystem {
  constructor({ onStartLevel, onStartDebug = null, onStartAnimationPreview = null, onOpenCoop = null }) {
    this.onStartLevel = onStartLevel;
    this.onStartDebug = onStartDebug;
    this.onStartAnimationPreview = onStartAnimationPreview;
    this.onOpenCoop = onOpenCoop;
    this.progress = loadProgress();
    this.view = 'menu';
    this.selectedLevelId = this.progress.preferences.selectedLevelId;
    this.selectedDifficulty = this.selectedDifficultyForLevel(this.selectedLevelId);
    this.deckSelection = this.progress.preferences.deckSelection.slice(0, DECK_SIZE);
    this.lastResult = null;
    this.notice = null;
    this.noticeTimer = null;
    this.root = createMetaRoot();
    this.onDebugKeyDown = (event) => this.handleDebugKeyDown(event);
    this.root.addEventListener('click', (event) => this.onClick(event));
    this.root.addEventListener('pointerdown', stopMetaEvent);
    this.root.addEventListener('contextmenu', stopMetaEvent);
    document.addEventListener('keydown', this.onDebugKeyDown);
    this.show('menu');
  }

  show(view = this.view, options = {}) {
    if (!options.keepNotice && view !== this.view) {
      this.clearNotice();
    }
    this.view = view;
    this.root.hidden = false;
    document.body.classList.add('is-meta-open');
    this.render(options);
  }

  hide() {
    this.root.hidden = true;
    document.body.classList.remove('is-meta-open');
  }

  completeLevel(result) {
    const reward = result.victory ? this.calculateReward(result) : 0;
    if (result.victory) {
      const levelId = result.session.level.id;
      const currentDifficulty = this.availableDifficulty(levelId);
      const nextDifficulty = Math.min(
        MAX_LEVEL_DIFFICULTY,
        clampDifficulty(result.session.difficulty) + 1
      );
      this.progress.levelDifficulties[levelId] = Math.max(
        currentDifficulty,
        nextDifficulty
      );
      this.progress.coins += reward;
      saveProgress(this.progress);
    }

    this.lastResult = {
      ...result,
      reward,
      nextDifficulty: this.progress.levelDifficulties[result.session.level.id] ?? 1
    };
    this.show('result');
  }

  clearSaveData() {
    const confirmed = window.confirm(
      '确定要清除本地存档吗？\n\n将重置金币、卡牌、升级、解锁难度和牌组选择，此操作不可撤销。'
    );
    if (!confirmed) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Local storage can fail in private contexts.
    }
    this.progress = loadProgress();
    this.selectedLevelId = this.progress.preferences.selectedLevelId;
    this.selectedDifficulty = this.selectedDifficultyForLevel(this.selectedLevelId);
    this.deckSelection = this.progress.preferences.deckSelection.slice(0, DECK_SIZE);
    this.lastResult = null;
    this.setNotice('本地存档已清除，已恢复为初始进度。');
    this.show('menu', { keepNotice: true });
  }

  calculateReward(result) {
    const level = result.session.level;
    const difficulty = Math.max(1, result.session.difficulty);
    const targetTime = Math.max(30, level.targetTime ?? 180);
    const speedBonus = Math.max(0, (targetTime - result.elapsedTime) / targetTime);
    const speedMultiplier = 1 + Math.min(0.6, speedBonus * 0.6);
    const difficultyMultiplier = 1 + (difficulty - 1) * 0.45;
    const abilityMultiplier = Math.max(0, result.rewardMultiplier ?? 1);
    return Math.max(1, Math.round(
      level.baseReward * difficultyMultiplier * speedMultiplier * abilityMultiplier
    ));
  }

  onClick(event) {
    const actionTarget = event.target.closest('[data-action]');
    if (!actionTarget) return;
    event.preventDefault();
    const { action } = actionTarget.dataset;

    if (action === 'menu') {
      this.show('menu');
      return;
    }
    if (action === 'levels') {
      this.show('levels');
      return;
    }
    if (action === 'coop') {
      this.onOpenCoop?.();
      return;
    }
    if (action === 'shop') {
      this.show('shop');
      return;
    }
    if (action === 'upgrades') {
      this.show('upgrades');
      return;
    }
    if (action === 'guide') {
      this.show('guide');
      return;
    }
    if (action === 'changelog') {
      this.show('changelog');
      return;
    }
    if (action === 'encyclopedia') {
      this.show('encyclopedia');
      return;
    }
    if (action === 'clear-save') {
      this.clearSaveData();
      return;
    }
    if (action === 'debug-scene') {
      this.enterDebugScene();
      return;
    }
    if (action === 'animation-preview') {
      this.enterAnimationPreview();
      return;
    }
    if (action === 'select-level') {
      this.persistPreferences();
      this.selectedLevelId = actionTarget.dataset.levelId;
      this.selectedDifficulty = this.selectedDifficultyForLevel(this.selectedLevelId);
      this.persistPreferences();
      this.show('levels');
      return;
    }
    if (action === 'select-difficulty') {
      const difficulty = clampDifficulty(actionTarget.dataset.difficulty);
      if (difficulty <= this.availableDifficulty(this.selectedLevelId)) {
        this.selectedDifficulty = difficulty;
        this.persistPreferences();
      }
      this.show('levels');
      return;
    }
    if (action === 'deck') {
      this.ensureDeckSelection();
      this.persistPreferences();
      this.show('deck');
      return;
    }
    if (action === 'toggle-deck-card') {
      this.toggleDeckCard(actionTarget.dataset.cardId);
      this.show('deck', { preserveScroll: true });
      return;
    }
    if (action === 'start-level') {
      this.startLevel();
      return;
    }
    if (action === 'buy-card') {
      this.buyCard(actionTarget.dataset.cardId);
      return;
    }
    if (action === 'upgrade-card') {
      this.upgradeCard(actionTarget.dataset.cardId);
    }
  }

  handleDebugKeyDown(event) {
    if (event.repeat || isTextInputTarget(event.target)) return;
    if (event.code === 'F3' || event.key === 'F3') {
      event.preventDefault();
      event.stopPropagation();
      this.enterDebugScene();
      return;
    }
    if (event.code === 'F2' || event.key === 'F2') {
      event.preventDefault();
      event.stopPropagation();
      this.enterAnimationPreview();
      return;
    }
    const isDebugGoldKey = event.shiftKey && (
      event.code === 'KeyB' ||
      event.key?.toLowerCase() === 'b'
    );
    if (!isDebugGoldKey) return;
    event.preventDefault();
    event.stopPropagation();
    this.progress.coins += 1000;
    saveProgress(this.progress);
    this.render();
  }

  render(options = {}) {
    const scrollTop = options.preserveScroll ? this.root.scrollTop : 0;
    const viewScrollTop = options.preserveScroll
      ? this.root.querySelector('.meta-deck, .meta-layout, .meta-home, .meta-menu, .meta-page')?.scrollTop ?? 0
      : 0;
    const shellClass = `meta-shell ${this.view === 'menu' ? 'is-main-menu' : 'is-subpage'}`;
    this.root.innerHTML = `
      <div class="${shellClass}" role="dialog" aria-modal="true" aria-label="局外菜单">
        ${this.renderHeader()}
        ${this.renderNotice()}
        ${this.renderView()}
      </div>
    `;
    if (options.preserveScroll) {
      this.root.scrollTop = scrollTop;
      const restoreViewScroll = () => {
        const viewScroller = this.root.querySelector('.meta-deck, .meta-layout, .meta-home, .meta-menu, .meta-page');
        if (viewScroller) viewScroller.scrollTop = viewScrollTop;
      };
      restoreViewScroll();
      window.requestAnimationFrame(() => {
        this.root.scrollTop = scrollTop;
        restoreViewScroll();
      });
    }
  }

  enterDebugScene() {
    this.hide();
    this.onStartDebug?.();
  }

  enterAnimationPreview() {
    this.hide();
    this.onStartAnimationPreview?.();
  }

  renderHeader() {
    if (this.view === 'menu') return '';
    const currencyClass = `meta-currency${this.notice ? ' is-pulse' : ''}`;
    const pageTitle = pageTitleForView(this.view);
    return `
      <header class="meta-header">
        <div>
          <div class="meta-title">${pageTitle}</div>
          <div class="meta-subtitle">村落战争 / ${TEST_VERSION_LABEL}</div>
        </div>
        <button class="meta-back-button" type="button" data-action="menu">返回主菜单</button>
        <div class="${currencyClass}">
          <span>金币</span>
          <strong>${this.progress.coins}</strong>
        </div>
      </header>
    `;
  }

  renderNotice() {
    if (!this.notice) return '';
    return `
      <div class="meta-toast" role="status" aria-live="polite" data-notice-id="${this.notice.id}">
        ${this.notice.text}
      </div>
    `;
  }

  setNotice(text) {
    this.clearNotice({ render: false });
    this.notice = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      text
    };
    this.noticeTimer = window.setTimeout(() => {
      this.clearNotice();
    }, 2600);
  }

  clearNotice({ render = true } = {}) {
    if (this.noticeTimer) {
      window.clearTimeout(this.noticeTimer);
      this.noticeTimer = null;
    }
    if (!this.notice) return;
    this.notice = null;
    if (render && !this.root.hidden) {
      this.render({ preserveScroll: true });
    }
  }

  renderView() {
    if (this.view === 'menu') return this.renderMainMenu();
    if (this.view === 'levels') return this.renderLevels();
    if (this.view === 'deck') return this.renderDeckBuilder();
    if (this.view === 'shop') return this.renderShop();
    if (this.view === 'guide') return this.renderGuide();
    if (this.view === 'encyclopedia') return this.renderEnchantmentEncyclopedia();
    if (this.view === 'changelog') return this.renderChangelog();
    if (this.view === 'upgrades') return this.renderUpgrades();
    if (this.view === 'result') return this.renderResult();
    return this.renderMainMenu();
  }

  renderMainMenu() {
    return `
      <main class="med-meta-menu">
        <!-- Corner Delete Button -->
        <button class="med-btn-epic-danger-corner" type="button" data-action="clear-save" title="焚毁盟约 (清档)">
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
             <path d="M 3 6 L 21 6 M 8 6 L 8 4 Q 8 3 9 3 L 15 3 Q 16 3 16 4 L 16 6 M 10 11 L 10 17 M 14 11 L 14 17 M 5 6 L 19 6 L 18 20 Q 18 21 17 21 L 7 21 Q 6 21 6 20 Z" />
          </svg>
        </button>

        <div class="med-menu-board-wrapper">
          <div class="med-menu-board">
            
            <!-- Background Illustration (Opacity 8%) -->
            

            <div class="med-menu-crest-group" style="position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                <!-- Vertical Banner Behind Crest -->
                <!-- Horizontal Banner Behind Crest -->
                <!-- Horizontal Banner Behind Crest -->
                <div class="med-menu-horizontal-banner" style="position: absolute; top: 10px; width: 440px; height: 120px; z-index: -1;">
                    <svg viewBox="0 0 440 120" width="100%" height="100%" style="overflow: visible;">
                        <defs>
                            <filter id="fabricNoise" x="-20%" y="-20%" width="140%" height="140%">
                                <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="4" result="noise" />
                                <feColorMatrix type="matrix" values="1 0 0 0 0  0 0.9 0 0 0  0 0.8 0 0 0  0 0 0 0.5 0" in="noise" result="coloredNoise" />
                                <feBlend in="SourceGraphic" in2="coloredNoise" mode="multiply" result="blended" />
                                <feComposite in="blended" in2="SourceAlpha" operator="in" result="masked" />
                                <feDropShadow dx="0" dy="8" stdDeviation="6" flood-color="#000" flood-opacity="0.7"/>
                            </filter>
                            <linearGradient id="bannerShadows" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stop-color="#2a0808"/>
                                <stop offset="10%" stop-color="#5a1515"/>
                                <stop offset="30%" stop-color="#7a1c1c"/>
                                <stop offset="50%" stop-color="#4a0f0f"/> <!-- fold -->
                                <stop offset="70%" stop-color="#7a1c1c"/>
                                <stop offset="90%" stop-color="#5a1515"/>
                                <stop offset="100%" stop-color="#2a0808"/>
                            </linearGradient>
                            
                        </defs>
                        <!-- Banner Body -->
                        <path d="M 20 20 L 420 20 L 400 60 L 420 100 L 20 100 L 40 60 Z" fill="url(#bannerShadows)" filter="url(#fabricNoise)"/>
                        
                        <!-- Gold Embroidery / Stitching -->
                        <path d="M 32 28 L 408 28 L 392 60 L 408 92 L 32 92 L 48 60 Z" fill="none" stroke="#b08d45" stroke-width="2" stroke-dasharray="6 4" opacity="0.8"/>
                        <path d="M 38 34 L 402 34 L 385 60 L 402 86 L 38 86 L 55 60 Z" fill="none" stroke="#d4af37" stroke-width="1" opacity="0.5"/>
                        
                        <!-- Folds and Creases (Shadows/Highlights) -->
                        <path d="M 120 20 L 110 100 M 130 20 L 120 100" stroke="rgba(0,0,0,0.4)" stroke-width="3" fill="none"/>
                        <path d="M 320 20 L 330 100 M 310 20 L 320 100" stroke="rgba(0,0,0,0.4)" stroke-width="3" fill="none"/>
                        
                        <!-- Minor tears on edges -->
                        <path d="M 20 40 L 25 45 L 20 50 M 420 70 L 415 75 L 420 80 M 150 100 L 155 95 L 160 100" fill="none" stroke="#2a0808" stroke-width="1.5"/>
                    </svg>
                </div>
                
                
                
                <div class="med-menu-crest-new">
                   <svg viewBox="0 0 140 160" width="140" height="160" style="overflow: visible;">
                      <defs>
                         <!-- Forged Iron Texture -->
                         <filter id="ironBevel" x="-20%" y="-20%" width="140%" height="140%">
                            <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="4" result="noise"/>
                            <feColorMatrix type="matrix" values="0.2 0 0 0 0  0 0.2 0 0 0  0 0.2 0 0 0  0 0 0 1 0" in="noise" result="coloredNoise"/>
                            <feBlend in="SourceGraphic" in2="coloredNoise" mode="multiply" result="textured"/>
                            <feComposite in="textured" in2="SourceAlpha" operator="in" result="masked" />
                            <feDropShadow dx="0" dy="6" stdDeviation="4" flood-color="#000" flood-opacity="0.8"/>
                         </filter>
                         
                         <!-- Worn Gold Bevel -->
                         <filter id="goldBevel" x="-20%" y="-20%" width="140%" height="140%">
                            <feGaussianBlur in="SourceAlpha" stdDeviation="1.5" result="blur"/>
                            <feOffset dx="0" dy="2" result="offsetBlur"/>
                            <feSpecularLighting in="blur" surfaceScale="3" specularConstant="0.4" specularExponent="10" lighting-color="#eedd99" result="specOut">
                               <fePointLight x="50" y="-30" z="30"/>
                            </feSpecularLighting>
                            <feComposite in="specOut" in2="SourceAlpha" operator="in" result="specOut"/>
                            <feComposite in="SourceGraphic" in2="specOut" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="litPaint"/>
                            <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#000" flood-opacity="0.6"/>
                         </filter>

                         <linearGradient id="ironGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stop-color="#3a3a3a"/>
                            <stop offset="40%" stop-color="#1f1f1f"/>
                            <stop offset="60%" stop-color="#141414"/>
                            <stop offset="100%" stop-color="#050505"/>
                         </linearGradient>

                         <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stop-color="#e6c27a"/>
                            <stop offset="25%" stop-color="#b88f3b"/>
                            <stop offset="50%" stop-color="#8a611c"/>
                            <stop offset="75%" stop-color="#b88f3b"/>
                            <stop offset="100%" stop-color="#4a3103"/>
                         </linearGradient>
                      </defs>
                      <g>
                          <!-- Heavy Iron Shield Base -->
                          <path d="M 10 10 L 130 10 L 130 80 C 130 130, 70 150, 70 150 C 70 150, 10 130, 10 80 Z" fill="url(#ironGrad)" filter="url(#ironBevel)" />
                          
                          <!-- Outer Worn Gold Trim -->
                          <path d="M 15 15 L 125 15 L 125 78 C 125 120, 70 138, 70 138 C 70 138, 15 120, 15 78 Z" fill="none" stroke="url(#goldGrad)" stroke-width="6" stroke-linejoin="round" filter="url(#goldBevel)"/>
                          
                          <!-- Inner Iron Rivets -->
                          <circle cx="25" cy="25" r="2.5" fill="#111" filter="url(#goldBevel)"/>
                          <circle cx="115" cy="25" r="2.5" fill="#111" filter="url(#goldBevel)"/>
                          <circle cx="25" cy="75" r="2.5" fill="#111" filter="url(#goldBevel)"/>
                          <circle cx="115" cy="75" r="2.5" fill="#111" filter="url(#goldBevel)"/>
                          <circle cx="70" cy="125" r="2.5" fill="#111" filter="url(#goldBevel)"/>

                          <!-- Engraved Metal Patterns (Scratches/Lines) -->
                          <path d="M 30 40 L 50 20 M 110 40 L 90 20 M 50 100 L 70 120 M 90 100 L 70 120" stroke="rgba(0,0,0,0.5)" stroke-width="1.5" fill="none"/>
                          <path d="M 32 42 L 52 22 M 108 38 L 88 18 M 52 102 L 72 122 M 88 98 L 68 118" stroke="rgba(255,255,255,0.05)" stroke-width="1" fill="none"/>

                          <!-- Kingdom Symbol (Castle / Crown) -->
                          <path d="M 40 90 L 40 50 L 52 50 L 52 60 L 64 60 L 64 45 L 76 45 L 76 60 L 88 60 L 88 50 L 100 50 L 100 90 Z" fill="url(#goldGrad)" filter="url(#goldBevel)"/>
                          
                          <!-- Castle Details (Windows/Gate) -->
                          <path d="M 65 90 L 65 75 C 65 70, 75 70, 75 75 L 75 90 Z" fill="#111" filter="url(#ironBevel)"/>
                          <rect x="44" y="65" width="4" height="8" fill="#111" rx="2"/>
                          <rect x="92" y="65" width="4" height="8" fill="#111" rx="2"/>
                          
                          <!-- Sword crossing behind castle but inside shield -->
                          <path d="M 50 105 L 90 35 M 90 105 L 50 35" stroke="rgba(0,0,0,0.6)" stroke-width="4"/>
                          <path d="M 50 105 L 90 35 M 90 105 L 50 35" stroke="#777" stroke-width="2"/>
                      </g>
                   </svg>
                </div>

                
            </div>
            
            <div class="med-menu-title-container">
                <h1 class="med-menu-title-epic">VILLAGE WAR</h1>
                <h2 class="med-menu-subtitle-epic">凛 冬 之 战</h2>
            </div>
            <div class="med-menu-divider-epic">
                <!-- Golden decorative line -->
                <svg width="250" height="20" viewBox="0 0 250 20">
                    <path d="M 0 10 L 100 10 L 110 5 L 120 15 L 130 5 L 140 10 L 250 10" stroke="url(#metal-grad-v2)" stroke-width="2" fill="none" opacity="0.8"/>
                    <circle cx="125" cy="10" r="4" fill="#C29026" opacity="0.9"/>
                    <circle cx="0" cy="10" r="2" fill="#C29026"/>
                    <circle cx="250" cy="10" r="2" fill="#C29026"/>
                </svg>
            </div>
            
            <nav class="med-menu-nav" aria-label="主菜单">
              <!-- Embark as the only primary button -->
              <button class="med-btn-epic-primary" type="button" data-action="levels">
                  <!-- Metal Corners & Engraving -->
                  <svg class="btn-metal-corners" viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute; inset:0; width:100%; height:100%; pointer-events:none; border-radius: 4px;">
                      <!-- Golden Corners -->
                      <path d="M 0 15 L 0 0 L 15 0 M 85 0 L 100 0 L 100 15 M 100 85 L 100 100 L 85 100 M 15 100 L 0 100 L 0 85" fill="none" stroke="#F2D06B" stroke-width="4" filter="drop-shadow(0 2px 2px rgba(0,0,0,0.8))"/>
                      <!-- Crest Engraving Watermark -->
                      <path d="M 40 20 L 60 20 L 60 70 L 50 85 L 40 70 Z" fill="none" stroke="#000" stroke-width="1.5" opacity="0.15"/>
                  </svg>
                  <span class="btn-text-main">踏上征途</span> 
                  <span class="btn-text-sub">Embark</span>
              </button>
              <button class="med-btn-epic" type="button" data-action="coop">双人联机 <span>Co-op</span></button>
              <button class="med-btn-epic" type="button" data-action="shop">炼金工坊 <span>Workshop</span></button>
              <div class="med-menu-row">
                  <button class="med-btn-epic-small" type="button" data-action="guide">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; opacity: 0.7;"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg> 战术典籍
                  </button>
                  <button class="med-btn-epic-small" type="button" data-action="encyclopedia">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; opacity: 0.7;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> 附魔图鉴
                  </button>
                  <button class="med-btn-epic-small" type="button" data-action="changelog">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; opacity: 0.7;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> 王国纪要
                  </button>
              </div>
            </nav>
            <div class="med-version-mark">${TEST_VERSION_LABEL}</div>
          </div>
        </div>
      </main>
    `;
  }

  renderLevels() {
    const selectedLevel = this.selectedLevel();
    const availableDifficulty = this.availableDifficulty(selectedLevel.id);
    const selectedDifficulty = Math.min(
      clampDifficulty(this.selectedDifficulty),
      availableDifficulty
    );
    const baseDifficulty = Math.max(1, Math.floor(selectedLevel.baseDifficulty ?? 1));
    const maxWaves = Math.floor((selectedLevel.enemyDirector?.maxThreat ?? 10) / 2);

    return `
      <main class="med-map-book-container">
        <button class="book-back-btn" type="button" data-action="menu">← 撤回营帐</button>
        
        <div class="med-map-book">
          <!-- Leather binding in the middle -->
          <div class="med-book-binding"></div>
          
          <!-- Metal Corners -->
          <div class="med-corner top-left"></div>
          <div class="med-corner top-right"></div>
          <div class="med-corner bottom-left"></div>
          <div class="med-corner bottom-right"></div>

          <div class="med-book-page left-page">
            <h3 class="med-page-title">战役编年史</h3>
            <div class="med-chapter-list">
              ${LEVEL_DEFINITIONS.map((level) => {
                const unlockedDiff = this.availableDifficulty(level.id);
                const isSelected = level.id === selectedLevel.id;
                return `
                  <button class="med-chapter-plaque ${isSelected ? 'is-selected' : ''}" 
                          type="button" 
                          data-action="select-level" 
                          data-level-id="${level.id}">
                    <div class="plaque-nail left-nail"></div>
                    <div class="plaque-nail right-nail"></div>
                    <div class="plaque-content">
                        <span class="chapter-icon">${unlockedDiff >= MAX_LEVEL_DIFFICULTY ? '🚩' : '⚔️'}</span>
                        <div class="chapter-info">
                            <span class="chapter-name">${level.name}</span>
                            <span class="chapter-level">等级 ${unlockedDiff}</span>
                        </div>
                    </div>
                  </button>
                `;
              }).join('')}
            </div>
          </div>

          <div class="med-book-page right-page">
             <h2 class="med-region-title">${selectedLevel.name}</h2>
             <div class="med-region-illustration">
                <div class="med-region-map-placeholder">
                    🗺️
                </div>
             </div>
             <p class="med-region-desc">${selectedLevel.summary || selectedLevel.subtitle || '未知区域的战役。'}</p>
             
             <div class="med-region-stats">
                <div class="med-stat-box">
                    <span class="stat-label">基础环境难度</span>
                    <span class="stat-value">${baseDifficulty}</span>
                </div>
                <div class="med-stat-box">
                    <span class="stat-label">预计波次规模</span>
                    <span class="stat-value">${maxWaves} 波</span>
                </div>
             </div>
             
             <div class="med-difficulty-book-selector">
                <span class="diff-label">挑战刻度</span>
                <div class="diff-controls">
                    <button type="button" class="diff-btn" data-action="diff-down" ${selectedDifficulty <= 1 ? 'disabled' : ''}>◀</button>
                    <span class="diff-display">Lv.${selectedDifficulty}</span>
                    <button type="button" class="diff-btn" data-action="diff-up" ${selectedDifficulty >= availableDifficulty ? 'disabled' : ''}>▶</button>
                </div>
             </div>

             <button class="med-war-start-btn" type="button" data-action="start">
                <span class="btn-inner-text">吹响号角 / 开始战役</span>
             </button>
          </div>
        </div>
      </main>
    `;
  }

  renderDeckBuilder() {
    this.ensureDeckSelection();
    const selected = new Set(this.deckSelection);
    const selectedCount = this.deckSelection.length;
    return `
      <main class="meta-deck">
        <section class="meta-panel meta-deck-summary">
          <div>
            <div class="meta-section-title">出战牌组</div>
            <p>已选择 ${selectedCount}/${DECK_SIZE}。必须选择 ${DECK_SIZE} 张卡牌才能进入关卡。</p>
            <p class="meta-deck-note">能量不会自动恢复，战斗中靠击杀敌人充能。</p>
          </div>
          <button class="meta-primary-button" type="button" data-action="start-level" ${selectedCount === DECK_SIZE ? '' : 'disabled'}>
            开始关卡
          </button>
          <button class="meta-secondary-button" type="button" data-action="levels">返回选关</button>
        </section>
        <section class="meta-card-grid">
          ${this.progress.ownedCards.map((id) => {
            const card = this.cardWithLevel(id);
            const isSelected = selected.has(id);
            return this.renderMetaCard(card, {
              action: 'toggle-deck-card',
              stateText: isSelected ? '移出' : '加入',
              statusText: isSelected ? '已加入' : '',
              selected: isSelected,
              disabled: !isSelected && selectedCount >= DECK_SIZE
            });
          }).join('')}
        </section>
      </main>
    `;
  }

  renderShop() {
    const unowned = CARD_DEFINITIONS.filter((card) => (
      !card.lootOnly && !this.progress.ownedCards.includes(card.id)
    ));
    return `
      <main class="meta-deck">
        <section class="meta-panel">
          <div class="meta-section-title">卡牌商店</div>
          <p>购买后会进入局外卡牌库，并可加入 ${DECK_SIZE} 张出战牌组。</p>
          <button class="meta-secondary-button" type="button" data-action="upgrades">升级已有卡牌</button>
        </section>
        <section class="meta-card-grid">
          ${unowned.length ? unowned.map((card) => {
            const cost = CARD_META[card.id]?.buyCost ?? 80;
            return this.renderMetaCard({ ...card, level: 1 }, {
              action: 'buy-card',
              stateText: `购买 ${cost}`,
              disabled: this.progress.coins < cost
            });
          }).join('') : '<div class="meta-empty">商店已经清空。</div>'}
        </section>
      </main>
    `;
  }

  renderGuide() {
    return `
      <main class="meta-page meta-guide-page">
        <section class="meta-panel meta-guide-panel">
          <div class="meta-section-title">核心流程</div>
          <p>先在选关页面选择关卡和难度，再配置 ${DECK_SIZE} 张出战卡牌进入战斗。战斗中通过出牌、移动、驻守和三选一奖励推进基地。</p>
        </section>
        <section class="meta-guide-grid">
          <article class="meta-panel">
            <div class="meta-section-title">能量</div>
            <p>能量不会随时间恢复。击杀敌军、精英、Boss 和占领能量祭坛可获得能量，用于出牌与弃牌。</p>
          </article>
          <article class="meta-panel">
            <div class="meta-section-title">卡牌</div>
            <p>单位卡会召唤部队；能力、战术、建筑卡会提供即时效果或阵地支援。局内获得的临时卡通常不会带回局外牌库。</p>
          </article>
          <article class="meta-panel">
            <div class="meta-section-title">战斗</div>
            <p>率领部队持续推进，争夺祭坛、击败精英与 Boss，最终击破敌营。不同关卡会有地形、天气或敌营规则差异。</p>
          </article>
          <article class="meta-panel">
            <div class="meta-section-title">成长</div>
            <p>通关后获得金币并解锁更高难度。商店可购买新卡，也可以升级已拥有卡牌。</p>
          </article>
        </section>
      </main>
    `;
  }

  renderEnchantmentEncyclopedia() {
    const sections = buildEnchantmentEncyclopediaSections();
    return `
      <main class="meta-page meta-encyclopedia-page">
        <section class="meta-panel meta-encyclopedia-intro">
          <div class="meta-section-title">附魔百科</div>
          <p>附魔是挂在单位上的长期增益。同名附魔牌升级会叠加层数；敌军也会按波次携带多个附魔。</p>
          <p class="meta-encyclopedia-note">元素类效果（燃烧、中毒、流血等）在命中后单独结算，不走攻击力修改器。</p>
        </section>
        ${sections.map((section) => `
          <section class="meta-encyclopedia-section">
            <div class="meta-panel meta-encyclopedia-section-head">
              <div class="meta-section-title">${section.title}</div>
              <p>${section.description}</p>
            </div>
            <div class="meta-encyclopedia-grid">
              ${section.entries.map((entry) => `
                <article class="meta-panel meta-encyclopedia-entry" style="--enchant-accent:${entry.color}">
                  <div class="meta-encyclopedia-entry-head">
                    <span class="meta-encyclopedia-swatch" aria-hidden="true"></span>
                    <h2>${entry.name}</h2>
                  </div>
                  <p class="meta-encyclopedia-summary">${entry.summary}</p>
                  <div class="meta-encyclopedia-note">${entry.note}</div>
                </article>
              `).join('')}
            </div>
          </section>
        `).join('')}
      </main>
    `;
  }

  renderChangelog() {
    return `
      <main class="meta-page meta-changelog-page">
        <section class="meta-panel meta-changelog-intro">
          <div class="meta-section-title">更新日志</div>
          <p>之后每次功能、数值或界面更新，都在这里补一条记录，方便测试时回看变化。</p>
        </section>
        <section class="meta-changelog-list">
          ${CHANGELOG_ENTRIES.map((entry) => `
            <article class="meta-panel meta-changelog-entry">
              <div class="meta-changelog-date">${entry.date}</div>
              <h2>${entry.title}</h2>
              <ul>
                ${entry.items.map((item) => `<li>${item}</li>`).join('')}
              </ul>
            </article>
          `).join('')}
        </section>
      </main>
    `;
  }

  renderUpgrades() {
    return `
      <main class="meta-deck">
        <section class="meta-panel">
          <div class="meta-section-title">卡牌升级</div>
          <p>升级消耗金币翻倍，并提高卡牌基础等级。局内事件升级只在当局生效；附魔牌的局内升级会提高施加的附魔等级。</p>
        </section>
        <section class="meta-card-grid">
          ${this.progress.ownedCards.map((id) => {
            const card = this.cardWithLevel(id);
            const cost = upgradeCost(id, card.level);
            return this.renderMetaCard(card, {
              action: 'upgrade-card',
              stateText: `升级 ${cost}`,
              disabled: this.progress.coins < cost,
              footer: `<span>当前 Lv.${card.level}</span><span>下级费用 ${cost}</span>`
            });
          }).join('')}
        </section>
      </main>
    `;
  }

  renderResult() {
    const result = this.lastResult;
    if (!result) return this.renderLevels();
    const level = result.session.level;
    return `
      <main class="meta-home">
        <section class="meta-panel meta-result-panel">
          <div class="meta-panel-kicker">${result.victory ? '通关成功' : '关卡失败'}</div>
          <h1>${level.name} / 难度 ${result.session.difficulty}</h1>
          <div class="meta-result-grid">
            <span>用时 <strong>${formatTime(result.elapsedTime)}</strong></span>
            <span>应对威胁 <strong>${result.threat ?? result.wave ?? 0}</strong></span>
            <span>获得金币 <strong>${result.reward}</strong></span>
            <span>已解锁难度 <strong>${result.nextDifficulty}</strong></span>
          </div>
          <div class="meta-action-row">
            <button class="meta-primary-button" type="button" data-action="levels">继续选关</button>
            <button class="meta-secondary-button" type="button" data-action="shop">商店</button>
          </div>
        </section>
      </main>
    `;
  }

  renderMetaCard(card, options) {
    const disabled = options.disabled ? 'disabled' : '';
    const selected = options.selected ? ' is-selected' : '';
    const actionClass = options.action ? ` is-${options.action}` : '';
    const statusMarkup = options.statusText
      ? `<div class="meta-card-status">${options.statusText}</div>`
      : '';
    return `
      <article class="meta-card is-kind-${card.kind}${selected}" style="--card-color:${cardThemeColor(card)}">
        <div class="meta-card-cost">${cardEnergyCost(card)}</div>
        <div class="meta-card-level">Lv.${card.level ?? 1}</div>
        ${cardUseBarMarkup(card, 'meta-card-use-bar')}
        ${statusMarkup}
        <div class="meta-card-face">
          <div class="meta-card-header">
            <span class="meta-card-rune">${card.label}</span>
            <span>${kindLabel(card.kind)}</span>
          </div>
          ${createCardArtMarkup(card)}
          <strong>${card.name}</strong>
          <p>${card.summary}</p>
          ${options.footer ? `<div class="meta-card-footer">${options.footer}</div>` : ''}
        </div>
        <button
          class="meta-card-action${actionClass}"
          type="button"
          data-action="${options.action}"
          data-card-id="${card.id}"
          ${disabled}
        >
          ${options.stateText}
        </button>
      </article>
    `;
  }

  selectedLevel() {
    return LEVEL_DEFINITIONS.find((level) => level.id === this.selectedLevelId) ?? LEVEL_DEFINITIONS[0];
  }

  availableDifficulty(levelId) {
    return clampDifficulty(this.progress.levelDifficulties[levelId] ?? 1);
  }

  selectedDifficultyForLevel(levelId) {
    const saved = this.progress.preferences.selectedDifficulties?.[levelId] ?? 1;
    return Math.min(clampDifficulty(saved), this.availableDifficulty(levelId));
  }

  persistPreferences() {
    const selectedLevelId = normalizeLevelId(this.selectedLevelId);
    const selectedDifficulties = {
      ...(this.progress.preferences?.selectedDifficulties ?? {})
    };
    selectedDifficulties[selectedLevelId] = Math.min(
      clampDifficulty(this.selectedDifficulty),
      this.availableDifficulty(selectedLevelId)
    );
    LEVEL_DEFINITIONS.forEach((level) => {
      selectedDifficulties[level.id] = Math.min(
        clampDifficulty(selectedDifficulties[level.id] ?? 1),
        this.availableDifficulty(level.id)
      );
    });
    this.selectedLevelId = selectedLevelId;
    this.deckSelection = normalizeDeckSelection(this.deckSelection, this.progress.ownedCards, {
      defaultToOwned: false
    });
    this.progress.preferences = {
      selectedLevelId,
      selectedDifficulties,
      deckSelection: this.deckSelection.slice(0, DECK_SIZE)
    };
    saveProgress(this.progress);
  }

  cardWithLevel(id) {
    const definition = CARD_DEFINITIONS.find((card) => card.id === id) ?? CARD_DEFINITIONS[0];
    return {
      ...definition,
      level: Math.max(1, this.progress.cardLevels[id] ?? 1)
    };
  }

  ensureDeckSelection() {
    const previous = this.deckSelection.join('|');
    this.deckSelection = normalizeDeckSelection(this.deckSelection, this.progress.ownedCards, {
      defaultToOwned: false
    });
    if (this.deckSelection.join('|') !== previous) {
      this.persistPreferences();
    }
  }

  toggleDeckCard(id) {
    if (!this.progress.ownedCards.includes(id)) return;
    const index = this.deckSelection.indexOf(id);
    if (index >= 0) {
      this.deckSelection.splice(index, 1);
      this.persistPreferences();
      return;
    }
    if (this.deckSelection.length >= DECK_SIZE) return;
    this.deckSelection.push(id);
    this.persistPreferences();
  }

  buyCard(id) {
    if (this.progress.ownedCards.includes(id)) return;
    const card = CARD_DEFINITIONS.find((definition) => definition.id === id);
    const cost = CARD_META[id]?.buyCost ?? 80;
    if (this.progress.coins < cost) return;
    this.progress.coins -= cost;
    this.progress.ownedCards.push(id);
    this.progress.cardLevels[id] = Math.max(1, this.progress.cardLevels[id] ?? 1);
    this.setNotice(`已购买 ${card?.name ?? '卡牌'}`);
    saveProgress(this.progress);
    this.show('shop', { preserveScroll: true, keepNotice: true });
  }

  upgradeCard(id) {
    if (!this.progress.ownedCards.includes(id)) return;
    const level = Math.max(1, this.progress.cardLevels[id] ?? 1);
    const cost = upgradeCost(id, level);
    if (this.progress.coins < cost) return;
    this.progress.coins -= cost;
    this.progress.cardLevels[id] = level + 1;
    saveProgress(this.progress);
    this.show('upgrades', { preserveScroll: true });
  }

  startLevel() {
    this.ensureDeckSelection();
    if (this.deckSelection.length !== DECK_SIZE) {
      this.setNotice(`请选择 ${DECK_SIZE} 张卡牌后开始关卡`);
      this.show('deck', { preserveScroll: true, keepNotice: true });
      return;
    }
    const deckIds = this.deckSelection.slice(0, DECK_SIZE);
    const deck = deckIds.map((id, index) => {
      const card = this.cardWithLevel(id);
      return {
        ...card,
        instanceId: `${id}-${index}-${Date.now()}-${Math.random().toString(36).slice(2)}`
      };
    });
    if (!deck.some((card) => card.kind === 'summon')) {
      this.setNotice('出战牌组至少需要 1 张单位卡');
      this.show('deck', { preserveScroll: true, keepNotice: true });
      return;
    }
    const difficulty = Math.min(
      clampDifficulty(this.selectedDifficulty),
      this.availableDifficulty(this.selectedLevelId)
    );
    this.selectedDifficulty = difficulty;
    this.persistPreferences();
    const session = {
      level: this.selectedLevel(),
      difficulty,
      deck,
      startedAt: Date.now()
    };
    this.hide();
    this.onStartLevel?.(session);
  }
}

function createMetaRoot() {
  let root = document.querySelector('#meta-root');
  if (root) return root;
  root = document.createElement('section');
  root.id = 'meta-root';
  root.className = 'meta-root';
  document.querySelector('#app')?.appendChild(root);
  return root;
}

function pageTitleForView(view) {
  const titles = {
    levels: '选关',
    deck: '选择牌组',
    shop: '商店',
    upgrades: '升级卡牌',
    guide: '玩法说明',
    encyclopedia: '附魔百科',
    changelog: '更新日志',
    result: '战斗结算'
  };
  return titles[view] ?? '村落战争';
}

function loadProgress() {
  const raw = readStoredProgress();
  const ownedCards = normalizeOwnedCards(raw?.ownedCards);
  const cardLevels = {};
  ownedCards.forEach((id) => {
    cardLevels[id] = Math.max(1, Math.floor(raw?.cardLevels?.[id] ?? 1));
  });
  const levelDifficulties = {};
  LEVEL_DEFINITIONS.forEach((level) => {
    levelDifficulties[level.id] = clampDifficulty(raw?.levelDifficulties?.[level.id] ?? 1);
  });
  const preferences = normalizePreferences(raw?.preferences, ownedCards, levelDifficulties);
  const hasStartingCoinsGrant = raw?.startingCoinsVersion === STARTING_COINS_VERSION;
  const storedCoins = Math.max(0, Math.floor(raw?.coins ?? 0));
  const progress = {
    coins: hasStartingCoinsGrant ? storedCoins : Math.max(storedCoins, STARTING_COINS),
    startingCoinsVersion: STARTING_COINS_VERSION,
    ownedCards,
    cardLevels,
    levelDifficulties,
    preferences
  };
  saveProgress(progress);
  return progress;
}

function readStoredProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
  } catch {
    return null;
  }
}

function saveProgress(progress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Local storage can fail in private contexts; gameplay can continue in memory.
  }
}

function normalizePreferences(rawPreferences, ownedCards, levelDifficulties) {
  const selectedLevelId = normalizeLevelId(rawPreferences?.selectedLevelId);
  const selectedDifficulties = {};
  LEVEL_DEFINITIONS.forEach((level) => {
    selectedDifficulties[level.id] = Math.min(
      clampDifficulty(rawPreferences?.selectedDifficulties?.[level.id] ?? 1),
      clampDifficulty(levelDifficulties[level.id] ?? 1)
    );
  });
  const savedDeckSelection = normalizeDeckSelection(rawPreferences?.deckSelection, ownedCards);
  const starterDeckSelection = normalizeDeckSelection(STARTER_CARD_IDS, ownedCards, {
    defaultToOwned: false
  });
  let deckSelection = savedDeckSelection.length === DECK_SIZE
    ? savedDeckSelection
    : starterDeckSelection;
  if (deckSelection.length < DECK_SIZE) {
    deckSelection = fillDeckSelection(deckSelection, ownedCards);
  }
  return {
    selectedLevelId,
    selectedDifficulties,
    deckSelection
  };
}

function normalizeLevelId(levelId) {
  return LEVEL_DEFINITIONS.some((level) => level.id === levelId)
    ? levelId
    : LEVEL_DEFINITIONS[0]?.id ?? 'snow-valley';
}

function normalizeDeckSelection(rawDeckSelection, ownedCards, options = {}) {
  const defaultToOwned = options.defaultToOwned !== false;
  const source = Array.isArray(rawDeckSelection)
    ? rawDeckSelection
    : defaultToOwned ? ownedCards : [];
  const owned = new Set(ownedCards);
  const result = [];
  source.forEach((id) => {
    if (!owned.has(id) || result.includes(id)) return;
    result.push(id);
  });
  return result.slice(0, DECK_SIZE);
}

function fillDeckSelection(selection, ownedCards) {
  const owned = new Set(ownedCards);
  const result = [...selection];
  const addIfMissing = (id) => {
    if (result.length >= DECK_SIZE) return;
    if (!owned.has(id) || result.includes(id)) return;
    result.push(id);
  };
  ownedCards.forEach(addIfMissing);
  STARTER_CARD_IDS.forEach(addIfMissing);
  return result.slice(0, DECK_SIZE);
}

function normalizeOwnedCards(rawOwnedCards) {
  const validIds = new Set(
    CARD_DEFINITIONS.filter((card) => !card.lootOnly).map((card) => card.id)
  );
  const result = [];
  [...STARTER_CARD_IDS, ...(rawOwnedCards ?? [])].forEach((id) => {
    if (!validIds.has(id) || result.includes(id)) return;
    result.push(id);
  });
  return result;
}

function upgradeCost(id, level) {
  const base = CARD_META[id]?.upgradeBaseCost ?? 25;
  return Math.round(base * 2 ** Math.max(0, level - 1));
}

function clampDifficulty(value) {
  const number = Number(value);
  const integer = Number.isFinite(number) ? Math.floor(number) : 1;
  return Math.max(1, Math.min(MAX_LEVEL_DIFFICULTY, integer));
}

function difficultyGrowthMultiplier(level, selectedDifficulty) {
  const levelGrowth = Number.isFinite(level?.waveDifficultyGrowth)
    ? Math.max(0.1, level.waveDifficultyGrowth)
    : 1;
  return levelGrowth * (1 + (clampDifficulty(selectedDifficulty) - 1) * WAVE_DIFFICULTY_GROWTH_PER_SELECTED_DIFFICULTY);
}

function formatGrowthMultiplier(value) {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0$/, '');
}

function kindLabel(kind) {
  if (kind === 'summon') return '单位';
  if (kind === 'spell') return '法术';
  if (kind === 'building') return '建筑';
  if (kind === 'tactic') return '战术';
  if (kind === 'ability') return '能力';
  return '附魔';
}

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function stopMetaEvent(event) {
  if (event.type === 'contextmenu') {
    event.preventDefault();
  }
  event.stopPropagation();
}

function isTextInputTarget(target) {
  return target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target?.isContentEditable;
}
