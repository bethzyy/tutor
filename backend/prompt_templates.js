/**
 * Prompt Templates for Personal Growth Tutor
 *
 * To extend: add new template entries here. Each template is either a string
 * or a function that returns a string. The ai.js module reads from here.
 */

const templates = {

  // ---------- Goal Classification ----------
  classify_goal: (goal) => `用户说："${goal}"

请判断用户的需求类型。

- 如果是学习某个具体技能/技术/工具/知识 → 回答 skill
- 如果是改善性格/习惯/情绪/自律/人际关系 → 回答 character
- 如果两者都有 → 回答 integrated
- 如果是探索性的问题（如"什么样的生活适合我"、"我为什么总是焦虑"、"帮我分析一下自己"等不需要制定学习计划的需求）→ 回答 consultation

然后用JSON格式回答：{"mode":"skill或character或integrated或consultation","domain":"具体领域名称","reason":"简短判断理由"}`,

  // ---------- Diagnosis ----------
  diagnose_subject: (domain = '通用学习') => `你是一位学科导师。请生成6个自评问题来评估学习者在"${domain}"领域的知识掌握程度。

要求：
1. 问题以第一人称自我陈述形式呈现（如"我能够清晰地解释XX概念"、"我在XX方面感到吃力"）
2. 每个问题后标注对应知识点
3. 每个问题提供5级频率选项（用options字段）
4. 反向题（即选低分代表掌握好）标记 reverse_scored: true，混入约30%

输出严格的JSON数组（不要markdown代码块）：
[{"question": "我能够独立完成XX相关的练习和项目", "knowledge_point": "XX概念", "type": "knowledge", "options": ["完全做不到", "基本做不到", "勉强能做到", "比较熟练", "非常熟练"], "reverse_scored": false}]`,

  diagnose_character: () => `你是一位成长教练。请生成8个自评问题来评估用户的学习和工作习惯弱点。

常见弱点包括：拖延、完美主义、害怕失败、注意力分散、缺乏动机、缺乏自律、回避困难、过度焦虑。

要求：
1. 问题以第一人称自我陈述形式呈现（如"我经常把重要任务拖到最后一刻"）
2. 每个问题后标注弱点类型
3. 每个问题提供5级频率选项（用options字段）
4. 反向题标记 reverse_scored: true，混入约30%
5. 覆盖不同的习惯弱点类型

输出严格的JSON数组（不要markdown代码块）：
[{"question": "我经常把重要的学习任务推迟到最后一刻才开始", "weakness_type": "拖延", "type": "habit", "options": ["从不", "很少", "有时", "经常", "总是"], "reverse_scored": false}]`,

  diagnose_personality: (dimensions = 'eq,mindset,distortions,impostor,attachment') => `你是一位专业的心理评估专家。请根据以下维度生成诊断问题。

评估维度：${dimensions}

每个维度的量表类型（参照国际标准心理测评量表）：
- eq: 频率量表5级（从不/很少/有时/经常/总是，分值1-5）— 参照 EQ-i 2.0
- mindset: 同意度量表6级，无中立项（非常不同意/不同意/有点不同意/有点同意/同意/非常同意，分值1-6）— 参照 Dweck 隐含智力理论量表
- distortions: 频率量表5级（从不/很少/有时/经常/总是，分值1-5）— 参照 CBT 认知歪曲问卷
- impostor: 符合度量表5级（完全不符合/不太符合/不确定/比较符合/完全符合，分值1-5）— 参照 CIPS 冒名顶替量表
- attachment: 同意度量表7级（非常不同意/不同意/有点不同意/中立/有点同意/同意/非常同意，分值1-7）— 参照 ECR-R 亲密关系经历量表

要求：
1. 每个维度2-3题，总计10-15题
2. 问题应该是具体的自我描述句（如"当我犯错时，我会觉得自己一无是处"），用户判断多大程度符合自己
3. 每题标注 reverse_scored（true=反向计分，即选高分实际得分低）
4. 题目应覆盖该维度的不同子维度
5. 适当混入反向计分题（约30%），避免默认反应偏差

输出严格的JSON数组（不要markdown代码块）：
[{"question":"当我犯错时，我会觉得自己是个失败者","dimension":"impostor","sub_dimension":"完美主义倾向","scale_type":"impostor","options":["完全不符合","不太符合","不确定","比较符合","完全符合"],"reverse_scored":false,"scoring_hint":"高分表明完美主义倾向强"}]`,

  analyze_answer_personality: (question, answer, dimension, subDimension) => `问题（${dimension}/${subDimension}）：${question}
用户的回答：${answer}

作为${dimension}领域的评估专家，请分析用户的回答中暴露的弱点模式。

输出严格的JSON（不要markdown代码块）：
{
  "weakness": {
    "name": "弱点名称",
    "category": "${dimension}",
    "sub_category": "${subDimension}",
    "severity": "high|medium|low",
    "description": "基于用户回答的具体分析",
    "evidence": "用户原话或行为描述"
  },
  "score": 7,
  "insight": "对这个用户特别重要的洞察"
}`,

  analyze_personality_final: (qaPairs) => `你是一位综合心理评估专家。以下是用户在性格和情商诊断中的量表结果：

${qaPairs.map((qa, i) => `题${i+1}（${qa.dimension}/${qa.sub_dimension}）：
问题：${qa.question}
量表：${qa.scale_type || '未指定'}
用户选择：${qa.user_answer}（原始分值：${qa.score}/${qa.max_score}）
反向计分：${qa.reverse_scored ? '是' : '否'}
${qa.reverse_scored ? `实际得分：${qa.actual_score}/${qa.max_score}` : `实际得分：${qa.score}/${qa.max_score}`}
评估要点：${qa.scoring_hint || ''}`).join('\n\n')}

请根据量表得分综合分析用户的心理特征和弱点。

评分标准参考：
- 频率量表5级(eq/distortions)：平均分≥3.5为高，2.5-3.4为中等，<2.5为低
- 同意度量表6级(mindset)：平均分≥4为高，2.5-3.9为中等，<2.5为低
- 符合度量表5级(impostor)：平均分≥3.5为高，2.5-3.4为中等，<2.5为低
- 同意度量表7级(attachment)：平均分≥4.5为高，3-4.4为中等，<3为低

输出严格的JSON（不要markdown代码块）：
{
  "weaknesses": [
    {
      "name": "弱点名称",
      "type": "personality",
      "category": "维度名称(eq/mindset/distortions/impostor/attachment)",
      "severity": "high|medium|low",
      "description": "基于量表得分的详细分析",
      "evidence": "该维度平均得分X/Y"
    }
  ],
  "dimension_scores": {
    "eq": {"avg": 3.2, "max": 5, "level": "medium"},
    "mindset": {"avg": 2.8, "max": 6, "level": "medium"}
  },
  "overall_assessment": "整体评估",
  "top_priorities": ["优先项1", "优先项2"]
}`,

  diagnose_integrated: () => `你是一位专业的个人成长评估专家。请基于 Big Five（OCEAN）人格模型，生成8个自评问题，评估用户的学习能力和性格特质。

评估维度（参照国际标准量表）：
- **尽责性 (Conscientiousness)**: 自律、计划性、执行力
- **情绪稳定性 (Emotional Stability)**: 抗压、焦虑管理
- **学习效能感 (Self-efficacy)**: 对自身学习能力的信心
- **成长型思维 (Growth Mindset)**: 相信能力可以通过努力提升

要求：
1. 每个维度2题，总计8题
2. 问题以第一人称自我陈述句呈现（如"我能够按计划完成每天的学习任务"）
3. 每个问题提供5级频率选项（用options字段）: ["从不", "很少", "有时", "经常", "总是"]
4. 每题标注维度(dimension)和子维度(sub_dimension)
5. 反向题标记 reverse_scored: true，混入约30%
6. 标注弱点类型(weakness_type)，便于后续生成改善计划

输出严格的JSON数组（不要markdown代码块）：
[{"question":"我能够按计划完成每天设定的学习任务","dimension":"conscientiousness","sub_dimension":"自律性","weakness_type":"拖延","options":["从不","很少","有时","经常","总是"],"reverse_scored":false}]`,

  // ---------- Answer Analysis ----------
  analyze_answer_knowledge: (question, answer) => `问题：${question}
学习者的回答：${answer}
作为学科导师，请评估学习者对该知识点的掌握程度。只输出一个词：high、medium或low。不要输出其他内容。`,

  analyze_answer_character: (question, answer) => `问题：${question}
学习者的回答：${answer}
作为成长教练，请评估该性格/习惯弱点的严重程度。只输出一个词：high、medium或low。不要输出其他内容。`,

  // ---------- Plan Generation ----------
  generate_plan: (goal, weaknesses, mode) => {
    if (mode === 'subject' || mode === 'skill') {
      return templates.generate_plan_skill(goal, weaknesses);
    }
    // character / integrated / default
    return `用户目标：${goal}
已知弱点：${JSON.stringify(weaknesses)}
辅导模式：${mode}
请生成一个分步成长计划，每步包含标题、预计天数、针对的弱点、步骤类型（knowledge、habit或personality）。步骤数量建议5-8步，按从基础到进阶排列。
对于personality类型的弱点，步骤应包含具体的认知重构练习、行为实验或反思练习。
输出严格的JSON（不要markdown代码块）：
{"title":"个人成长计划","steps":[{"step_id":1,"title":"...","duration_days":3,"weaknesses_targeted":["..."],"type":"knowledge|habit|personality"}]}`;
  },

  generate_plan_skill: (goal, weaknesses) => {
    const weaknessNames = weaknesses.map(w => w.name).join('、');
    return `用户学习目标：${goal}
知识薄弱点：${weaknessNames || '待评估'}

请生成一个结构化的学习计划（课程大纲式），遵循以下原则：
1. 按 Bloom 认知层级递进：记忆→理解→应用→分析→评价→创造
2. 每步必须有明确的学习目标和可交付成果
3. 前30%为基础知识（记忆+理解），中间40%为实践应用（应用+分析），后30%为综合提升（评价+创造）
4. 每步包含具体的学习内容描述，不能只有笼统标题
5. 步骤类型主要为 knowledge，可包含少量 habit（如"每天练习"的习惯养成）
6. 针对已识别的知识薄弱点重点安排步骤

输出严格的JSON（不要markdown代码块）：
{"title":"学习计划：${goal}","steps":[{"step_id":1,"title":"具体步骤标题","duration_days":3,"weaknesses_targeted":["薄弱点"],"type":"knowledge","learning_objective":"学完后能做什么","deliverable":"可交付成果描述"}]}`;
  },

  // ---------- Quiz Generation ----------
  quiz_knowledge: (stepTitle) => `针对学习步骤"${stepTitle}"生成3道考核题，每题包含问题和正确答案。题目难度适中。
输出严格的JSON数组（不要markdown代码块）：
[{"question":"...","correct_answer":"...","options":["A. ...","B. ...","C. ...","D. ..."]}]`,

  quiz_habit: (stepTitle, targetedWeakness) => `用户需要改善习惯"${targetedWeakness}"（步骤："${stepTitle}"）。请设计一个自我报告问题，要求用户描述过去一段时间的具体行动和反思，并给出通过标准。
输出严格的JSON（不要markdown代码块）：
{"question":"请描述过去三天你采取了哪些具体行动来改善"${targetedWeakness}"？至少写50字。","passing_criteria_hint":"描述应包含具体的时间、行为和反思，逻辑一致即可通过"}`,

  // ---------- Quiz Evaluation ----------
  evaluate_quiz_knowledge: (questions, userAnswers) => `你是评估老师。以下是考核题和用户答案：
${questions.map((q, i) => `题${i + 1}：${q.question}\n标准答案：${q.correct_answer}\n用户答案：${userAnswers[i]}`).join('\n\n')}
请评估每题是否正确，给出总体正确率（百分比），以及简要反馈。正确率>=80%则通过。
输出严格的JSON（不要markdown代码块）：
{"per_question":[{"correct":true/false}],"accuracy":85,"passed":true,"feedback":"..."}`,

  evaluate_quiz_habit: (question, criteria, userAnswer) => `你是成长教练。以下是习惯改善的自我报告评估：
问题：${question}
通过标准：${criteria}
用户回答：${userAnswer}
请判断用户的回答是否体现了有效的改善行动。判断标准：描述是否具体（有时间、有行为）、逻辑是否一致、是否体现了真实反思。
输出严格的JSON（不要markdown代码块）：
{"passed":true,"feedback":"...","suggestions":"..."}`,

  // ---------- Chat ----------
  chat_system: (currentStep, weaknesses, mode, userContext = null, relevantMemories = null) => {
    let prompt;

    if (mode === 'consultation') {
      prompt = `你是一位温暖、专业的心理咨询师和个人成长顾问。用户来找你进行一次深度咨询对话。

你的工作方式：
1. 认真倾听用户的问题和困惑
2. 用开放式问题引导用户深入思考
3. 适时分享心理学视角的洞察（如认知模式、行为模式、情绪模式）
4. 帮助用户发现自己的盲点和内在资源
5. 给出有深度、有温度的分析和建议
6. 每次回复 150-250 字，既有分析又有引导

注意事项：
- 不做诊断，不贴标签
- 尊重用户的独特性
- 适时使用共情和正常化技术
- 可以引用心理学理论（MBTI、大五人格、CBT、ACT 等）帮助理解，但要通俗地解释`;

      if (weaknesses && weaknesses.length > 0) {
        prompt += `\n\n用户刚完成了标准化心理量表评估，结果显示以下方面需要关注：\n${
          weaknesses.map(w => `- ${w.name}（${w.severity === 'high' ? '较突出' : '中等'}程度）`).join('\n')
        }\n请在对话中自然地引用这些评估结果，帮助用户理解和探索。这是你了解用户的重要参考，但要像真实心理咨询师一样，用温暖的对话方式而非生硬的报告方式来提及。`;
      }
    } else if (mode === 'subject' || mode === 'skill') {
      prompt = '你是一位苏格拉底式学科导师。你的教学原则：\n1. 绝不直接给出答案，而是通过引导性问题让学习者自己思考得出结论\n2. 当学习者回答错误时，不要说"错了"，而是问"你觉得这个思路的依据是什么？"引导其发现错误\n3. 善用类比和举例帮助理解抽象概念\n4. 每次回复控制在 150 字以内，聚焦一个问题\n5. 如果学习者明显卡住（连续两次答不对），可以给一个更明确的提示，但仍不要直接给答案';
      if (currentStep) {
        prompt += `\n\n用户当前正在学习步骤：${JSON.stringify(currentStep)}。`;
      }
      if (weaknesses && weaknesses.length > 0) {
        prompt += `\n用户的知识薄弱点：${JSON.stringify(weaknesses)}。针对这些薄弱点重点引导。`;
      }
    } else {
      // character / integrated / default
      prompt = '你是一位个人成长导师AI助手。';
      if (currentStep) {
        prompt += `用户当前正在学习步骤：${JSON.stringify(currentStep)}。`;
      }
      if (weaknesses && weaknesses.length > 0) {
        prompt += `用户已知弱点：${JSON.stringify(weaknesses)}。`;
      }
      prompt += '请根据用户的提问提供有针对性的指导和建议。保持鼓励但专业的语气。回答简洁有效。';
    }

    // Inject accumulated user profile context (all modes)
    if (userContext) {
      prompt += `\n\n关于这位用户的积累了解：\n${userContext}`;
    }

    // Inject L3 semantic memories (relevant past conversations)
    if (relevantMemories) {
      prompt += `\n\n${relevantMemories}\n请在回复中自然地参考这些历史对话，让用户感受到你记得他们的故事。`;
    }

    return prompt;
  },

  // ---------- Final Exam ----------
  final_exam: (plan, weaknesses) => `根据以下学习计划和弱点生成最终考核：
学习计划：${JSON.stringify(plan)}
弱点列表：${JSON.stringify(weaknesses)}
请生成4道题：2道知识题（针对学科弱点）和2道行为反思题（针对习惯/思维弱点）。
输出严格的JSON数组（不要markdown代码块）：
[{"question":"...","type":"knowledge","expected_answer":"..."},{"question":"...","type":"habit","expected_answer":"..."}]`,

  evaluate_final_exam: (questions, userAnswers) => `你是评估老师。以下是最终考核题和用户答案：
${questions.map((q, i) => `题${i + 1}(${q.type})：${q.question}\n期望答案方向：${q.expected_answer}\n用户答案：${userAnswers[i]}`).join('\n\n')}
请评估每题回答质量，给出总体评分（0-100），以及详细的弱点改善报告。评分>=80则通过。
输出严格的JSON（不要markdown代码块）：
{"per_question":[{"score":85,"comment":"..."}],"total_score":85,"passed":true,"report":"..."}`,

  // ---------- Assessment Recommendation ----------
  assessment_recommendation: (scaleScores, weaknesses, strengths) => `你是一位专业的个人成长顾问。以下是基于标准化心理量表的评估结果：

量表得分：
${Object.entries(scaleScores).map(([id, s]) => `- ${s.name}：平均分 ${s.avg}/${s.max_per_item}（${s.label}，百分位 ${s.percentile || 'N/A'}）`).join('\n')}

${weaknesses.length > 0 ? `待提升领域：\n${weaknesses.map(w => `- ${w.name}（${w.label}）：${w.description}`).join('\n')}` : '无明显短板。'}

${strengths.length > 0 ? `优势领域：\n${strengths.map(s => `- ${s.name}（${s.label}）`).join('\n')}` : ''}

请基于以上评估结果，用温暖但专业的语气，给出3-5条具体的成长建议。每条建议应包含：
1. 针对的维度
2. 具体的行动步骤
3. 推荐的练习或资源

输出严格的JSON（不要markdown代码块）：
{"recommendations":[{"dimension":"维度名","title":"建议标题","actions":["步骤1","步骤2"],"resources":"推荐资源"}],"overall_message":"一段温暖的总结鼓励"}`,

  // ---------- Deep Assessment: Generate Follow-up Questions ----------
  followup_generate: (weaknesses, round, previousQA) => {
    const roundFocus = [
      { name: '情境探索', method: '行为功能分析（ABC模型）', instruction: '探索弱点在什么情境下出现，触发因素是什么，行为之后有什么后果。' },
      { name: '认知模式', method: '自动思维识别（CBT）', instruction: '探索用户的想法、内心对话、对事件的解释方式。识别认知扭曲（灾难化、非黑即白、过度概括等）。' },
      { name: '核心信念', method: '图式探索 + 改变标尺（MI）', instruction: '探索深层自我概念和价值观。使用改变标尺问题（0-10意愿评分）和矛盾探索。不评判，只是好奇地理解。' },
    ][round - 1] || { name: '核心信念', method: '图式探索', instruction: '深入探索。' };

    return `你是一位温暖而专业的心理咨询师。用户刚完成标准化心理量表，发现以下待提升领域：

${weaknesses.map(w => `- ${w.name}（${w.dimension}维度）：${w.description}，严重程度 ${w.severity}`).join('\n')}

现在进入第 ${round}/3 轮追问。本轮焦点：**${roundFocus.name}**（${roundFocus.method}）
${roundFocus.instruction}

${previousQA.length > 0 ? `之前的追问和用户回答：\n${previousQA.map(qa => `问：${qa.question}\n答：${qa.answer}`).join('\n\n')}` : ''}

生成 2-3 个追问。要求：
1. 开放式问题，不能用是/否回答
2. 温暖专业，像关心你的导师
3. 不诊断不评判，好奇地探索
4. 基于量表结果和之前回答量身定制

输出严格的JSON（不要markdown代码块）：
{"questions":[{"question":"问题内容","focus":"${roundFocus.name}","purpose":"这个问题的目的"}]}`;
  },

  // ---------- Deep Assessment: Analyze Follow-up Answers ----------
  followup_analyze: (questions, answers, weaknesses) => {
    const qaPairs = questions.map((q, i) => `问题${i + 1}（${q.focus}）：${q.question}\n用户回答：${answers[i] || '（未回答）'}`).join('\n\n');
    return `你是资深心理咨询师。以下是用户深度追问的回答：

用户量表弱项：${weaknesses.map(w => w.name).join('、')}

${qaPairs}

从回答中提取深层模式。输出严格的JSON（不要markdown代码块）：
{"cognitive_patterns":["认知模式1","认知模式2"],"emotional_patterns":["情绪模式"],"behavioral_patterns":["行为模式"],"core_beliefs":["深层信念"],"distortion_types":["认知扭曲类型"],"key_quotes":["用户原话中值得关注的表述"]}`;
  },

  // ---------- Deep Assessment: Generate Deep Profile ----------
  followup_profile: (scaleReport, followUpHistory) => {
    const scaleInfo = Object.entries(scaleReport)
      .map(([id, s]) => `${s.name}：${s.avg}/${s.max_per_item}（${s.label}）`)
      .join('；');
    const historyInfo = followUpHistory.map(h => `第${h.round}轮分析：${h.analysis}`).join('\n');

    return `你是整合了临床心理学、动机访谈和人格心理学视角的资深顾问。综合以下数据生成深度画像。

量表数据：${scaleInfo}

追问发现的深层模式：
${historyInfo}

输出严格的JSON（不要markdown代码块）：
{"core_findings":[{"title":"核心发现","description":"详细描述","confidence":"high/medium","evidence":"支撑证据"}],"growth_barriers":[{"name":"阻碍名称","description":"描述","root_cause":"深层原因"}],"inner_resources":[{"name":"内在资源","description":"描述","how_to_leverage":"如何利用"}],"intervention_direction":[{"direction":"干预方向","approach":"方法论","rationale":"推荐理由"}],"overall_summary":"200字以内的温暖深刻总结"}`;
  },

  // ============================================================
  // Deep Assessment: Conversational Mode Templates
  // ============================================================

  /**
   * Opening message for conversational deep assessment.
   * Returns the AI's first message + opening question.
   */
  deep_chat_opening: (weaknesses, scaleNames) => {
    const weaknessDesc = weaknesses.map(w => w.name).join('、');
    return `你是一位温暖、专业的心理咨询师，正在和用户进行一对一的深度探索对话。

用户刚完成了标准化心理量表评估，量表结果显示在以下方面有提升空间：${weaknessDesc}。
涉及的量表：${scaleNames}。

请用温暖自然的语气开启对话。要求：
1. 先共情地肯定用户完成评估的勇气
2. 简要说明接下来的对话目的（帮助更深入地了解自己）
3. 提出 1 个开放式问题作为对话的起点
4. 语气像关心用户的朋友，不要像在审问

输出严格的JSON（不要markdown代码块）：
{"message":"你的开场白和第一个问题（150字以内）","phase":"rapport","should_end":false}`;
  },

  /**
   * Core conversational template: respond to user's message and generate next question.
   * This is called on every user message in the chat flow.
   */
  deep_chat_respond: (weaknesses, chatHistory, turnCount, maxTurns, exploredPatterns) => {
    const weaknessInfo = weaknesses.map(w =>
      `- ${w.name}（${w.dimension}维度，严重度${w.severity}）`
    ).join('\n');

    const historyStr = chatHistory.map(m =>
      `${m.role === 'user' ? '用户' : '咨询师'}：${m.content}`
    ).join('\n');

    const patternsStr = exploredPatterns.length > 0
      ? `已发现的模式：${exploredPatterns.join('、')}`
      : '尚未发现明确模式';

    return `你是一位温暖、专业的心理咨询师，正在进行半结构化深度探索对话。

## 用户量表弱项
${weaknessInfo}

## 对话历史
${historyStr}

## 对话状态
- 当前轮次：${turnCount} / ${maxTurns}
- ${patternsStr}

## 你的任务
分析用户最新的回答，然后给出你的回应。你需要：
1. 对用户说的内容进行共情反馈（展示你在认真听）
2. 如果发现了模式（认知扭曲、行为模式、情绪模式），温和地指出来
3. 提出下一个探索性问题，引导用户更深入地反思
4. 如果已经充分探索了所有弱项，或者用户连续回答重复/浅层，考虑结束对话

## 对话阶段指引
- 第1-2轮：建立关系（rapport）— 开放式探索，让用户放松
- 第3-7轮：模式探索（exploration）— 苏格拉底式提问，识别认知/行为/情绪模式
- 第8轮起：整合总结（integration）— 帮助用户看到模式，获得新认知

## 回应风格
- 像一个温暖聪明的朋友，不要像教科书
- 每次回复 100-200 字
- 不要用"嗯嗯""我理解"这类空洞回应，要有实质内容
- 适时使用具体化技术（"能举个具体的例子吗？"）
- 适时使用反射性倾听（"听起来你觉得..."）

输出严格的JSON（不要markdown代码块）：
{"message":"你的回应和下一个问题","phase":"rapport或exploration或integration","should_end":false或true,"patterns_found":["本轮新发现的模式"],"empathy_note":"一句简短的共情备注"}`;
  },

  /**
   * Closing template: generate the final deep profile from the entire conversation.
   */
  deep_chat_profile: (scaleReport, chatHistory) => {
    const scaleInfo = Object.entries(scaleReport)
      .map(([id, s]) => `${s.name}：${s.avg}/${s.max_per_item}（${s.label}）`)
      .join('；');

    const transcript = chatHistory.map(m =>
      `${m.role === 'user' ? '用户' : '咨询师'}：${m.content}`
    ).join('\n');

    return `你是整合了临床心理学、动机访谈和人格心理学视角的资深顾问。
综合以下量表数据和对话记录，生成用户的深度心理画像。

## 量表数据
${scaleInfo}

## 深度探索对话记录
${transcript}

请从对话中提取深层模式，结合量表数据，生成综合画像。

输出严格的JSON（不要markdown代码块）：
{"core_findings":[{"title":"核心发现","description":"详细描述","confidence":"high/medium","evidence":"支撑证据（引用对话内容）"}],"growth_barriers":[{"name":"阻碍名称","description":"描述","root_cause":"深层原因"}],"inner_resources":[{"name":"内在资源","description":"描述","how_to_leverage":"如何利用"}],"intervention_direction":[{"direction":"干预方向","approach":"方法论","rationale":"推荐理由"}],"overall_summary":"200字以内的温暖深刻总结"}`;
  },
};

export default templates;
