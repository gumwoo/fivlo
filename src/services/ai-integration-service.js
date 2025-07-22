const aiGoalService = require('./ai-goal-service');
const AIGoal = require('../models/AIGoal');
const Task = require('../models/Task');
const Category = require('../models/Category');
const logger = require('../utils/logger');

/**
 * AI 통합 서비스
 * AI 목표 세분화와 FIVLO 앱 기능을 연결
 */
class AIIntegrationService {
  
  /**
   * 목표 생성 및 세분화
   */
  async createAIGoal(userId, goalData) {
    try {
      logger.info(`AI 목표 생성 시작: 사용자=${userId}`);
      
      const startTime = Date.now();
      
      // AI로 목표 세분화
      const aiResult = await aiGoalService.breakdownGoal(goalData);
      
      const generationTime = Date.now() - startTime;
      
      // 데이터베이스에 저장
      const aiGoal = new AIGoal({
        userId,
        originalGoal: {
          goal: goalData.goal,
          duration: goalData.duration,
          currentSituation: goalData.currentSituation,
          availableTime: goalData.availableTime,
          experienceLevel: goalData.experienceLevel || '초보'
        },
        aiAnalysis: {
          analysis: aiResult.analysis,
          timeline: aiResult.timeline,
          difficulty: aiResult.difficulty,
          tips: aiResult.tips || [],
          motivation: aiResult.motivation
        },
        generatedTasks: aiResult.tasks || [],
        progress: {
          totalTasks: (aiResult.tasks || []).length
        },
        stats: {
          aiGenerationTime: generationTime
        }
      });
      
      await aiGoal.save();
      
      logger.info(`AI 목표 생성 완료: ${aiGoal._id}, ${aiResult.tasks?.length || 0}개 태스크`);
      
      return aiGoal;
      
    } catch (error) {
      logger.error(`AI 목표 생성 실패: 사용자=${userId}`, error);
      throw error;
    }
  }
  
  /**
   * AI 목표를 실제 Task로 변환
   */
  async convertToTasks(userId, aiGoalId, selectedTaskIndexes = null) {
    try {
      logger.info(`AI 태스크 변환 시작: 목표=${aiGoalId}`);
      
      const aiGoal = await AIGoal.findOne({ _id: aiGoalId, userId });
      if (!aiGoal) {
        throw new Error('AI 목표를 찾을 수 없습니다');
      }
      
      // 변환할 태스크 선택 (전체 또는 선택된 것들)
      const tasksToConvert = selectedTaskIndexes 
        ? aiGoal.generatedTasks.filter((_, index) => selectedTaskIndexes.includes(index))
        : aiGoal.generatedTasks;
      
      const createdTasks = [];
      
      for (const [originalIndex, aiTask] of aiGoal.generatedTasks.entries()) {
        // 선택된 태스크만 변환
        if (selectedTaskIndexes && !selectedTaskIndexes.includes(originalIndex)) {
          continue;
        }
        
        // 카테고리 찾기 또는 생성
        let category = await Category.findOne({ 
          userId, 
          name: this.mapCategoryName(aiTask.category) 
        });
        
        if (!category) {
          category = new Category({
            userId,
            name: this.mapCategoryName(aiTask.category),
            color: this.getCategoryColor(aiTask.category)
          });
          await category.save();
        }
        
        // Task 생성
        const task = new Task({
          userId,
          title: aiTask.title,
          description: aiTask.description,
          category: category._id,
          priority: this.mapPriority(aiTask.priority),
          estimatedTime: this.parseEstimatedTime(aiTask.estimatedTime),
          isRecurring: false,
          isGrowthAlbumLinked: false,
          aiGenerated: true,
          aiGoalId: aiGoal._id,
          aiTaskIndex: originalIndex
        });
        
        await task.save();
        createdTasks.push(task);
        
        // AI 목표와 연결
        await aiGoal.linkToTask(originalIndex, task._id);
      }
      
      // 상태 업데이트
      aiGoal.status = 'active';
      aiGoal.schedule.startDate = new Date();
      await aiGoal.save();
      
      logger.info(`AI 태스크 변환 완료: ${createdTasks.length}개 태스크 생성`);
      
      return {
        aiGoal,
        createdTasks,
        totalTasks: createdTasks.length
      };
      
    } catch (error) {
      logger.error(`AI 태스크 변환 실패: 목표=${aiGoalId}`, error);
      throw error;
    }
  }
  
