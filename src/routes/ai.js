/**
 * AI 목표 세분화 및 루틴 추천 API 라우터 v2.0
 * PDF 기획서 기반 새로운 API 명세 구현
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const aiService = require('../services/aiService');
const aiGoalService = require('../services/ai-goal-service');
const aiIntegrationService = require('../services/ai-integration-service');
const taskService = require('../services/taskService');
const logger = require('../utils/logger');

/**
 * @swagger
 * tags:
 *   name: AI
 *   description: AI 목표 세분화 및 루틴 추천 시스템
 */

// 10.1 AI 목표 세분화
router.post('/goals', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    const { goal, period, duration, hasDuration, startDate, endDate } = req.body;
    
    logger.info(`AI 목표 세분화 요청`, { userId, goal, period, duration });

    if (!goal || !period || !duration) {
      return res.status(400).json({
        error: '목표, 기간, 지속 여부는 필수 항목입니다.'
      });
    }

    // AI 서비스 호출
    const goalData = {
      goal,
      duration: period,
      currentSituation: '시작 단계',
      availableTime: '하루 2-3시간',
      experienceLevel: '초보'
    };

    const breakdown = await aiGoalService.breakdownGoal(goalData);
    
    logger.info(`AI 목표 세분화 완료`, { userId, taskCount: breakdown.tasks?.length || 0 });

    res.json({
      status: 'completed',
      goal: goal,
      period: period,
      analysis: breakdown.analysis,
      timeline: breakdown.timeline,
      difficulty: breakdown.difficulty,
      tasks: breakdown.tasks || [],
      tips: breakdown.tips || [],
      motivation: breakdown.motivation || '화이팅! 오분이가 응원해요!',
      estimatedTime: 0
    });

  } catch (error) {
    logger.error('AI 목표 세분화 실패', { 
      error: error.message, 
      userId: req.user?._id 
    });
    
    res.status(500).json({
      error: 'AI 목표 세분화에 실패했습니다.'
    });
  }
});

// 10.2 AI 목표 수정
router.patch('/goals/:goalId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    const { goalId } = req.params;
    const updateData = req.body;
    
    logger.info(`AI 목표 수정 요청`, { userId, goalId });

    // 임시 구현 - 실제로는 데이터베이스에서 목표를 찾아 수정
    const updatedGoal = {
      _id: goalId,
      ...updateData,
      updatedAt: new Date()
    };
    
    logger.info(`AI 목표 수정 완료`, { userId, goalId });

    res.json({
      goalId: updatedGoal._id,
      status: 'updated',
      weeklyPlan: updatedGoal.weeklyPlan || [],
      updatedAt: updatedGoal.updatedAt
    });

  } catch (error) {
    logger.error('AI 목표 수정 실패', { 
      error: error.message, 
      userId: req.user?._id,
      goalId: req.params.goalId 
    });
    
    res.status(500).json({
      error: 'AI 목표 수정에 실패했습니다.'
    });
  }
});

// 10.3 AI 목표를 TASK에 추가
router.post('/goals/:goalId/commit', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    const { goalId } = req.params;
    const { repeatType, startDate } = req.body;
    
    logger.info(`AI 목표 TASK 추가 요청`, { userId, goalId, repeatType, startDate });

    if (!repeatType || !startDate) {
      return res.status(400).json({
        error: '반복 유형과 시작 날짜는 필수 항목입니다.'
      });
    }

    // 임시 구현 - 실제로는 AI 목표를 Task로 변환
    const createdTasks = [
      {
        _id: 'task1',
        title: '목표 1단계 실행',
        date: startDate,
        repeatType: repeatType
      },
      {
        _id: 'task2',
        title: '목표 2단계 실행',
        date: startDate,
        repeatType: repeatType
      }
    ];
    
    logger.info(`AI 목표 TASK 추가 완료`, { 
      userId, goalId, taskCount: createdTasks.length 
    });

    res.status(201).json({
      message: 'AI 목표가 성공적으로 Task에 추가되었습니다.',
      tasksCreated: createdTasks.length,
      tasks: createdTasks.map(task => ({
        id: task._id,
        title: task.title,
        date: task.date,
        repeatType: task.repeatType
      }))
    });

  } catch (error) {
    logger.error('AI 목표 TASK 추가 실패', { 
      error: error.message, 
      userId: req.user?._id,
      goalId: req.params.goalId 
    });
    
    res.status(500).json({
      error: 'AI 목표를 Task에 추가하는데 실패했습니다.'
    });
  }
});

