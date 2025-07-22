const User = require('../models/User');
const { verifyToken, extractTokenFromHeader } = require('../utils/jwt');
const logger = require('../utils/logger');

/**
 * JWT 토큰 인증 미들웨어
 * @param {Object} req - Express 요청 객체
 * @param {Object} res - Express 응답 객체  
 * @param {Function} next - 다음 미들웨어 함수
 */
const authenticateToken = async (req, res, next) => {
  try {
    // Authorization 헤더에서 토큰 추출
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);
    
    if (!token) {
      logger.warn('인증 실패: 토큰이 제공되지 않음', { 
        url: req.originalUrl,
        ip: req.ip 
      });
      return res.status(401).json({
        error: '인증이 필요합니다.',
        message: '액세스 토큰을 제공해주세요.'
      });
    }

    // 토큰 검증
    const decoded = verifyToken(token);
    
    // 사용자 정보 조회
    const user = await User.findById(decoded.userId);
    if (!user) {
      logger.warn('인증 실패: 사용자를 찾을 수 없음', { 
        userId: decoded.userId 
      });
      return res.status(401).json({
        error: '인증에 실패했습니다.',
        message: '사용자 정보를 찾을 수 없습니다.'
      });
    }

    // 계정 활성화 상태 확인
    if (!user.isActive) {
      logger.warn('인증 실패: 비활성화된 계정', { 
        userId: user._id 
      });
      return res.status(401).json({
        error: '계정이 비활성화되었습니다.',
        message: '관리자에게 문의해주세요.'
      });
    }

    // 사용자 정보를 req 객체에 추가
    req.user = user;
    req.token = token;
    
    // 마지막 활동 시간 업데이트 (비동기로 처리)
    user.updateLastActive().catch(err => {
      logger.error(`마지막 활동 시간 업데이트 실패: ${err.message}`, { 
        userId: user._id 
      });
    });

    logger.debug('인증 성공', { 
      userId: user._id,
      email: user.email,
      url: req.originalUrl 
    });

    next();
  } catch (error) {
    logger.error(`인증 미들웨어 오류: ${error.message}`, { 
      url: req.originalUrl,
      ip: req.ip 
    });
    
    return res.status(401).json({
      error: '인증에 실패했습니다.',
      message: error.message
    });
  }
};

/**
 * 선택적 인증 미들웨어 (토큰이 있으면 인증, 없어도 통과)
 * @param {Object} req - Express 요청 객체
 * @param {Object} res - Express 응답 객체
 * @param {Function} next - 다음 미들웨어 함수
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);
    
    if (!token) {
      // 토큰이 없어도 통과
      req.user = null;
      return next();
    }

    // 토큰이 있으면 검증 시도
    try {
      const decoded = verifyToken(token);
      const user = await User.findById(decoded.userId);
      
      if (user && user.isActive) {
        req.user = user;
        req.token = token;
        
        // 마지막 활동 시간 업데이트
        user.updateLastActive().catch(err => {
          logger.error(`마지막 활동 시간 업데이트 실패: ${err.message}`, { 
            userId: user._id 
          });
        });
      } else {
        req.user = null;
      }
    } catch (tokenError) {
      // 토큰 검증 실패해도 통과
      req.user = null;
    }

    next();
  } catch (error) {
    logger.error(`선택적 인증 미들웨어 오류: ${error.message}`);
    req.user = null;
    next();
  }
};

/**
 * 프리미엄 사용자 권한 확인 미들웨어
 * @param {Object} req - Express 요청 객체
 * @param {Object} res - Express 응답 객체
 * @param {Function} next - 다음 미들웨어 함수
 */
const requirePremium = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: '인증이 필요합니다.',
        message: '로그인 후 이용해주세요.'
      });
    }

    // 프리미엄 상태 확인
    const isPremiumActive = req.user.checkPremiumStatus();
    
    if (!isPremiumActive) {
      logger.warn('프리미엄 권한 부족', { 
        userId: req.user._id,
        isPremium: req.user.isPremium,
        premiumEndDate: req.user.premiumEndDate 
      });
      
      return res.status(403).json({
        error: '프리미엄 기능입니다.',
        message: '이 기능을 사용하려면 프리미엄 구독이 필요합니다.',
        upgradeRequired: true
      });
    }

    logger.debug('프리미엄 권한 확인 성공', { 
      userId: req.user._id 
    });

    next();
  } catch (error) {
    logger.error(`프리미엄 권한 확인 오류: ${error.message}`, { 
      userId: req.user?._id 
    });
    
    return res.status(500).json({
      error: '권한 확인 중 오류가 발생했습니다.',
      message: '잠시 후 다시 시도해주세요.'
    });
  }
};

/**
 * 관리자 권한 확인 미들웨어 (향후 확장용)
 * @param {Object} req - Express 요청 객체
 * @param {Object} res - Express 응답 객체
 * @param {Function} next - 다음 미들웨어 함수
 */
const requireAdmin = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: '인증이 필요합니다.',
        message: '로그인 후 이용해주세요.'
      });
    }

    // 관리자 권한 확인 (향후 User 모델에 role 필드 추가 시 구현)
    if (req.user.email !== 'admin@fivlo.com') {
      logger.warn('관리자 권한 부족', { 
        userId: req.user._id,
        email: req.user.email 
      });
      
      return res.status(403).json({
        error: '관리자 권한이 필요합니다.',
        message: '이 기능은 관리자만 사용할 수 있습니다.'
      });
    }

    next();
  } catch (error) {
    logger.error(`관리자 권한 확인 오류: ${error.message}`, { 
      userId: req.user?._id 
    });
    
    return res.status(500).json({
      error: '권한 확인 중 오류가 발생했습니다.',
      message: '잠시 후 다시 시도해주세요.'
    });
  }
};

/**
 * 이메일 인증 확인 미들웨어
 * @param {Object} req - Express 요청 객체
 * @param {Object} res - Express 응답 객체
 * @param {Function} next - 다음 미들웨어 함수
 */
const requireEmailVerified = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: '인증이 필요합니다.',
        message: '로그인 후 이용해주세요.'
      });
    }

    if (!req.user.isEmailVerified) {
      logger.warn('이메일 인증 필요', { 
        userId: req.user._id,
        email: req.user.email 
      });
      
      return res.status(403).json({
        error: '이메일 인증이 필요합니다.',
        message: '이메일 인증 후 이용해주세요.',
        emailVerificationRequired: true
      });
    }

    next();
  } catch (error) {
    logger.error(`이메일 인증 확인 오류: ${error.message}`, { 
      userId: req.user?._id 
    });
    
    return res.status(500).json({
      error: '인증 확인 중 오류가 발생했습니다.',
      message: '잠시 후 다시 시도해주세요.'
    });
  }
};

module.exports = {
  authenticateToken,
  optionalAuth,
  requirePremium,
  premiumMiddleware: requirePremium, // premiumMiddleware alias 추가
  requireAdmin,
  requireEmailVerified
};
