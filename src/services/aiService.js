const OpenAI = require('openai');
const logger = require('../utils/logger');

class AIService {
  constructor() {
    this.openai = null;
    this.isInitialized = false;
    
    // OpenAI 초기화
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
      this.isInitialized = true;
      logger.info('OpenAI 서비스 초기화 완료');
    } else {
      logger.warn('OpenAI API 키가 설정되지 않았습니다. AI 기능이 제한됩니다.');
    }
  }

  /**
   * 사용자 집중 패턴 분석 및 루틴 제안
   */
  async generateRoutineRecommendation(userData) {
    try {
      if (!this.isInitialized) {
        return this.generateFallbackRecommendation(userData);
      }

      const prompt = this.buildRoutinePrompt(userData);
      
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: '당신은 집중력 향상과 생산성 코칭 전문가입니다. 사용자의 포모도로 데이터를 분석하여 개인화된 루틴을 제안해주세요.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 500,
        temperature: 0.7
      });

      const recommendation = response.choices[0].message.content;
      
      logger.info('AI 루틴 제안 생성 완료', {
        userId: userData.userId,
        totalSessions: userData.stats.totalSessions
      });

      return {
        success: true,
        recommendation,
        type: 'ai_generated',
        confidence: this.calculateConfidence(userData.stats),
        generatedAt: new Date()
      };

    } catch (error) {
      logger.error(`AI 루틴 제안 생성 실패: ${error.message}`, {
        userId: userData.userId
      });

      // AI 실패 시 폴백 제안 반환
      return this.generateFallbackRecommendation(userData);
    }
  }

  /**
   * 루틴 제안 프롬프트 생성
   */
  buildRoutinePrompt(userData) {
    const { stats, patterns, goals } = userData;
    
    let prompt = `사용자의 집중 패턴 분석 결과:

📊 전체 통계:
- 총 포모도로 세션: ${stats.totalSessions}회
- 총 집중 시간: ${Math.round(stats.totalFocusTime / 60)}시간 ${stats.totalFocusTime % 60}분
- 평균 집중 시간: ${stats.averageFocusTime}분
- 완료율: ${stats.completionRate}%

⏰ 집중 패턴:`;

    if (patterns.optimalTime) {
      prompt += `\n- 최고 집중 시간대: ${patterns.optimalTime.hour}시`;
    }

    if (patterns.productiveDays && patterns.productiveDays.length > 0) {
      prompt += `\n- 생산적인 요일: ${patterns.productiveDays.join(', ')}`;
    }

    if (goals && goals.length > 0) {
      prompt += `\n\n🎯 주요 목표들:\n${goals.map(goal => `- ${goal.name}: ${Math.round(goal.totalTime / 60)}시간`).join('\n')}`;
    }

    prompt += `

위 데이터를 바탕으로 사용자에게 다음을 포함한 개인화된 집중 루틴을 제안해주세요:

1. 최적의 집중 시간대 활용 방법
2. 주간 계획 수립 가이드  
3. 집중력 향상을 위한 구체적인 팁 (3-4개)
4. 목표별 시간 배분 제안

답변은 친근하고 실용적으로 작성해주세요. 각 제안은 구체적이고 실행 가능해야 합니다.`;

    return prompt;
  }

  /**
   * AI 제안 신뢰도 계산
   */
  calculateConfidence(stats) {
    let confidence = 0;
    
    // 세션 수 기반 신뢰도
    if (stats.totalSessions >= 30) confidence += 40;
    else if (stats.totalSessions >= 15) confidence += 25;
    else if (stats.totalSessions >= 5) confidence += 15;
    
    // 완료율 기반 신뢰도
    if (stats.completionRate >= 80) confidence += 30;
    else if (stats.completionRate >= 60) confidence += 20;
    else if (stats.completionRate >= 40) confidence += 10;
    
    // 일관성 기반 신뢰도
    if (stats.totalDays >= 14) confidence += 30;
    else if (stats.totalDays >= 7) confidence += 20;
    else if (stats.totalDays >= 3) confidence += 10;
    
    return Math.min(confidence, 100);
  }

  /**
   * AI 실패 시 폴백 제안
   */
  generateFallbackRecommendation(userData) {
    const { stats, patterns } = userData;
    
    let recommendation = '📋 맞춤 집중 루틴 제안\n\n';
    
    // 기본 루틴 제안
    if (stats.totalSessions < 5) {
      recommendation += `🌱 집중 습관 만들기 단계
      
1. 하루 2-3회 포모도로 세션으로 시작해보세요
2. 25분 집중 + 5분 휴식 사이클을 지켜주세요  
3. 휴식 시간에는 화면에서 눈을 떼고 스트레칭하세요
4. 완료한 세션은 꼭 기록해보세요`;
    } else {
      recommendation += `🎯 개인화 루틴 제안
      
1. 최적 집중 시간대 활용
   ${patterns.optimalTime ? `- ${patterns.optimalTime.hour}시경이 가장 집중이 잘 되니 이 시간을 활용하세요` : '- 아직 패턴이 부족해요. 다양한 시간대에 시도해보세요'}

2. 주간 계획 수립
   - 월요일: 주간 목표 설정 및 우선순위 정리
   - 화-목: 핵심 작업 집중 (하루 4-6 포모도로)
   - 금요일: 마무리 및 정리 시간

3. 집중력 향상 팁
   - 세션 시작 전 핸드폰을 다른 방에 두세요
   - 집중이 어려우면 2분 명상으로 마음을 정리하세요
   - 완료 후 작은 보상을 주세요 (차 한 잔, 좋아하는 음악 등)`;
    }
    
    recommendation += `\n\n⭐ 현재 완료율: ${stats.completionRate}%`;
    if (stats.completionRate < 70) {
      recommendation += '\n💡 완료율이 낮네요. 목표를 조금 더 작게 나누어 보세요!';
    } else {
      recommendation += '\n🎉 훌륭한 완료율이에요! 이 페이스를 유지해보세요!';
    }

    return {
      success: true,
      recommendation,
      type: 'rule_based',
      confidence: this.calculateConfidence(stats),
      generatedAt: new Date()
    };
  }

  /**
   * 목표 달성 전략 제안
   */
  async generateGoalStrategy(goalData) {
    try {
      if (!this.isInitialized) {
        return this.generateFallbackGoalStrategy(goalData);
      }

      const prompt = `목표: "${goalData.title}"
목표 기간: ${goalData.duration}일
현재 진행률: ${goalData.progress}%
남은 기간: ${goalData.remainingDays}일

이 목표를 효과적으로 달성하기 위한 구체적인 전략을 제안해주세요. 포모도로 기법을 활용한 시간 분배와 우선순위를 포함해주세요.`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: '당신은 목표 달성 코칭 전문가입니다. 포모도로 기법을 활용한 실현 가능한 전략을 제안해주세요.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 400,
        temperature: 0.7
      });

      return {
        success: true,
        strategy: response.choices[0].message.content,
        type: 'ai_generated',
        generatedAt: new Date()
      };

    } catch (error) {
      logger.error(`목표 전략 생성 실패: ${error.message}`);
      return this.generateFallbackGoalStrategy(goalData);
    }
  }

  /**
   * 폴백 목표 전략
   */
  generateFallbackGoalStrategy(goalData) {
    const dailyTarget = Math.ceil((100 - goalData.progress) / goalData.remainingDays);
    
    let strategy = `🎯 "${goalData.title}" 달성 전략\n\n`;
    
    strategy += `📊 현재 상황:
- 진행률: ${goalData.progress}%
- 남은 기간: ${goalData.remainingDays}일
- 일일 목표: 약 ${dailyTarget}% 달성 필요\n\n`;

    strategy += `⚡ 추천 전략:
1. 매일 ${Math.ceil(dailyTarget / 25 * 6)} 포모도로 세션 목표
2. 우선순위 높은 작업부터 시작
3. 주간 검토로 진행 상황 점검
4. 작은 성취도 축하하며 동기 유지`;

    return {
      success: true,
      strategy,
      type: 'rule_based',
      generatedAt: new Date()
    };
  }

  /**
   * 서비스 상태 확인
   */
  getServiceStatus() {
    return {
      isInitialized: this.isInitialized,
      hasApiKey: !!process.env.OPENAI_API_KEY,
      provider: 'OpenAI GPT-3.5-turbo'
    };
  }
}

module.exports = new AIService();
