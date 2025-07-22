const logger = require('../utils/logger');

/**
 * Premium 기능 접근 제어 미들웨어
 * 유료 구독자만 접근할 수 있는 기능들을 제어합니다.
 */

// Premium 기능 목록 정의
const PREMIUM_FEATURES = {
  COINS: 'coins', // 코인 페이지
  LOCATION_REMINDERS: 'location_reminders', // 장소 기반 알림
  CUSTOMIZATION: 'customization', // 커스터마이징 상점
  DDAY_ANALYTICS: 'dday_analytics', // D-Day 분석
  ADVANCED_AI: 'advanced_ai', // 고급 AI 기능
  UNLIMITED_TASKS: 'unlimited_tasks', // 무제한 Task
  PREMIUM_THEMES: 'premium_themes', // 프리미엄 테마
  EXPORT_DATA: 'export_data', // 데이터 내보내기
  PRIORITY_SUPPORT: 'priority_support' // 우선 지원
};

/**
 * 기본 Premium 체크 미들웨어
 * 사용자의 구독 상태를 확인합니다.
 */
const checkPremiumStatus = async (req, res, next) => {
  try {
    const user = req.user;
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: '로그인이 필요합니다.'
      });
    }

    // 구독 상태 확인 및 업데이트
    const isPremiumActive = user.checkPremiumStatus();
    
    if (!isPremiumActive) {
      logger.warn(`Premium access denied for user ${user.id} - subscription inactive`, {
        userId: user.id,
        subscriptionStatus: user.subscriptionStatus,
        subscriptionEndDate: user.subscriptionEndDate
      });
      
      return res.status(402).json({
        success: false,
        error: 'PREMIUM_REQUIRED',
        message: '이 기능은 프리미엄 구독자만 이용할 수 있습니다.',
        subscriptionInfo: {
          status: user.subscriptionStatus,
          expiryDate: user.subscriptionEndDate,
          upgradeRequired: true
        }
      });
    }

    // Premium 사용자 정보를 request에 추가
    req.premiumUser = true;
    req.subscriptionInfo = user.subscriptionInfo;
    
    next();
    
  } catch (error) {
    logger.error('Premium middleware error:', error);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '구독 상태 확인 중 오류가 발생했습니다.'
    });
  }
};

/**
 * 특정 기능별 Premium 체크 미들웨어 생성
 */
const requirePremiumFeature = (feature) => {
  return async (req, res, next) => {
    try {
      const user = req.user;
      
      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'UNAUTHORIZED',
          message: '로그인이 필요합니다.'
        });
      }

      // 구독 상태 확인
      const isPremiumActive = user.checkPremiumStatus();
      
      if (!isPremiumActive) {
        logger.warn(`Feature access denied: ${feature}`, {
          userId: user.id,
          feature,
          subscriptionStatus: user.subscriptionStatus
        });
        
        return res.status(403).json({
          success: false,
          error: 'FEATURE_LOCKED',
          message: `${getFeatureDisplayName(feature)} 기능은 프리미엄 구독자만 이용할 수 있습니다.`,
          feature,
          subscriptionInfo: {
            status: user.subscriptionStatus,
            expiryDate: user.subscriptionEndDate,
            requiredPlan: 'premium'
          },
          upgradeUrl: '/billing/checkout'
        });
      }

      // 기능별 추가 제한 사항 확인
      const additionalCheck = await checkFeatureSpecificLimits(user, feature);
      if (!additionalCheck.allowed) {
        return res.status(403).json({
          success: false,
          error: 'FEATURE_LIMIT_EXCEEDED',
          message: additionalCheck.message,
          feature,
          limit: additionalCheck.limit
        });
      }

      // 기능 사용량 로깅
      await logFeatureUsage(user.id, feature);
      
      next();
      
    } catch (error) {
      logger.error(`Premium feature check error for ${feature}:`, error);
      return res.status(500).json({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: '기능 접근 권한 확인 중 오류가 발생했습니다.'
      });
    }
  };
};

/**
 * 기능별 특별 제한 사항 확인
 */
const checkFeatureSpecificLimits = async (user, feature) => {
  switch (feature) {
    case PREMIUM_FEATURES.LOCATION_REMINDERS:
      // 위치 기반 알림은 최대 10개까지 허용
      const Reminder = require('../models/Reminder');
      const locationRemindersCount = await Reminder.countDocuments({
        userId: user._id,
        location: { $exists: true, $ne: null }
      });
      
      if (locationRemindersCount >= 10) {
        return {
          allowed: false,
          message: '위치 기반 알림은 최대 10개까지 설정할 수 있습니다.',
          limit: { max: 10, current: locationRemindersCount }
        };
      }
      break;
      
    case PREMIUM_FEATURES.CUSTOMIZATION:
      // 커스터마이징 아이템은 코인 잔액 확인
      if (user.coins <= 0) {
        return {
          allowed: false,
          message: '아이템 구매를 위해서는 코인이 필요합니다.',
          limit: { required: 'coins', current: user.coins }
        };
      }
      break;
      
    case PREMIUM_FEATURES.UNLIMITED_TASKS:
      // 무료 사용자는 하루 최대 10개 Task 제한 (이미 Premium이므로 무제한)
      break;
      
    default:
      break;
  }
  
  return { allowed: true };
};

/**
 * 기능 사용량 로깅
 */