// 10.4 일일 스케줄 생성
router.post('/schedule', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    const { date, preferences } = req.body;
    
    logger.info(`AI 일일 스케줄 생성 요청`, { userId, date, preferences });

    if (!date || !preferences) {
      return res.status(400).json({
        error: '날짜와 선호도는 필수 항목입니다.'
      });
    }

    const scheduleData = {
      goals: preferences.goals || [],
      availableHours: preferences.availableHours || 8,
      preferredTime: preferences.preferredTime || '오전',
      targetDate: date
    };

    const schedule = await aiGoalService.generateDailySchedule(scheduleData);
    
    logger.info(`AI 일일 스케줄 생성 완료`, { userId, date });

    res.json({
      date,
      schedule: schedule.schedule || [
        { time: "09:00", activity: "집중 학습", duration: 25, type: "focus" },
        { time: "09:30", activity: "휴식", duration: 5, type: "break" }
      ],
      totalFocusTime: schedule.totalFocusTime || 25,
      pomodoroSessions: schedule.pomodoroSessions || 1,
      recommendations: schedule.recommendations || ["꾸준히 진행하세요"]
    });

  } catch (error) {
    logger.error('AI 일일 스케줄 생성 실패', { 
      error: error.message, 
      userId: req.user?._id 
    });
    
    res.status(500).json({
      error: 'AI 일일 스케줄 생성에 실패했습니다.'
    });
  }
});

// 10.5 루틴 추천
router.post('/routine', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    logger.info(`AI 루틴 추천 요청`, { userId });

    const routines = await aiService.generateRoutineRecommendations(userId);
    
    logger.info(`AI 루틴 추천 완료`, { userId });

    res.json({
      routines: routines || [
        {
          title: "아침 루틴",
          tasks: ["물 마시기", "스트레칭", "계획 세우기"],
          estimatedTime: 30
        },
        {
          title: "집중 루틴", 
          tasks: ["환경 정리", "목표 설정", "타이머 시작"],
          estimatedTime: 15
        }
      ]
    });

  } catch (error) {
    logger.error('AI 루틴 추천 실패', { 
      error: error.message, 
      userId: req.user?.userId 
    });
    
    res.status(500).json({
      error: 'AI 루틴 추천에 실패했습니다.'
    });
  }
});

// 10.6 동기부여 메시지
router.post('/motivation', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { context } = req.body;
    
    logger.info(`AI 동기부여 메시지 요청`, { userId, context });

    if (!context) {
      return res.status(400).json({
        error: '컨텍스트는 필수 항목입니다.'
      });
    }

    const message = await aiService.generateMotivationMessage(userId, context);
    
    logger.info(`AI 동기부여 메시지 생성 완료`, { userId, context });

    res.json({
      message: message || getDefaultMotivationMessage(context)
    });

  } catch (error) {
    logger.error('AI 동기부여 메시지 생성 실패', { 
      error: error.message, 
      userId: req.user?.userId 
    });
    
    res.status(500).json({
      error: 'AI 동기부여 메시지 생성에 실패했습니다.'
    });
  }
});

// 10.7 목표 진행률 분석
router.get('/goals/:goalId/analysis', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { goalId } = req.params;
    
    logger.info(`AI 목표 진행률 분석 요청`, { userId, goalId });

    const analysis = await aiGoalService.analyzeGoalProgress(userId, goalId);
    
    logger.info(`AI 목표 진행률 분석 완료`, { userId, goalId });

    res.json(analysis);

  } catch (error) {
    logger.error('AI 목표 진행률 분석 실패', { 
      error: error.message, 
      userId: req.user?.userId,
      goalId: req.params.goalId 
    });
    
    res.status(500).json({
      error: 'AI 목표 진행률 분석에 실패했습니다.'
    });
  }
});

// 10.8 AI 시스템 상태 확인
router.get('/health', authenticateToken, async (req, res) => {
  try {
    logger.info(`AI 시스템 상태 확인 요청`, { userId: req.user.userId });

    const health = await aiService.checkHealth();
    
    logger.info(`AI 시스템 상태 확인 완료`, { health });

    res.json({
      status: health?.status || 'healthy',
      responseTime: health?.responseTime || 250,
      apiQuotaRemaining: health?.apiQuotaRemaining || 85
    });

  } catch (error) {
    logger.error('AI 시스템 상태 확인 실패', { 
      error: error.message, 
      userId: req.user?.userId 
    });
    
    res.status(500).json({
      error: 'AI 시스템 상태 확인에 실패했습니다.'
    });
  }
});

// 유틸리티 함수들
function getDefaultMotivationMessage(context) {
  const messages = {
    'pomodoro_complete': '오늘도 25분 집중 완료! 꾸준함이 성공의 열쇠입니다 🎉',
    'task_failed': '실패는 성공의 어머니입니다. 다시 도전해보세요! 💪', 
    'weekly_review': '이번 주도 수고하셨습니다. 다음 주는 더 나은 결과를 만들어보세요! ✨'
  };
  
  return messages[context] || '오분이가 응원하고 있어요! 파이팅! 🌟';
}

module.exports = router;
