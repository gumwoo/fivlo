const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
require('dotenv').config();

const logger = require('./src/utils/logger');
const { initializeDatabase } = require('./src/config/database');

const app = express();
const PORT = process.env.PORT || 5000;

/**
 * 보안 미들웨어 설정
 */
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

/**
 * CORS 설정
 */
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'http://localhost:19006'
  ],
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

/**
 * Rate Limiting 설정
 */
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15분
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // 요청 제한
  message: {
    error: '너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해주세요.',
    retryAfter: '15분'
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

/**
 * 요청 로깅 미들웨어
 */
app.use(morgan('combined', { stream: logger.stream }));

/**
 * 요청 파싱 미들웨어
 */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/**
 * 정적 파일 서빙 (이미지 업로드)
 */
app.use('/uploads', express.static('uploads'));

/**
 * 요청 로깅 미들웨어 (커스텀)
 */
app.use((req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info(`${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms`);
  });
  
  next();
});

/**
 * 기본 라우트
 */
app.get('/', (req, res) => {
  logger.info('기본 라우트 접근');
  res.json({
    message: 'FIVLO 백엔드 API 서버가 정상 작동 중입니다! 🎯',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    features: [
      '포모도로 타이머',
      'Task 관리',
      '집중도 분석',
      '망각방지 알림',
      '오분이 커스터마이징'
    ]
  });
});

/**
 * 헬스체크 라우트
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage()
  });
});

/**
 * API 라우트 (2025-07-22 PDF 기획서 기반 업데이트)
 */

// 인증 관련 API
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/users', require('./src/routes/auth'));
app.use('/api/billing', require('./src/routes/auth'));

// 코인 시스템 API (Premium 전용)
app.use('/api/coins', require('./src/routes/coins'));

// 포모도로 & 타임어택 API
app.use('/api/pomodoro', require('./src/routes/pomodoro'));
app.use('/api/time-attack', require('./src/routes/timeAttack'));

// Task 관리 & 성장앨범 API (새로운 버전)
app.use('/api/tasks', require('./src/routes/task'));
app.use('/api/categories', require('./src/routes/task'));
app.use('/api/albums', require('./src/routes/task'));

// 망각방지 알림 API (새로운 버전)
app.use('/api/reminders', require('./src/routes/reminders'));

// 집중도 분석 API (새로운 버전)
app.use('/api/analytics', require('./src/routes/analytics'));

// AI 기능 API (새로운 버전)
app.use('/api/ai', require('./src/routes/ai'));

// 커스터마이징 관련 API (새로운 버전)
app.use('/api/shop', require('./src/routes/shop'));
app.use('/api/inventory', require('./src/routes/shop'));
app.use('/api/avatar', require('./src/routes/shop'));

// 레거시 API (호환성 유지)
app.use('/api/task', require('./src/routes/task')); // 기존 호환성
app.use('/api/reminder', require('./src/routes/reminder')); // 기존 호환성
app.use('/api/analysis', require('./src/routes/analysis')); // 기존 호환성
app.use('/api/customization', require('./src/routes/customization')); // 기존 호환성

/**
 * Swagger API 문서
 */
const { specs, swaggerUi } = require('./src/config/swagger');
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
  explorer: true,
  swaggerOptions: {
    persistAuthorization: true,
  }
}));

/**
 * 404 에러 핸들러
 */
app.use('*', (req, res) => {
  logger.warn(`404 에러: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    error: '요청하신 엔드포인트를 찾을 수 없습니다.',
    message: `${req.method} ${req.originalUrl}는 존재하지 않는 경로입니다.`
  });
});

/**
 * 전역 에러 핸들러
 */
app.use((error, req, res, next) => {
  logger.error(`서버 에러: ${error.message}`, { 
    stack: error.stack,
    url: req.originalUrl,
    method: req.method
  });
  
  res.status(error.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? '서버 내부 오류가 발생했습니다.' 
      : error.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: error.stack })
  });
});

/**
 * 서버 시작
 */
const startServer = async () => {
  try {
    logger.info('FIVLO 백엔드 서버 시작 중...');
    
    // 데이터베이스 연결
    await initializeDatabase();
    
    // 스케줄러 시작
    try {
      const schedulerService = require('./src/utils/scheduler');
      await schedulerService.start();
      logger.info('⏰ 알림 스케줄러 시작 완료');
    } catch (schedulerError) {
      logger.error(`스케줄러 시작 실패: ${schedulerError.message}`);
      // 스케줄러 실패해도 서버는 계속 시작
    }
    
    // Express 서버 시작
    const server = app.listen(PORT, () => {
      logger.info(`🚀 FIVLO 서버가 포트 ${PORT}에서 실행 중입니다!`);
      logger.info(`📍 서버 URL: http://localhost:${PORT}`);
      logger.info(`🌍 환경: ${process.env.NODE_ENV}`);
    });

    // 서버 종료 시그널 처리
    process.on('SIGTERM', () => {
      logger.info('SIGTERM 신호 수신, 서버 종료 중...');
      server.close(() => {
        logger.info('서버가 정상적으로 종료되었습니다.');
      });
    });

  } catch (error) {
    logger.error(`서버 시작 실패: ${error.message}`);
    process.exit(1);
  }
};

// 예상치 못한 예외 처리
process.on('uncaughtException', (error) => {
  logger.error(`Uncaught Exception: ${error.message}`, { stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error(`Unhandled Rejection at:`, promise, 'reason:', reason);
  process.exit(1);
});

// 서버 시작
startServer();

module.exports = app;
