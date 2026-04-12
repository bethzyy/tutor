/**
 * Rule Scanner — Zero-cost regex-based pattern detection.
 * Runs synchronously on every user message. No API calls.
 */

const RULES = [
  // --- Linguistic Markers ---
  {
    name: 'absolutist_language',
    type: 'linguistic_marker',
    patterns: [/(总是|从来|永远|从不|每次|全都|一点也|完全不)/],
    description: () => '使用了绝对化表达',
    confidence: 0.6,
  },
  {
    name: 'self_negation',
    type: 'linguistic_marker',
    patterns: [/(我不行|我做不到|我没用|我太差|我不好|我太弱|我就是个|我配不上|我完了)/],
    description: () => '自我否定表达',
    confidence: 0.75,
  },
  {
    name: 'passive_voice',
    type: 'linguistic_marker',
    patterns: [/(被迫|不得不|没办法|被[^\s]{1,6}了|只能|只好)/],
    description: () => '被动式表达，暗示外部控制感',
    confidence: 0.4,
  },
  {
    name: 'qualification_cluster',
    type: 'linguistic_marker',
    patterns: [/(可能|也许|大概|好像|应该|或许|似的|吧.{0,2}){2,}/],
    description: () => '多个模糊限定词，可能缺乏自信或回避明确立场',
    confidence: 0.5,
  },

  // --- Cognitive Distortions ---
  {
    name: 'all_or_nothing',
    type: 'cognitive_distortion',
    patterns: [/(要么.*要么|不是.*就是|彻底失败|全完了|毫无)/],
    description: () => '非黑即白的二元思维',
    confidence: 0.55,
  },
  {
    name: 'overgeneralization',
    type: 'cognitive_distortion',
    patterns: [/(总是.*失败|从来没人|永远不会|每次都|大家都不|没人会|所有人都)/],
    description: () => '以偏概全：从个别事件推导普遍结论',
    confidence: 0.6,
  },
  {
    name: 'mind_reading',
    type: 'cognitive_distortion',
    patterns: [/(他(?:一定|肯定)觉得|她(?:一定|肯定)认为|他们(?:都)?在(?:看|想|说)我|别人(?:一定|肯定)?觉得我)/],
    description: () => '读心术：假定知道他人的想法',
    confidence: 0.55,
  },
  {
    name: 'should_statement',
    type: 'cognitive_distortion',
    patterns: [/(我应该|我必须|我一定要|我非得|本来应该|本该|早该)/],
    description: () => '应该思维：用"应该"给自己施压',
    confidence: 0.5,
  },
  {
    name: 'labeling',
    type: 'cognitive_distortion',
    patterns: [/(我是个?(?:失败|废物|懒|笨|差|蠢|没用|无能)|我就是个?(?:失败|废物|懒|笨|差|蠢|没用))/],
    description: () => '贴标签：用极端负面词汇定义自己',
    confidence: 0.7,
  },
  {
    name: 'emotional_reasoning',
    type: 'cognitive_distortion',
    patterns: [/(感觉.*就是|觉得.*所以|心里.*说明)/],
    description: () => '情绪化推理：把感觉当作事实证据',
    confidence: 0.45,
  },
  {
    name: 'personalization',
    type: 'cognitive_distortion',
    patterns: [/(都怪我|怪我|是我的错|是我害|因为我.*他们才|都是我)/],
    description: () => '个人化：把不完全相关的事情归咎于自己',
    confidence: 0.55,
  },

  // --- Emotional Shifts ---
  {
    name: 'helplessness',
    type: 'emotional_shift',
    patterns: [/(没办法|无能为力|改变不了|没有出路|无路可走|什么也做不了|没救)/],
    description: () => '无助感表达',
    confidence: 0.6,
  },
  {
    name: 'negative_intensity',
    type: 'emotional_shift',
    patterns: [/(崩溃|绝望|受不了|熬不下去|太痛苦|不如死)/],
    description: () => '高强度负面情绪表达',
    confidence: 0.8,
  },
];

/**
 * Scan a message text against all rules.
 * @param {string} text - User message content
 * @returns {Array<{name, type, snippet, confidence, description}>}
 */
export function scanMessage(text) {
  if (!text || typeof text !== 'string') return [];
  const hits = [];
  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      const match = text.match(pattern);
      if (match) {
        hits.push({
          name: rule.name,
          type: rule.type,
          snippet: match[0],
          confidence: rule.confidence,
          description: rule.description(match),
        });
        break;
      }
    }
  }
  return hits;
}

export default { scanMessage, RULES };