  /**
   * 일일 스케줄 생성
   */
  async generateDailySchedule(userId, scheduleData) {
    try {
      logger.info(`일일 스케줄 생성: 사용자=${userId}`);
      
      // 사용자의 활성 목표들 조회
      const activeGoals = await AIGoal.getActiveGoals(userId);
      const goalTitles = activeGoals.map(goal => goal.originalGoal.goal);
      
      // 오늘의 미완료 Task들 조회
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      
      const todayTasks = await Task.find({
        userId,
        date: { $gte: today, $lt: tomorrow },
        isCompleted: false
      }).populate('category');
      
      const taskTitles = todayTasks.map(task => task.title);
      
      // AI에게 스케줄 요청
      const scheduleRequest = {
        goals: [...goalTitles, ...taskTitles],
        availableHours: scheduleData.availableHours || 8,
        preferredTime: scheduleData.preferredTime || '오전',
        focusType: scheduleData.focusType || '일반',
        breakPreference: scheduleData.breakPreference || '짧고 자주',
        targetDate: scheduleData.targetDate || new Date()
      };
      
      const aiSchedule = await aiGoalService.generateDailySchedule(scheduleRequest);
      
      logger.info(`일일 스케줄 생성 완료: ${aiSchedule.pomodoroSessions}개 세션`);
      
      return {
        schedule: aiSchedule,
        relatedTasks: todayTasks,
        relatedGoals: activeGoals
      };
      
    } catch (error) {
      logger.error(`일일 스케줄 생성 실패: 사용자=${userId}`, error);
      throw error;
    }
  }
  
  /**
   * 동기부여 메시지 생성
   */
  async generateMotivation(userId, context = '일반적인 격려') {
    try {
      logger.info(`동기부여 메시지 생성: 사용자=${userId}`);
      
      // 사용자의 최근 활동 분석
      const recentGoals = await AIGoal.find({ userId })
        .sort({ createdAt: -1 })
        .limit(3);
      
      const completedTasksToday = await Task.countDocuments({
        userId,
        isCompleted: true,
        completedAt: {
          $gte: new Date(new Date().setHours(0, 0, 0, 0))
        }
      });
      
      const motivationRequest = {
        context,
        progress: completedTasksToday > 0 ? '진행 중' : '시작 단계',
        currentGoal: recentGoals[0]?.originalGoal.goal || '없음',
        mood: '보통'
      };
      
      const motivation = await aiGoalService.generateMotivation(motivationRequest);
      
      logger.info('동기부여 메시지 생성 완료');
      
      return motivation;
      
    } catch (error) {
      logger.error(`동기부여 메시지 생성 실패: 사용자=${userId}`, error);
      throw error;
    }
  }
  
  /**
   * 진행 상황 분석
   */
  async analyzeProgress(userId, aiGoalId) {
    try {
      logger.info(`진행 상황 분석: 목표=${aiGoalId}`);
      
      const aiGoal = await AIGoal.findOne({ _id: aiGoalId, userId });
      if (!aiGoal) {
        throw new Error('AI 목표를 찾을 수 없습니다');
      }
      
      // 연결된 실제 Task들의 상태 확인
      const linkedTasks = await Task.find({
        aiGoalId: aiGoal._id,
        userId
      });
      
      const completedLinkedTasks = linkedTasks.filter(task => task.isCompleted);
      const totalTimeSpent = completedLinkedTasks.reduce((sum, task) => {
        return sum + (task.actualTime || task.estimatedTime || 0);
      }, 0);
      
      // 어려웠던 점들 수집
      const difficulties = [];
      if (completedLinkedTasks.length === 0) {
        difficulties.push('아직 시작하지 못함');
      } else if (completedLinkedTasks.length < linkedTasks.length * 0.5) {
        difficulties.push('예상보다 진행이 느림');
      }
      
      const progressRequest = {
        goal: aiGoal.originalGoal.goal,
        completedTasks: completedLinkedTasks.length,
        totalTasks: linkedTasks.length,
        timeSpent: totalTimeSpent,
        difficulties,
        satisfaction: '보통'
      };
      
      const analysis = await aiGoalService.analyzeProgress(progressRequest);
      
      // AI 목표 진행률 업데이트
      aiGoal.progress.completedTasks = completedLinkedTasks.length;
      aiGoal.progress.totalTasks = linkedTasks.length;
      aiGoal.progress.timeSpent = totalTimeSpent;
      await aiGoal.updateProgress();
      
      logger.info(`진행 상황 분석 완료: ${analysis.progressPercentage}% 달성`);
      
      return {
        analysis,
        aiGoal,
        linkedTasks,
        completedTasks: completedLinkedTasks
      };
      
    } catch (error) {
      logger.error(`진행 상황 분석 실패: 목표=${aiGoalId}`, error);
      throw error;
    }
  }
  
