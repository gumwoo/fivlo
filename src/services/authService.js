const User = require('../models/User');
const { generateTokenPair, verifyToken } = require('../utils/jwt');
const logger = require('../utils/logger');
const crypto = require('crypto');

class AuthService {
  /**
   * 이메일로 회원가입
   * @param {Object} userData - 사용자 데이터
   * @returns {Object} 생성된 사용자와 토큰
   */
  async registerWithEmail(userData) {
    try {
      const { email, password, profileName, userType } = userData;

      // 이메일 중복 확인
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        throw new Error('이미 등록된 이메일입니다.');
      }

      // 새 사용자 생성
      const user = new User({
        email,
        password,
        profileName,
        userType,
        isEmailVerified: false,
        emailVerificationToken: crypto.randomBytes(32).toString('hex')
      });

      await user.save();

      // 토큰 생성
      const tokens = generateTokenPair(user);

      logger.info('이메일 회원가입 성공', { 
        userId: user._id,
        email: user.email,
        userType: user.userType 
      });

      return {
        user: user.toJSON(),
        tokens
      };
    } catch (error) {
      logger.error(`이메일 회원가입 실패: ${error.message}`, { 
        email: userData.email 
      });
      throw error;
    }
  }

  /**
   * 이메일로 로그인
   * @param {String} email - 이메일
   * @param {String} password - 비밀번호
   * @returns {Object} 사용자와 토큰
   */
  async loginWithEmail(email, password) {
    try {
      // 사용자 조회 (비밀번호 포함)
      const user = await User.findOne({ email }).select('+password');
      if (!user) {
        throw new Error('이메일 또는 비밀번호가 올바르지 않습니다.');
      }

      // 계정 활성화 상태 확인
      if (!user.isActive) {
        throw new Error('비활성화된 계정입니다. 관리자에게 문의해주세요.');
      }

      // 비밀번호 확인
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        throw new Error('이메일 또는 비밀번호가 올바르지 않습니다.');
      }

      // 마지막 로그인 시간 업데이트
      user.lastLoginAt = new Date();
      await user.save();

      // 토큰 생성
      const tokens = generateTokenPair(user);

      logger.info('이메일 로그인 성공', { 
        userId: user._id,
        email: user.email 
      });

      return {
        user: user.toJSON(),
        tokens
      };
    } catch (error) {
      logger.error(`이메일 로그인 실패: ${error.message}`, { 
        email 
      });
      throw error;
    }
  }

  /**
   * 소셜 로그인 (Google/Apple)
   * @param {Object} socialData - 소셜 로그인 데이터
   * @returns {Object} 사용자와 토큰
   */
  async loginWithSocial(socialData) {
    try {
      const { 
        socialId, 
        socialProvider, 
        email, 
        profileName, 
        profileImage,
        userType = 'focus'
      } = socialData;

      // 기존 소셜 계정 확인
      let user = await User.findOne({ 
        socialId, 
        socialProvider 
      });

      if (!user) {
        // 이메일로 기존 계정 확인
        const existingUser = await User.findOne({ email });
        if (existingUser) {
          // 기존 계정에 소셜 정보 연결
          existingUser.socialId = socialId;
          existingUser.socialProvider = socialProvider;
          if (profileImage && !existingUser.profileImage) {
            existingUser.profileImage = profileImage;
          }
          user = await existingUser.save();
        } else {
          // 새 소셜 계정 생성
          user = new User({
            email,
            socialId,
            socialProvider,
            profileName,
            profileImage,
            userType,
            isEmailVerified: true
          });
          await user.save();
        }
      }

      // 계정 활성화 상태 확인
      if (!user.isActive) {
        throw new Error('비활성화된 계정입니다. 관리자에게 문의해주세요.');
      }

      // 마지막 로그인 시간 업데이트
      user.lastLoginAt = new Date();
      await user.save();

      // 토큰 생성
      const tokens = generateTokenPair(user);

      logger.info('소셜 로그인 성공', { 
        userId: user._id,
        email: user.email,
        socialProvider 
      });

      return {
        user: user.toJSON(),
        tokens
      };
    } catch (error) {
      logger.error(`소셜 로그인 실패: ${error.message}`, { 
        socialProvider: socialData.socialProvider,
        email: socialData.email 
      });
      throw error;
    }
  }

  /**
   * 토큰 갱신
   * @param {String} refreshToken - 리프레시 토큰
   * @returns {Object} 새로운 토큰 세트
   */
  async refreshTokens(refreshToken) {
    try {
      // 리프레시 토큰 검증
      const decoded = verifyToken(refreshToken);
      
      if (decoded.type !== 'refresh') {
        throw new Error('유효하지 않은 리프레시 토큰입니다.');
      }

      // 사용자 조회
      const user = await User.findById(decoded.userId);
      if (!user || !user.isActive) {
        throw new Error('사용자를 찾을 수 없거나 비활성화된 계정입니다.');
      }

      // 새 토큰 생성
      const tokens = generateTokenPair(user);

      logger.info('토큰 갱신 성공', { 
        userId: user._id 
      });

      return {
        user: user.toJSON(),
        tokens
      };
    } catch (error) {
      logger.error(`토큰 갱신 실패: ${error.message}`);
      throw error;
    }
  }

  /**
   * 로그아웃
   * @param {String} userId - 사용자 ID
   * @param {String} refreshToken - 리프레시 토큰
   * @returns {Boolean} 로그아웃 성공 여부
   */
  async logout(userId, refreshToken) {
    try {
      // 리프레시 토큰 검증
      const decoded = verifyToken(refreshToken);
      
      if (decoded.type !== 'refresh' || decoded.userId !== userId) {
        throw new Error('유효하지 않은 리프레시 토큰입니다.');
      }

      // 사용자 조회
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('사용자를 찾을 수 없습니다.');
      }

      // 실제 토큰 무효화 로직은 JWT의 특성상 클라이언트에서 토큰을 삭제하는 것으로 처리
      // 필요시 블랙리스트나 토큰 저장소를 통해 무효화 가능

      logger.info('로그아웃 성공', { 
        userId: user._id 
      });

      return true;
    } catch (error) {
      logger.error(`로그아웃 실패: ${error.message}`, { userId });
      throw error;
    }
  }

  /**
   * 테스트 계정 생성/조회
   * @returns {Object} 테스트 계정과 토큰
   */
  async createTestAccount() {
    try {
      const user = await User.createTestAccount();
      const tokens = generateTokenPair(user);

      logger.info('테스트 계정 생성/조회 완료', { 
        userId: user._id,
        email: user.email 
      });

      return {
        user: user.toJSON(),
        tokens
      };
    } catch (error) {
      logger.error(`테스트 계정 생성 실패: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new AuthService();