const logFeatureUsage = async (userId, feature) => {
  try {
    // 실제 구현에서는 사용량 통계 수집을 위한 로깅
    logger.info('Premium feature used', {
      userId,
      feature,
      timestamp: new Date(),
      type: 'feature_usage'
    });
    
    // TODO: 사용량 통계 DB 저장 (선택사항)
    
  } catch (error) {
    logger.warn('Feature usage logging failed:', error);
    // 로깅 실패는 기능 사용을 막지 않음
  }
};

/**
 * 기능 표시명 반환
 */
const getFeatureDisplayName = (feature) => {
  const displayNames = {
    [PREMIUM_FEATURES.COINS]: '코인 시스템',
    [PREMIUM_FEATURES.LOCATION_REMINDERS]: '장소 기반 알림',
    [PREMIUM_FEATURES.CUSTOMIZATION]: '오분이 커스터마이징',
    [PREMIUM_FEATURES.DDAY_ANALYTICS]: 'D-Day 목표 분석',
    [PREMIUM_FEATURES.ADVANCED_AI]: '고급 AI 기능',
    [PREMIUM_FEATURES.UNLIMITED_TASKS]: '무제한 할일 관리',
    [PREMIUM_FEATURES.PREMIUM_THEMES]: '프리미엄 테마',
    [PREMIUM_FEATURES.EXPORT_DATA]: '데이터 내보내기',
    [PREMIUM_FEATURES.PRIORITY_SUPPORT]: '우선 고객 지원'
  };
  
  return displayNames[feature] || '프리미엄 기능';
};

/**
 * 무료 사용자를 위한 기능 제한 미들웨어
 */
const checkFreeTierLimits = (resource, limit) => {
  return async (req, res, next) => {
    try {
      const user = req.user;
      
      // Premium 사용자는 제한 없음
      if (user.checkPremiumStatus()) {
        return next();
      }
      
      // 무료 사용자 제한 확인
      let currentUsage = 0;
      
      switch (resource) {
        case 'tasks_daily':
          const Task = require('../models/Task');
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);
          
          currentUsage = await Task.countDocuments({
            userId: user._id,
            date: { $gte: today, $lt: tomorrow }
          });
          break;
          
        case 'reminders_total':
          const Reminder = require('../models/Reminder');
          currentUsage = await Reminder.countDocuments({
            userId: user._id
          });
          break;
          
        case 'categories_total':
          const Category = require('../models/Category');
          currentUsage = await Category.countDocuments({
            userId: user._id,
            isDefault: false // 기본 카테고리는 제외
          });
          break;
          
        default:
          return next();
      }
      
      if (currentUsage >= limit) {
        logger.warn(`Free tier limit exceeded: ${resource}`, {
          userId: user.id,
          resource,
          currentUsage,
          limit
        });
        
        return res.status(429).json({
          success: false,
          error: 'FREE_TIER_LIMIT_EXCEEDED',
          message: `무료 플랜에서는 ${getResourceDisplayName(resource)}을(를) ${limit}개까지만 이용할 수 있습니다.`,
          limit: {
            resource,
            max: limit,
            current: currentUsage
          },
          upgradeMessage: '프리미엄으로 업그레이드하여 무제한 이용하세요.',
          upgradeUrl: '/billing/checkout'
        });
      }
      
      next();
      
    } catch (error) {
      logger.error(`Free tier limit check error for ${resource}:`, error);
      // 오류 발생 시에도 기능은 사용할 수 있도록 함
      next();
    }
  };
};

/**
 * 리소스 표시명 반환
 */
const getResourceDisplayName = (resource) => {
  const displayNames = {
    'tasks_daily': '하루 할일',
    'reminders_total': '알림',
    'categories_total': '사용자 정의 카테고리'
  };
  
  return displayNames[resource] || resource;
};

/**
 * Premium 전용 경로를 위한 express 라우터 래퍼
 */
const premiumRoute = (router) => {
  // 모든 요청에 Premium 체크 미들웨어 적용
  router.use(checkPremiumStatus);
  return router;
};

/**
 * 사용자의 Premium 상태 및 혜택 정보 반환
 */
const getPremiumStatus = (user) => {
  const isPremiumActive = user.checkPremiumStatus();
  
  return {
    isPremium: isPremiumActive,
    subscriptionStatus: user.subscriptionStatus,
    subscriptionPlan: user.subscriptionPlan,
    expiryDate: user.subscriptionEndDate,
    features: {
      coins: isPremiumActive,
      locationReminders: isPremiumActive,
      customization: isPremiumActive,
      ddayAnalytics: isPremiumActive,
      advancedAI: isPremiumActive,
      unlimitedTasks: isPremiumActive,
      premiumThemes: isPremiumActive,
      exportData: isPremiumActive,
      prioritySupport: isPremiumActive
    },
    benefits: isPremiumActive ? [
      '코인 시스템 이용',
      '장소 기반 알림 설정',
      '오분이 커스터마이징',
      'D-Day 목표 분석',
      '고급 AI 기능',
      '무제한 할일 관리',
      '프리미엄 테마',
      '데이터 내보내기',
      '우선 고객 지원'
    ] : []
  };
};

module.exports = {
  // 기본 미들웨어
  checkPremiumStatus,
  requirePremiumFeature,
  checkFreeTierLimits,
  premiumRoute,
  
  // 유틸리티 함수
  getPremiumStatus,
  getFeatureDisplayName,
  getResourceDisplayName,
  
  // 상수
  PREMIUM_FEATURES
};
