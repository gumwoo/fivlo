const express = require('express');
const { body, validationResult } = require('express-validator');
const authService = require('../services/authService');
const billingService = require('../services/billingService');
const { authenticateToken } = require('../middleware/auth');
const { getPremiumStatus } = require('../middleware/premiumMiddleware');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Authentication
 *   description: 사용자 인증 및 구독 관리
 */

/**
 * 유효성 검사 에러 처리 미들웨어
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn('유효성 검사 실패', { 
      errors: errors.array(),
      url: req.originalUrl,
      ip: req.ip
    });
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: '입력값이 올바르지 않습니다.',
      details: errors.array()
    });
  }
  next();
};

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: 이메일 회원가입 (온보딩 5-7 페이지)
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - profileName
 *               - userType
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: 사용자 이메일
 *               password:
 *                 type: string
 *                 minLength: 6
 *                 description: 비밀번호 (최소 6자)
 *               profileName:
 *                 type: string
 *                 maxLength: 50
 *                 description: 사용자 이름
 *               userType:
 *                 type: string
 *                 enum: [집중력개선, 루틴형성, 목표관리]
 *                 description: 사용자 유형 (온보딩에서 선택)
 *     responses:
 *       201:
 *         description: 회원가입 성공, JWT 토큰 발급
 */
