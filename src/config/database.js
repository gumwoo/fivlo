const mongoose = require('mongoose');
const redis = require('redis');
const logger = require('../utils/logger');

/**
 * MongoDB 연결 설정
 */
const connectMongoDB = async () => {
  try {
    logger.info('MongoDB 연결 시도 중...');
    
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10, // 최대 연결 풀 크기
      serverSelectionTimeoutMS: 5000, // 서버 선택 타임아웃
      socketTimeoutMS: 45000, // 소켓 타임아웃
      family: 4 // IPv4 사용
    });

    logger.info(`MongoDB 연결 성공: ${process.env.MONGODB_URI}`);

    // MongoDB 연결 이벤트 핸들러
    mongoose.connection.on('connected', () => {
      logger.info('MongoDB 연결됨');
    });

    mongoose.connection.on('error', (err) => {
      logger.error(`MongoDB 연결 오류: ${err.message}`);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB 연결 해제됨');
    });

    // 종료 시그널 처리
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      logger.info('MongoDB 연결 정상 종료');
      process.exit(0);
    });

  } catch (error) {
    logger.error(`MongoDB 연결 실패: ${error.message}`);
    process.exit(1);
  }
};

/**
 * Redis 연결 설정
 */
const connectRedis = async () => {
  try {
    logger.info('Redis 연결 시도 중...');

    const redisClient = redis.createClient({
      url: process.env.REDIS_URL,
      retry_strategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    });

    // Redis 이벤트 핸들러
    redisClient.on('connect', () => {
      logger.info('Redis 연결 시도 중...');
    });

    redisClient.on('ready', () => {
      logger.info('Redis 연결 준비 완료');
    });

    redisClient.on('error', (err) => {
      logger.error(`Redis 연결 오류: ${err.message}`);
    });

    redisClient.on('end', () => {
      logger.warn('Redis 연결 종료');
    });

    // Redis 연결
    await redisClient.connect();
    
    logger.info(`Redis 연결 성공: ${process.env.REDIS_URL}`);

    // 종료 시그널 처리
    process.on('SIGINT', async () => {
      await redisClient.quit();
      logger.info('Redis 연결 정상 종료');
    });

    return redisClient;

  } catch (error) {
    logger.error(`Redis 연결 실패: ${error.message}`);
    logger.warn('Redis 없이 계속 진행합니다 (캐싱 기능 비활성화)');
    return null;
  }
};

/**
 * 모든 데이터베이스 연결 초기화
 */
const initializeDatabase = async () => {
  try {
    await connectMongoDB();
    const redisClient = await connectRedis();
    
    // 기본 데이터 시드
    await seedInitialData();
    
    logger.info('모든 데이터베이스 연결 완료');
    return { mongoose, redisClient };
    
  } catch (error) {
    logger.error(`데이터베이스 초기화 실패: ${error.message}`);
    throw error;
  }
};

/**
 * 기본 데이터 시드
 */
const seedInitialData = async () => {
  try {
    logger.info('기본 데이터 시드 시작...');
    
    // 상점 아이템 시드
    const { seedShopItems } = require('../utils/shop-seeder');
    await seedShopItems();
    
    logger.info('기본 데이터 시드 완료');
    
  } catch (error) {
    logger.error('기본 데이터 시드 실패:', error);
    // 시드 실패해도 서버는 계속 시작
  }
};

module.exports = {
  initializeDatabase,
  connectMongoDB,
  connectRedis,
  seedInitialData
};