  /**
   * 루틴 추천
   */
  async recommendRoutine(userId, category, preferences = {}) {
    try {
      logger.info(`루틴 추천: 사용자=${userId}, 카테고리=${category}`);
      
      const routineRequest = {
        category,
        purpose: preferences.purpose || '미제공',
        timeLimit: preferences.timeLimit || '30분',
        level: preferences.level || '초보',
        preferences: preferences.activities || []
      };
      
      const routine = await aiGoalService.recommendRoutine(routineRequest);
      
      logger.info(`루틴 추천 완료: ${routine.routineName}`);
      
      return routine;
      
    } catch (error) {
      logger.error(`루틴 추천 실패: 사용자=${userId}`, error);
      throw error;
    }
  }
  
  /**
   * 사용자 AI 통계 조회
   */
  async getUserAIStats(userId) {
    try {
      logger.info(`AI 통계 조회: 사용자=${userId}`);
      
      const stats = await AIGoal.getUserStats(userId);
      
      // 최근 7일간 AI 활동
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      
      const recentActivity = await AIGoal.find({
        userId,
        createdAt: { $gte: weekAgo }
      }).countDocuments();
      
      // 가장 성공적인 난이도
      const difficultyAnalysis = await AIGoal.getDifficultyAnalysis();
      
      logger.info(`AI 통계 조회 완료: ${stats.totalGoals}개 목표`);
      
      return {
        stats,
        recentActivity,
        difficultyAnalysis,
        recommendations: this.getAIRecommendations(stats)
      };
      
    } catch (error) {
      logger.error(`AI 통계 조회 실패: 사용자=${userId}`, error);
      throw error;
    }
  }
  
  /**
   * AI 목표 목록 조회
   */
  async getAIGoals(userId, filters = {}) {
    try {
      logger.info(`AI 목표 목록 조회: 사용자=${userId}`);
      
      const { status, page = 1, limit = 10 } = filters;
      
      const query = { userId };
      if (status) query.status = status;
      
      const skip = (page - 1) * limit;
      
      const [goals, totalCount] = await Promise.all([
        AIGoal.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit)),
        AIGoal.countDocuments(query)
      ]);
      
      logger.info(`AI 목표 목록 조회 완료: ${goals.length}개`);
      
      return {
        goals,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalItems: totalCount,
          hasNext: page * limit < totalCount,
          hasPrev: page > 1
        }
      };
      
    } catch (error) {
      logger.error(`AI 목표 목록 조회 실패: 사용자=${userId}`, error);
      throw error;
    }
  }
  
  // 헬퍼 메서드들
  mapCategoryName(aiCategory) {
    const categoryMap = {
      'study': '공부',
      'exercise': '운동',
      'work': '업무',
      'habit': '습관',
      'other': '기타'
    };
    return categoryMap[aiCategory] || '기타';
  }
  
  getCategoryColor(aiCategory) {
    const colorMap = {
      'study': '#3B82F6',
      'exercise': '#EF4444',
      'work': '#10B981',
      'habit': '#8B5CF6',
      'other': '#6B7280'
    };
    return colorMap[aiCategory] || '#6B7280';
  }
  
  mapPriority(aiPriority) {
    const priorityMap = {
      'high': '높음',
      'medium': '보통',
      'low': '낮음'
    };
    return priorityMap[aiPriority] || '보통';
  }
  
  parseEstimatedTime(timeString) {
    // "25분", "1시간", "30분" 등을 분으로 변환
    if (!timeString) return 25;
    
    const match = timeString.match(/(\d+)(분|시간)/);
    if (!match) return 25;
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    return unit === '시간' ? value * 60 : value;
  }
  
  getAIRecommendations(stats) {
    const recommendations = [];
    
    if (stats.totalGoals === 0) {
      recommendations.push('첫 번째 AI 목표를 만들어보세요!');
    } else if (stats.completedGoals / stats.totalGoals < 0.5) {
      recommendations.push('목표를 더 작은 단위로 나누어 보세요');
    }
    
    if (stats.avgRating > 0 && stats.avgRating < 3) {
      recommendations.push('더 쉬운 난이도의 목표부터 시작해보세요');
    }
    
    return recommendations;
  }
}

module.exports = new AIIntegrationService();
