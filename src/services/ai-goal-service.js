const OpenAI = require('openai');
const logger = require('../utils/logger');

/**
 * AI 기반 목표 세분화 서비스
 */
class AIGoalService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    // AI 응답 형식 템플릿
    this.systemPrompts = {
      goalBreakdown: `당신은 FIVLO 앱의 AI 어시스턴트 "오분이"입니다. 사용자의 목표를 분석하여 실행 가능한 단계로 세분화해주세요.

응답 형식:
{
  "analysis": "목표 분석 내용",
  "timeline": "추천 기간 (예: 30일, 3개월)",
  "difficulty": "easy|medium|hard",
  "tasks": [
    {
      "title": "작업 제목",
      "description": "상세 설명",
      "estimatedTime": "예상 소요 시간",
      "priority": "high|medium|low",
      "category": "study|exercise|work|habit|other",
      "week": 1
    }
  ],
  "tips": ["실행 팁1", "실행 팁2", "실행 팁3"],
  "motivation": "격려 메시지"
}

중요한 점:
- 한국어로 응답
- 실현 가능한 목표로 세분화
- 주차별로 체계적으로 구성
- FIVLO의 포모도로, Task 관리 기능 활용을 고려
- 동기부여가 되는 긍정적인 톤`,

      dailySchedule: `당신은 FIVLO 앱의 AI 어시스턴트입니다. 사용자의 목표와 시간을 고려하여 일일 스케줄을 추천해주세요.

응답 형식:
{
  "schedule": [
    {
      "time": "09:00",
      "activity": "활동명",
      "duration": 25,
      "type": "focus|break|task",
      "description": "상세 설명"
    }
  ],
  "pomodoroSessions": 4,
  "totalFocusTime": 100,
  "recommendations": ["추천사항1", "추천사항2"]
}

포모도로 기법 고려:
- 25분 집중 + 5분 휴식
- 4세션 후 15-30분 긴 휴식
- 하루 최대 8-10 포모도로 권장`,

      motivation: `당신은 FIVLO 앱의 AI 어시스턴트 "오분이"입니다. 사용자에게 동기부여 메시지를 제공해주세요.

응답 형식:
{
  "message": "격려 메시지",
  "tip": "실행 팁",
  "emoji": "😊"
}

특징:
- 친근하고 격려적인 톤
- 구체적이고 실행 가능한 조언
- 오분이 캐릭터의 따뜻한 성격 반영`
    };
  }

  /**
   * OpenAI API 호출 헬퍼
   */
  async callOpenAI(systemPrompt, userMessage, temperature = 0.7) {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature,
        max_tokens: 2000,
        response_format: { type: 'json_object' }
      });

      return JSON.parse(response.choices[0].message.content);
      
    } catch (error) {
      logger.error('OpenAI API 호출 실패:', error);
      throw new Error('AI 서비스 요청에 실패했습니다');
    }
  }

  /**
   * 목표를 세분화하여 실행 가능한 태스크로 분해
   */
  async breakdownGoal(goalData) {
    try {
      logger.info(`목표 세분화 요청: ${goalData.goal}`);

      const userMessage = `
목표: ${goalData.goal}
달성 기간: ${goalData.duration || '미정'}
현재 상황: ${goalData.currentSituation || '미제공'}
하루 가능 시간: ${goalData.availableTime || '미제공'}
경험 수준: ${goalData.experienceLevel || '초보'}

이 목표를 FIVLO 앱에서 실행 가능한 태스크들로 세분화해주세요.
포모도로 기법(25분 집중)과 Task 관리 기능을 활용할 수 있도록 구성해주세요.`;

      const result = await this.callOpenAI(
        this.systemPrompts.goalBreakdown,
        userMessage
      );

      // 결과 검증 및 보강
      result.generatedAt = new Date();
      result.goalId = goalData._id;

      logger.info(`목표 세분화 완료: ${result.tasks?.length || 0}개 태스크 생성`);
      
      return result;

    } catch (error) {
      logger.error('목표 세분화 실패:', error);
      throw error;
    }
  }

  /**
   * 일일 스케줄 추천
   */
  async generateDailySchedule(scheduleData) {
    try {
      logger.info(`일일 스케줄 생성 요청: ${scheduleData.goals?.length || 0}개 목표`);

      const userMessage = `
오늘의 목표들: ${scheduleData.goals?.join(', ') || '없음'}
가능한 시간: ${scheduleData.availableHours || 8}시간
선호 시간대: ${scheduleData.preferredTime || '오전'}
집중력 유형: ${scheduleData.focusType || '일반'}
휴식 선호도: ${scheduleData.breakPreference || '짧고 자주'}

오늘 하루 최적의 스케줄을 포모도로 기법에 맞춰 추천해주세요.`;

      const result = await this.callOpenAI(
        this.systemPrompts.dailySchedule,
        userMessage
      );

      result.generatedAt = new Date();
      result.targetDate = scheduleData.targetDate || new Date();

      logger.info(`일일 스케줄 생성 완료: ${result.pomodoroSessions || 0}개 세션`);
      
      return result;

    } catch (error) {
      logger.error('일일 스케줄 생성 실패:', error);
      throw error;
    }
  }

  /**
   * 동기부여 메시지 생성
   */
  async generateMotivation(motivationData) {
    try {
      logger.info(`동기부여 메시지 요청: ${motivationData.context}`);

      const userMessage = `
상황: ${motivationData.context || '일반적인 격려'}
현재 기분: ${motivationData.mood || '보통'}
진행 상황: ${motivationData.progress || '시작 단계'}
어려움: ${motivationData.difficulty || '없음'}
목표: ${motivationData.currentGoal || '없음'}

사용자에게 따뜻하고 격려가 되는 메시지를 전해주세요.`;

      const result = await this.callOpenAI(
        this.systemPrompts.motivation,
        userMessage,
        0.8 // 창의성을 높여 다양한 메시지 생성
      );

      result.generatedAt = new Date();

      logger.info('동기부여 메시지 생성 완료');
      
      return result;

    } catch (error) {
      logger.error('동기부여 메시지 생성 실패:', error);
      throw error;
    }
  }

  /**
   * 목표 달성 분석 및 개선 제안
   */
  async analyzeProgress(progressData) {
    try {
      logger.info(`진행 상황 분석 요청: ${progressData.completedTasks || 0}개 완료`);

      const systemPrompt = `당신은 FIVLO 앱의 AI 어시스턴트입니다. 사용자의 목표 달성 진행 상황을 분석하고 개선 방안을 제안해주세요.

응답 형식:
{
  "analysis": "진행 상황 분석",
  "achievements": ["달성한 것들"],
  "challenges": ["어려웠던 점들"],
  "improvements": ["개선 제안사항"],
  "nextSteps": ["다음 단계 추천"],
  "encouragement": "격려 메시지"
}`;

      const userMessage = `
목표: ${progressData.goal}
완료된 태스크: ${progressData.completedTasks}개
전체 태스크: ${progressData.totalTasks}개
소요 시간: ${progressData.timeSpent}분
어려웠던 점: ${progressData.difficulties?.join(', ') || '없음'}
만족도: ${progressData.satisfaction || '보통'}

진행 상황을 분석하고 앞으로의 방향을 제시해주세요.`;

      const result = await this.callOpenAI(systemPrompt, userMessage);

      result.generatedAt = new Date();
      result.progressPercentage = Math.round((progressData.completedTasks / progressData.totalTasks) * 100);

      logger.info(`진행 상황 분석 완료: ${result.progressPercentage}% 달성`);
      
      return result;

    } catch (error) {
      logger.error('진행 상황 분석 실패:', error);
      throw error;
    }
  }

  /**
   * 맞춤형 루틴 추천
   */
  async recommendRoutine(routineData) {
    try {
      logger.info(`루틴 추천 요청: ${routineData.category} 카테고리`);

      const systemPrompt = `당신은 FIVLO 앱의 AI 어시스턴트입니다. 사용자에게 맞춤형 루틴을 추천해주세요.

응답 형식:
{
  "routineName": "루틴 이름",
  "description": "루틴 설명",
  "duration": "총 소요 시간",
  "steps": [
    {
      "step": 1,
      "activity": "활동명",
      "duration": "소요 시간",
      "description": "상세 설명"
    }
  ],
  "benefits": ["효과1", "효과2"],
  "tips": ["실행 팁1", "실행 팁2"]
}`;

      const userMessage = `
카테고리: ${routineData.category}
목적: ${routineData.purpose || '미제공'}
가능 시간: ${routineData.timeLimit || '30분'}
경험 수준: ${routineData.level || '초보'}
선호도: ${routineData.preferences?.join(', ') || '없음'}

효과적인 루틴을 추천해주세요.`;

      const result = await this.callOpenAI(systemPrompt, userMessage);

      result.generatedAt = new Date();
      result.category = routineData.category;

      logger.info(`루틴 추천 완료: ${result.routineName}`);
      
      return result;

    } catch (error) {
      logger.error('루틴 추천 실패:', error);
      throw error;
    }
  }
}

module.exports = new AIGoalService();
