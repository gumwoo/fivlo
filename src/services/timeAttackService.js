/**
 * 타임어택 서비스
 * AI 목표 분해 + 단계별 진행 타이머
 */

const TimeAttackSession = require('../models/TimeAttackSession');
const aiService = require('./aiService');
const logger = require('../utils/logger');

class TimeAttackService {
  /**
   * 타임어택 세션 생성
   * POST /api/time-attack/sessions
   */
  async createSession(userId, sessionData) {
    try {
      logger.info('타임어택 세션 생성 요청', { userId, goal: sessionData.goal });

      const {
        goal,
        totalTimeMinutes,
        steps = []
      } = sessionData;

      // AI로 목표 단계별 분해 (steps가 없는 경우)
      let processedSteps = steps;
      if (!steps || steps.length === 0) {
        try {
          const aiSteps = await aiService.breakdownGoal(goal, totalTimeMinutes);
          processedSteps = aiSteps;
        } catch (aiError) {
          logger.warn('AI 목표 분해 실패, 기본 단계 사용', { error: aiError.message });
          // AI 실패 시 기본 단계 생성
          processedSteps = [
            { name: '준비하기', duration: Math.floor(totalTimeMinutes * 0.1) },
            { name: goal, duration: Math.floor(totalTimeMinutes * 0.8) },
            { name: '마무리하기', duration: Math.floor(totalTimeMinutes * 0.1) }
          ];
        }
      }

      const session = new TimeAttackSession({
        userId,
        goal,
        totalMinutes: totalTimeMinutes,
        steps: processedSteps.map((step, index) => ({
          name: step.name,
          minutes: step.duration || step.minutes,
          order: index,
          completed: false
        })),
        currentStepIndex: 0,
        status: 'ready'
      });

      await session.save();

      logger.info('타임어택 세션 생성 완료', { 
        userId, 
        sessionId: session._id,
        goal,
        stepCount: processedSteps.length
      });

      return session;
    } catch (error) {
      logger.error('타임어택 세션 생성 실패', { 
        error: error.message, 
        userId, 
        sessionData 
      });
      throw error;
    }
  }

  /**
   * 타임어택 세션 시작
   * PUT /api/time-attack/sessions/{id}/start
   */
  async startSession(userId, sessionId) {
    try {
      logger.info('타임어택 세션 시작 요청', { userId, sessionId });

      const session = await TimeAttackSession.findOne({ _id: sessionId, userId });
      if (!session) {
        throw new Error('세션을 찾을 수 없습니다.');
      }

      if (session.status !== 'ready' && session.status !== 'paused') {
        throw new Error('세션을 시작할 수 없는 상태입니다.');
      }

      session.status = 'in_progress';
      session.startedAt = new Date();
      await session.save();

      logger.info('타임어택 세션 시작 완료', { userId, sessionId });

      return session;
    } catch (error) {
      logger.error('타임어택 세션 시작 실패', { 
        error: error.message, 
        userId, 
        sessionId 
      });
      throw error;
    }
  }

  /**
   * 타임어택 세션 완료
   * PUT /api/time-attack/sessions/{id}/complete
   */
  async completeSession(userId, sessionId) {
    try {
      logger.info('타임어택 세션 완료 요청', { userId, sessionId });

      const session = await TimeAttackSession.findOne({ _id: sessionId, userId });
      if (!session) {
        throw new Error('세션을 찾을 수 없습니다.');
      }

      session.status = 'completed';
      session.completedAt = new Date();
      
      // 실제 소요 시간 계산
      if (session.startedAt) {
        const duration = Math.floor((session.completedAt - session.startedAt) / 1000);
        session.actualDuration = duration;
      }

      await session.save();

      logger.info('타임어택 세션 완료', { 
        userId, 
        sessionId,
        actualTime: session.actualTimeMinutes
      });

      return session;
    } catch (error) {
      logger.error('타임어택 세션 완료 실패', { 
        error: error.message, 
        userId, 
        sessionId 
      });
      throw error;
    }
  }

  /**
   * 사용자 타임어택 세션 목록 조회
   */
  async getUserSessions(userId, limit = 20) {
    try {
      logger.info('타임어택 세션 목록 조회', { userId });

      const sessions = await TimeAttackSession.find({ userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .select('goal totalMinutes actualDuration status createdAt completedAt');

      logger.info('타임어택 세션 목록 조회 완료', { 
        userId, 
        sessionCount: sessions.length 
      });

      return sessions;
    } catch (error) {
      logger.error('타임어택 세션 목록 조회 실패', { 
        error: error.message, 
        userId 
      });
      throw error;
    }
  }
}

module.exports = new TimeAttackService();
