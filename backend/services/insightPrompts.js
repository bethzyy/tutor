/**
 * Insight Prompts — AI prompt templates for pattern analysis and mirror moments.
 * Designed for GLM-4-flash: short, structured, strict JSON output.
 */

export function batchAnalysisPrompt(recentMessages, existingInsights) {
  const messageText = recentMessages
    .map((m, i) => `[${i + 1}] ${m.role === 'user' ? '用户' : 'AI'}: ${m.content}`)
    .join('\n');

  const existingSummary = existingInsights.length > 0
    ? `\n已识别的模式：\n${existingInsights.map(ins => `- ${ins.pattern_name}: ${ins.summary} (${ins.occurrence_count}次)`).join('\n')}`
    : '';

  return {
    system: `你是认知行为分析专家。分析对话记录，识别心理模式。
只输出JSON：{"patterns":[{"name":"英文标识","type":"cognitive_distortion|topic_avoidance|value_action_gap|emotional_shift","summary":"一句中文","evidence_indices":[1,3],"confidence":0.8}]}
规则：
1. confidence范围0.0-1.0，只报告>=0.5的
2. evidence_indices是消息编号（从1开始）
3. 没有明确模式返回空数组
4. 宁可漏报不误报`,

    user: `对话记录：\n${messageText}${existingSummary}`,
  };
}

export function mirrorMomentPrompt(insight, userName) {
  const evidence = JSON.parse(insight.evidence || '[]');
  const quotes = evidence.map(e => `"${e.quote}"`).join('、');

  return {
    system: `你是温暖的成长教练。用温和的方式指出一个你观察到的心理模式。
规则：
1. 用"我注意到..."开头，不用"你有..."
2. 语气好奇而非判断
3. 给出具体证据（引用原话）
4. 提一个开放性反思问题
5. 控制在80字以内
6. 只输出文本，不要JSON`,

    user: `用户：${userName || '你'}
模式：${insight.pattern_name}
描述：${insight.summary}
证据：${quotes}
出现次数：${insight.occurrence_count}次

请生成温和的观察提醒。`,
  };
}

export default { batchAnalysisPrompt, mirrorMomentPrompt };
