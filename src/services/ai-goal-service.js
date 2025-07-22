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
      // OpenAI API 키가 없거나 할당량 초과 시 폴백 처리
      if (!process.env.OPENAI_API_KEY) {
        logger.warn('OpenAI API 키가 설정되지 않아 폴백 응답을 사용합니다');
        return this.generateFallbackResponse(userMessage);
      }

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
      
      // API 할당량 초과나 기타 오류 시 폴백 응답 사용
      if (error.status === 429 || error.status === 401 || error.status === 402) {
        logger.warn('OpenAI API 할당량 초과 또는 인증 오류, 폴백 응답을 사용합니다');
        return this.generateFallbackResponse(userMessage);
      }
      
      throw new Error('AI 서비스 요청에 실패했습니다');
    }
  }

  /**
   * OpenAI API 실패 시 폴백 응답 생성
   */
  generateFallbackResponse(userMessage) {
    // 목표에서 키워드 추출
    const goalMatch = userMessage.match(/목표:\s*(.+)/);
    const goal = goalMatch ? goalMatch[1].trim() : '목표 달성';
    
    // 기간에서 키워드 추출
    const periodMatch = userMessage.match(/달성 기간:\s*(.+)/);
    const period = periodMatch ? periodMatch[1].trim() : '3개월';
    
    return {
      analysis: `"${goal}"은(는) 체계적인 계획과 꾸준한 실행이 중요한 목표입니다. 포모도로 기법을 활용하여 단계별로 접근하면 효과적으로 달성할 수 있습니다.`,
      timeline: period,
      difficulty: "medium",
      tasks: [
        {
          title: "기초 학습 계획 수립",
          description: "현재 수준 파악 및 학습 계획 세우기",
          estimatedTime: "1주",
          priority: "high",
          category: "study",
          week: 1
        },
        {
          title: "일일 학습 루틴 시작",
          description: "매일 25분씩 집중 학습 시간 확보",
          estimatedTime: "25분/일",
          priority: "high", 
          category: "study",
          week: 1
        },
        {
          title: "주간 진도 점검",
          description: "일주일마다 학습 진도 확인 및 조정",
          estimatedTime: "30분/주",
          priority: "medium",
          category: "study",
          week: 2
        },
        {
          title: "모의 테스트 실시",
          description: "실전 감각 익히기 위한 모의 테스트",
          estimatedTime: "2시간/회",
          priority: "high",
          category: "study", 
          week: 4
        }
      ],
      tips: [
        "포모도로 기법(25분 집중 + 5분 휴식)을 활용하세요",
        "매일 일정한 시간에 학습하여 습관을 만드세요",
        "목표를 작은 단위로 나누어 성취감을 느끼세요",
        "진행 상황을 기록하여 동기부여를 유지하세요"
      ],
      motivation: "🌟 오분이가 응원해요! 작은 실행이 큰 성과를 만듭니다. 매일 25분씩이라도 꾸준히 해보세요!"
    };
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

      let result;
      try {
        result = await this.callOpenAI(
          this.systemPrompts.dailySchedule,
          userMessage
        );
      } catch (error) {
        // OpenAI 실패 시 기본 스케줄 제공
        result = this.generateFallbackSchedule(scheduleData);
      }

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
   * 기본 일일 스케줄 생성 (폴백)
   */
  generateFallbackSchedule(scheduleData) {
    const availableHours = scheduleData.availableHours || 8;
    const pomodoroSessions = Math.min(Math.floor(availableHours * 2), 8); // 최대 8세션
    
    const schedule = [];
    let startHour = scheduleData.preferredTime === '오후' ? 14 : 9;
    
    for (let i = 0; i < pomodoroSessions; i++) {
      const hour = startHour + Math.floor(i * 0.5);
      const minute = (i % 2) * 30;
      
      schedule.push({
        time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
        activity: i % 4 === 0 ? "집중 학습" : i % 4 === 1 ? "실습 및 복습" : i % 4 === 2 ? "문제 풀이" : "정리 및 점검",
        duration: 25,
        type: "focus",
        description: "포모도로 기법으로 집중하여 진행"
      });
      
      // 휴식 시간 추가 (4세션마다 긴 휴식)
      if ((i + 1) % 4 === 0) {
        schedule.push({
          time: `${hour.toString().padStart(2, '0')}:${(minute + 25).toString().padStart(2, '0')}`,
          activity: "긴 휴식",
          duration: 30,
          type: "break",
          description: "충분한 휴식으로 재충전"
        });
      } else {
        schedule.push({
          time: `${hour.toString().padStart(2, '0')}:${(minute + 25).toString().padStart(2, '0')}`,
          activity: "짧은 휴식",
          duration: 5,
          type: "break", 
          description: "잠깐 쉬어가기"
        });
      }
    }
    
    return {
      schedule,
      pomodoroSessions,
      totalFocusTime: pomodoroSessions * 25,
      recommendations: [
        "25분 집중 + 5분 휴식을 꾸준히 지켜주세요",
        "4세션마다 15-30분 긴 휴식을 취하세요",
        "집중이 어려우면 환경을 점검해보세요"
      ]
    };
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

  /**
   * AI 목표 진행률 분석 (라우터에서 호출)
   */
  async analyzeGoalProgress(userId, goalId) {
    try {
      logger.info(`목표 진행률 분석 요청`, { userId, goalId });

      // 임시 데이터 - 실제로는 데이터베이스에서 목표 정보를 조회해야 함
      const mockGoalData = {
        goalId: goalId,
        title: "토익 900점 달성하기",
        startDate: "2025-07-22",
        targetDate: "2025-10-22",
        progress: 35,
        completedTasks: 7,
        totalTasks: 20,
        timeSpent: 850,
        focusTime: 650,
        averageDaily: 25,
        streakDays: 5,
        difficulties: ["어휘 암기 어려움", "리스닝 속도 따라가기 힘듦"],
        achievements: ["문법 기초 완료", "매일 학습 습관 형성"],
        satisfaction: "보통"
      };

      const systemPrompt = `당신은 FIVLO 앱의 AI 어시스턴트 "오분이"입니다. 사용자의 목표 달성 진행 상황을 분석하고 구체적인 개선 방안을 제안해주세요.

응답 형식:
{
  "summary": "진행 상황 요약",
  "progressAnalysis": "상세 분석",
  "strengths": ["잘하고 있는 점들"],
  "challenges": ["개선이 필요한 부분들"], 
  "recommendations": ["구체적인 개선 제안"],
  "nextMilestones": ["다음 단계 목표들"],
  "motivationalMessage": "격려 메시지",
  "estimatedCompletion": "예상 완료 시기"
}`;

      const userMessage = `
목표: ${mockGoalData.title}
시작일: ${mockGoalData.startDate}
목표일: ${mockGoalData.targetDate}
현재 진행률: ${mockGoalData.progress}%
완료된 작업: ${mockGoalData.completedTasks}/${mockGoalData.totalTasks}
총 투입 시간: ${mockGoalData.timeSpent}분
평균 일일 학습: ${mockGoalData.averageDaily}분
연속 달성: ${mockGoalData.streakDays}일
어려웠던 점: ${mockGoalData.difficulties.join(', ')}
달성한 것: ${mockGoalData.achievements.join(', ')}
만족도: ${mockGoalData.satisfaction}

진행 상황을 분석하고 앞으로의 개선 방향을 제시해주세요.`;

      let result;
      try {
        result = await this.callOpenAI(systemPrompt, userMessage);
      } catch (error) {
        // OpenAI 실패 시 폴백 분석 제공
        result = this.generateFallbackAnalysis(mockGoalData);
      }

      // 추가 메타데이터
      result.goalId = goalId;
      result.userId = userId;
      result.analysisDate = new Date();
      result.progressPercentage = mockGoalData.progress;
      result.completionRate = Math.round((mockGoalData.completedTasks / mockGoalData.totalTasks) * 100);

      logger.info(`목표 진행률 분석 완료`, { userId, goalId, progress: mockGoalData.progress });
      
      return result;

    } catch (error) {
      logger.error('목표 진행률 분석 실패:', error, { userId, goalId });
      throw error;
    }
  }

  /**
   * AI 분석 실패 시 기본 분석 제공
   */
  generateFallbackAnalysis(goalData) {
    return {
      summary: `현재 "${goalData.title}" 목표의 진행률은 ${goalData.progress}%입니다. ${goalData.streakDays}일 연속으로 꾸준히 진행하고 계시네요!`,
      progressAnalysis: `총 ${goalData.totalTasks}개 작업 중 ${goalData.completedTasks}개를 완료하여 ${Math.round((goalData.completedTasks/goalData.totalTasks)*100)}%의 완료율을 보이고 있습니다. 하루 평균 ${goalData.averageDaily}분씩 투자하여 총 ${goalData.timeSpent}분을 학습에 투입하셨습니다.`,
      strengths: [
        "꾸준한 학습 습관이 잘 형성되어 있습니다",
        "매일 일정한 시간을 투자하고 계십니다", 
        "연속 달성 기록을 유지하고 있습니다"
      ],
      challenges: [
        "학습 속도를 조금 더 높일 필요가 있습니다",
        "어려운 부분에 대한 전략적 접근이 필요합니다",
        "목표 달성을 위한 시간 투자량 증가 검토"
      ],
      recommendations: [
        "포모도로 세션을 하루 1-2개 더 추가해보세요",
        "어려운 부분은 작은 단위로 나누어 접근하세요",
        "주간 복습 시간을 따로 확보해보세요",
        "진행 상황을 시각적으로 확인할 수 있도록 기록하세요"
      ],
      nextMilestones: [
        "다음 주까지 50% 진행률 달성",
        "어휘 학습 전략 수립 및 실행",
        "모의 테스트 1회 실시"
      ],
      motivationalMessage: "🌟 벌써 ${goalData.progress}%나 진행하셨네요! 꾸준함이 가장 큰 힘입니다. 오분이가 끝까지 응원할게요!",
      estimatedCompletion: "현재 속도로 진행하면 약 ${Math.ceil((100-goalData.progress)/5)}주 후 목표 달성 가능합니다"
    };
  }
}

module.exports = new AIGoalService();