router.post('/register',
  [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('유효한 이메일을 입력해주세요.'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('비밀번호는 최소 6자 이상이어야 합니다.'),
    body('profileName')
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('이름은 1-50자 사이로 입력해주세요.'),
    body('userType')
      .isIn(['집중력개선', '루틴형성', '목표관리'])
      .withMessage('올바른 사용자 유형을 선택해주세요.')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { email, password, profileName, userType } = req.body;
      
      logger.info('이메일 회원가입 시도', { 
        email, 
        userType,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      const result = await authService.registerWithEmail({
        email,
        password, 
        profileName,
        userType
      });

      logger.info('회원가입 성공', { 
        userId: result.user.id,
        email: result.user.email,
        userType: result.user.userType
      });

      res.status(201).json({
        success: true,
        message: '회원가입이 완료되었습니다.',
        user: result.user,
        tokens: result.tokens
      });

    } catch (error) {
      logger.error('회원가입 오류:', error);
      
      if (error.code === 11000) {
        return res.status(409).json({
          success: false,
          error: 'EMAIL_ALREADY_EXISTS',
          message: '이미 가입된 이메일입니다.'
        });
      }

      res.status(500).json({
        success: false,
        error: 'REGISTRATION_FAILED',
        message: '회원가입 중 오류가 발생했습니다.'
      });
    }
  }
);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: 이메일 로그인
 *     tags: [Authentication]
 */
router.post('/login',
  [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('유효한 이메일을 입력해주세요.'),
    body('password')
      .notEmpty()
      .withMessage('비밀번호를 입력해주세요.')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { email, password } = req.body;

      logger.info('이메일 로그인 시도', { 
        email,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      const result = await authService.loginWithEmail(email, password);

      logger.info('로그인 성공', { 
        userId: result.user.id,
        email: result.user.email,
        subscriptionStatus: result.user.subscriptionStatus
      });

      res.json({
        success: true,
        message: '로그인되었습니다.',
        user: result.user,
        tokens: result.tokens
      });

    } catch (error) {
      logger.error('로그인 오류:', error);

      if (error.message === 'INVALID_CREDENTIALS') {
        return res.status(401).json({
          success: false,
          error: 'INVALID_CREDENTIALS', 
          message: '이메일 또는 비밀번호가 올바르지 않습니다.'
        });
      }

      if (error.message === 'ACCOUNT_NOT_FOUND') {
        return res.status(404).json({
          success: false,
          error: 'ACCOUNT_NOT_FOUND',
          message: '존재하지 않는 계정입니다.'
        });
      }

      res.status(500).json({
        success: false,
        error: 'LOGIN_FAILED',
        message: '로그인 중 오류가 발생했습니다.'
      });
    }
  }
);

/**
 * @swagger
 * /api/auth/google:
 *   post:
 *     summary: Google OAuth 로그인
 *     tags: [Authentication]
 */
router.post('/google',
  [
    body('idToken')
      .notEmpty()
      .withMessage('Google ID Token이 필요합니다.'),
    body('userType')
      .optional()
      .isIn(['집중력개선', '루틴형성', '목표관리'])
      .withMessage('올바른 사용자 유형을 선택해주세요.')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { idToken, userType } = req.body;

      logger.info('Google OAuth 로그인 시도', { 
        userType,
        ip: req.ip
      });

      const result = await authService.loginWithGoogle({ idToken, userType });

      logger.info('Google 로그인 성공', {
        userId: result.user.id,
        email: result.user.email,
        isNewUser: result.isNewUser
      });

      res.json({
        success: true,
        message: result.isNewUser ? '회원가입이 완료되었습니다.' : '로그인되었습니다.',
        user: result.user,
        tokens: result.tokens,
        isNewUser: result.isNewUser
      });

    } catch (error) {
      logger.error('Google 로그인 오류:', error);

      if (error.message === 'INVALID_GOOGLE_TOKEN') {
        return res.status(401).json({
          success: false,
          error: 'INVALID_GOOGLE_TOKEN',
          message: '유효하지 않은 Google 토큰입니다.'
        });
      }

      res.status(500).json({
        success: false,
        error: 'GOOGLE_LOGIN_FAILED',
        message: 'Google 로그인 중 오류가 발생했습니다.'
      });
    }
  }
);

/**
 * @swagger
 * /api/auth/apple:
 *   post:
 *     summary: Apple OAuth 로그인  
 *     tags: [Authentication]
 */
router.post('/apple',
  [
    body('identityToken')
      .notEmpty()
      .withMessage('Apple Identity Token이 필요합니다.'),
    body('userType')
      .optional()
      .isIn(['집중력개선', '루틴형성', '목표관리'])
      .withMessage('올바른 사용자 유형을 선택해주세요.')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { identityToken, userType } = req.body;

      logger.info('Apple OAuth 로그인 시도', { 
        userType,
        ip: req.ip
      });

      const result = await authService.loginWithApple({ identityToken, userType });

      logger.info('Apple 로그인 성공', {
        userId: result.user.id,
        email: result.user.email,
        isNewUser: result.isNewUser
      });

      res.json({
        success: true,
        message: result.isNewUser ? '회원가입이 완료되었습니다.' : '로그인되었습니다.',
        user: result.user,
        tokens: result.tokens,
        isNewUser: result.isNewUser
      });

    } catch (error) {
      logger.error('Apple 로그인 오류:', error);

      if (error.message === 'INVALID_APPLE_TOKEN') {
        return res.status(401).json({
          success: false,
          error: 'INVALID_APPLE_TOKEN',
          message: '유효하지 않은 Apple 토큰입니다.'
        });
      }

      res.status(500).json({
        success: false,
        error: 'APPLE_LOGIN_FAILED',
        message: 'Apple 로그인 중 오류가 발생했습니다.'
      });
    }
  }
);

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: 액세스·리프레시 토큰 재발급
 *     tags: [Authentication]
 */
router.post('/refresh',
  [
    // refreshToken은 body 또는 Authorization 헤더에서 받음
  ],
  async (req, res) => {
    try {
      // Body에서 먼저 확인, 없으면 Authorization 헤더에서 추출
      let refreshToken = req.body.refreshToken;
      
      if (!refreshToken) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          refreshToken = authHeader.substring(7);
        }
      }

      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: '입력값이 올바르지 않습니다.',
          details: [{
            type: 'field',
            msg: '리프레시 토큰이 필요합니다.',
            path: 'refreshToken',
            location: 'body'
          }]
        });
      }

      logger.info('토큰 재발급 요청', { 
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      const result = await authService.refreshTokens(refreshToken);

      logger.info('토큰 재발급 성공', { 
        userId: result.userId
      });

      res.json({
        success: true,
        message: '토큰이 재발급되었습니다.',
        tokens: result.tokens
      });

    } catch (error) {
      logger.error('토큰 재발급 오류:', error);

      if (error.message === 'INVALID_REFRESH_TOKEN') {
        return res.status(401).json({
          success: false,
          error: 'INVALID_REFRESH_TOKEN',
          message: '유효하지 않은 리프레시 토큰입니다.'
        });
      }

      if (error.message === 'REFRESH_TOKEN_EXPIRED') {
        return res.status(401).json({
          success: false,
          error: 'REFRESH_TOKEN_EXPIRED',
          message: '리프레시 토큰이 만료되었습니다. 다시 로그인해주세요.'
        });
      }

      res.status(500).json({
        success: false,
        error: 'TOKEN_REFRESH_FAILED',
        message: '토큰 재발급 중 오류가 발생했습니다.'
      });
    }
  }
);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: 리프레시 토큰 폐기
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 */
router.post('/logout',
  authenticateToken,
  [
    body('refreshToken')
      .notEmpty()
      .withMessage('리프레시 토큰이 필요합니다.')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { refreshToken } = req.body;
      const userId = req.user.id;

      logger.info('로그아웃 요청', { 
        userId,
        ip: req.ip
      });

      await authService.logout(userId, refreshToken);

      logger.info('로그아웃 성공', { 
        userId
      });

      res.json({
        success: true,
        message: '로그아웃되었습니다.'
      });

    } catch (error) {
      logger.error('로그아웃 오류:', error);

      res.status(500).json({
        success: false,
        error: 'LOGOUT_FAILED',
        message: '로그아웃 중 오류가 발생했습니다.'
      });
    }
  }
);

