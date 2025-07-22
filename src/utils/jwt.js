const jwt = require('jsonwebtoken');
const logger = require('./logger');

/**
 * JWT 토큰 생성
 * @param {Object} payload - 토큰에 포함될 데이터
 * @param {String} expiresIn - 만료 시간 (기본값: 환경변수 또는 24h)
 * @returns {String} JWT 토큰
 */
const generateToken = (payload, expiresIn = null) => {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET이 설정되지 않았습니다.');
    }

    const options = {
      expiresIn: expiresIn || process.env.JWT_EXPIRE || '24h',
      issuer: 'fivlo-backend',
      audience: 'fivlo-app'
    };

    const token = jwt.sign(payload, secret, options);
    logger.info(`JWT 토큰 생성: ${payload.userId}`, { 
      userId: payload.userId,
      expiresIn: options.expiresIn 
    });
    
    return token;
  } catch (error) {
    logger.error(`JWT 토큰 생성 실패: ${error.message}`);
    throw new Error('토큰 생성에 실패했습니다.');
  }
};

/**
 * 리프레시 토큰 생성
 * @param {Object} payload - 토큰에 포함될 데이터  
 * @returns {String} 리프레시 토큰
 */
const generateRefreshToken = (payload) => {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET이 설정되지 않았습니다.');
    }

    const options = {
      expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d',
      issuer: 'fivlo-backend',
      audience: 'fivlo-app'
    };

    const refreshToken = jwt.sign({
      ...payload,
      type: 'refresh'
    }, secret, options);

    logger.info(`리프레시 토큰 생성: ${payload.userId}`, { 
      userId: payload.userId,
      expiresIn: options.expiresIn 
    });
    
    return refreshToken;
  } catch (error) {
    logger.error(`리프레시 토큰 생성 실패: ${error.message}`);
    throw new Error('리프레시 토큰 생성에 실패했습니다.');
  }
};

/**
 * JWT 토큰 검증
 * @param {String} token - 검증할 토큰
 * @returns {Object} 디코딩된 페이로드
 */
const verifyToken = (token) => {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET이 설정되지 않았습니다.');
    }

    const decoded = jwt.verify(token, secret, {
      issuer: 'fivlo-backend',
      audience: 'fivlo-app'
    });

    logger.debug(`JWT 토큰 검증 성공: ${decoded.userId}`);
    return decoded;
  } catch (error) {
    logger.warn(`JWT 토큰 검증 실패: ${error.message}`, { token: token?.substring(0, 20) });
    
    if (error.name === 'TokenExpiredError') {
      throw new Error('토큰이 만료되었습니다.');
    } else if (error.name === 'JsonWebTokenError') {
      throw new Error('유효하지 않은 토큰입니다.');
    } else if (error.name === 'NotBeforeError') {
      throw new Error('토큰이 아직 활성화되지 않았습니다.');
    } else {
      throw new Error('토큰 검증에 실패했습니다.');
    }
  }
};

/**
 * 토큰에서 사용자 ID 추출 (검증 없이)
 * @param {String} token - 토큰
 * @returns {String|null} 사용자 ID
 */
const extractUserIdFromToken = (token) => {
  try {
    const decoded = jwt.decode(token);
    return decoded?.userId || null;
  } catch (error) {
    logger.warn(`토큰에서 사용자 ID 추출 실패: ${error.message}`);
    return null;
  }
};

/**
 * 토큰 만료 시간 확인
 * @param {String} token - 토큰
 * @returns {Date|null} 만료 시간
 */
const getTokenExpiration = (token) => {
  try {
    const decoded = jwt.decode(token);
    if (!decoded?.exp) return null;
    
    return new Date(decoded.exp * 1000);
  } catch (error) {
    logger.warn(`토큰 만료 시간 확인 실패: ${error.message}`);
    return null;
  }
};

/**
 * 토큰이 곧 만료되는지 확인
 * @param {String} token - 토큰
 * @param {Number} thresholdMinutes - 임계값 (분, 기본값: 30분)
 * @returns {Boolean} 곧 만료되는지 여부
 */
const isTokenExpiringSoon = (token, thresholdMinutes = 30) => {
  try {
    const expirationDate = getTokenExpiration(token);
    if (!expirationDate) return true;
    
    const now = new Date();
    const thresholdMs = thresholdMinutes * 60 * 1000;
    
    return (expirationDate.getTime() - now.getTime()) < thresholdMs;
  } catch (error) {
    logger.warn(`토큰 만료 임박 확인 실패: ${error.message}`);
    return true;
  }
};

/**
 * 액세스 토큰과 리프레시 토큰 세트 생성
 * @param {Object} user - 사용자 객체
 * @returns {Object} { accessToken, refreshToken, expiresIn }
 */
const generateTokenPair = (user) => {
  const payload = {
    userId: user._id.toString(),
    email: user.email,
    isPremium: user.isPremium,
    userType: user.userType
  };

  const accessToken = generateToken(payload);
  const refreshToken = generateRefreshToken({ userId: user._id.toString() });
  
  const expirationDate = getTokenExpiration(accessToken);
  
  return {
    accessToken,
    refreshToken,
    expiresIn: expirationDate ? Math.floor((expirationDate.getTime() - Date.now()) / 1000) : null,
    tokenType: 'Bearer'
  };
};

/**
 * Authorization 헤더에서 토큰 추출
 * @param {String} authHeader - Authorization 헤더 값
 * @returns {String|null} 추출된 토큰
 */
const extractTokenFromHeader = (authHeader) => {
  if (!authHeader) return null;
  
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }
  
  return parts[1];
};

module.exports = {
  generateToken,
  generateRefreshToken,
  verifyToken,
  extractUserIdFromToken,
  getTokenExpiration,
  isTokenExpiringSoon,
  generateTokenPair,
  extractTokenFromHeader
};