/**
 * @swagger
 * /api/users/me/subscription:
 *   get:
 *     summary: 사용자 구독 정보 조회 (free / premium 등급, 만료일)
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 */
router.get('/me/subscription',
  authenticateToken,
  async (req, res) => {
    try {
      const user = req.user;
      
      // 구독 상태 최신화
      user.checkPremiumStatus();
      
      const premiumStatus = getPremiumStatus(user);

      logger.info('구독 정보 조회', { 
        userId: user.id,
        subscriptionStatus: user.subscriptionStatus
      });

      res.json({
        success: true,
        subscriptionStatus: user.subscriptionStatus,
        subscriptionPlan: user.subscriptionPlan,
        expiryDate: user.subscriptionEndDate,
        coins: user.coins,
        features: premiumStatus.features,
        benefits: premiumStatus.benefits
      });

    } catch (error) {
      logger.error('구독 정보 조회 오류:', error);

      res.status(500).json({
        success: false,
        error: 'SUBSCRIPTION_INFO_FAILED',
        message: '구독 정보 조회 중 오류가 발생했습니다.'
      });
    }
  }
);

/**
 * @swagger
 * /api/billing/checkout:
 *   post:
 *     summary: 구독 결제 세션 생성 (잠금 해제 트리거)
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 */
router.post('/billing/checkout',
  authenticateToken,
  [
    body('plan')
      .isIn(['premium_monthly', 'premium_yearly'])
      .withMessage('올바른 구독 플랜을 선택해주세요.'),
    body('returnUrl')
      .optional()
      .isURL()
      .withMessage('올바른 리턴 URL을 입력해주세요.'),
    body('cancelUrl')
      .optional()
      .isURL()
      .withMessage('올바른 취소 URL을 입력해주세요.')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { plan, returnUrl, cancelUrl } = req.body;
      const userId = req.user.id;

      logger.info('결제 세션 생성 요청', { 
        userId,
        plan,
        ip: req.ip
      });

      const checkoutSession = await billingService.createCheckoutSession({
        userId,
        plan,
        returnUrl,
        cancelUrl
      });

      logger.info('결제 세션 생성 성공', { 
        userId,
        sessionId: checkoutSession.id
      });

      res.json({
        success: true,
        message: '결제 세션이 생성되었습니다.',
        checkoutUrl: checkoutSession.url,
        sessionId: checkoutSession.id
      });

    } catch (error) {
      logger.error('결제 세션 생성 오류:', error);

      res.status(500).json({
        success: false,
        error: 'CHECKOUT_SESSION_FAILED',
        message: '결제 세션 생성 중 오류가 발생했습니다.'
      });
    }
  }
);

/**
 * @swagger
 * /api/billing/webhook:
 *   post:
 *     summary: PG 웹훅 - 결제 성공 시 premium 승격
 *     tags: [Authentication]
 */
router.post('/billing/webhook',
  async (req, res) => {
    try {
      const webhookData = req.body;

      logger.info('결제 웹훅 수신', { 
        event: webhookData.event,
        userId: webhookData.userId,
        ip: req.ip
      });

      const result = await billingService.handleWebhook(webhookData);

      logger.info('웹훅 처리 성공', { 
        event: webhookData.event,
        userId: webhookData.userId,
        result
      });

      res.json({
        success: true,
        message: '웹훅이 처리되었습니다.',
        result
      });

    } catch (error) {
      logger.error('웹훅 처리 오류:', error);

      res.status(500).json({
        success: false,
        error: 'WEBHOOK_PROCESSING_FAILED',
        message: '웹훅 처리 중 오류가 발생했습니다.'
      });
    }
  }
);

module.exports = router;
