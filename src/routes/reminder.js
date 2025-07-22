/**
 * 망각방지 알림 API 라우터
 * 시간 기반 알림과 GPS 위치 기반 알림 관리
 */

/**
 * @swagger
 * tags:
 *   name: Reminder
 *   description: 망각방지 알림 시스템
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const reminderService = require('../services/reminderService');
const notificationService = require('../services/notificationService');
const schedulerService = require('../utils/scheduler');
const logger = require('../utils/logger');

// =========================
// Reminder CRUD 라우터
// =========================

/**
 * @swagger
 * /api/reminder:
 *   get:
 *     summary: 사용자의 알림 목록 조회
 *     tags: [Reminder]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 알림 목록 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: 알림 목록 조회 성공
 *                 data:
 *                   type: object
 *                   properties:
 *                     reminders:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: 507f1f77bcf86cd799439011
 *                           title:
 *                             type: string
 *                             example: 약 챙기기
 *                           time:
 *                             type: string
 *                             format: time
 *                             example: "08:00"
 *                           days:
 *                             type: array
 *                             items:
 *                               type: string
 *                               enum: [mon, tue, wed, thu, fri, sat, sun]
 *                             example: [mon, tue, wed, thu, fri]
 *                           isActive:
 *                             type: boolean
 *                             example: true
 *                           location:
 *                             type: object
 *                             properties:
 *                               name:
 *                                 type: string
 *                                 example: 집
 *                               latitude:
 *                                 type: number
 *                                 example: 37.5665
 *                               longitude:
 *                                 type: number
 *                                 example: 126.9780
 *                               radius:
 *                                 type: integer
 *                                 example: 100
 *                     totalCount:
 *                       type: integer
 *                       example: 3
 *       401:
 *         description: 인증 토큰이 필요합니다
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    logger.info(`알림 목록 조회 요청`, { userId });

    const reminders = await reminderService.getUserReminders(userId);
    
    logger.info(`알림 목록 조회 완료`, { userId, reminderCount: reminders.length });

    res.status(200).json({
      success: true,
      message: '알림 목록 조회 성공',
      data: { reminders, totalCount: reminders.length }
    });

  } catch (error) {
    logger.error('알림 목록 조회 실패', { 
      error: error.message, 
      userId: req.user?.userId
    });
    
    res.status(500).json({
      success: false,
      message: '알림 목록을 불러오는데 실패했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @swagger
 * /api/reminder:
 *   post:
 *     summary: 새 알림 생성
 *     tags: [Reminder]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - time
 *               - days
 *             properties:
 *               title:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *                 example: 약 챙기기
 *               time:
 *                 type: string
 *                 format: time
 *                 example: "08:00"
 *               days:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [mon, tue, wed, thu, fri, sat, sun]
 *                 example: [mon, tue, wed, thu, fri]
 *               isActive:
 *                 type: boolean
 *                 default: true
 *                 example: true
 *               location:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                     example: 집
 *                   latitude:
 *                     type: number
 *                     example: 37.5665
 *                   longitude:
 *                     type: number
 *                     example: 126.9780
 *                   radius:
 *                     type: integer
 *                     default: 100
 *                     example: 100
 *     responses:
 *       201:
 *         description: 알림 생성 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: 알림이 성공적으로 생성되었습니다
 *                 data:
 *                   type: object
 *                   properties:
 *                     reminder:
 *                       $ref: '#/components/schemas/Reminder'
 *       400:
 *         description: 잘못된 요청
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: 인증 토큰이 필요합니다
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const reminderData = req.body;
    
    logger.info(`알림 생성 요청`, { 
      userId, 
      title: reminderData.title,
      time: reminderData.time,
      hasLocation: !!(reminderData.location?.latitude)
    });

    // 입력값 검증
    if (!reminderData.title || !reminderData.time) {
      return res.status(400).json({
        success: false,
        message: '알림 제목과 시간은 필수 항목입니다.'
      });
    }

    // 시간 형식 검증
    const { hour, minute } = reminderData.time;
    if (typeof hour !== 'number' || typeof minute !== 'number' || 
        hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return res.status(400).json({
        success: false,
        message: '시간 형식이 올바르지 않습니다. (hour: 0-23, minute: 0-59)'
      });
    }

    const newReminder = await reminderService.createReminder(userId, reminderData);
    
    logger.info(`알림 생성 완료`, { 
      userId, 
      reminderId: newReminder._id,
      title: newReminder.title,
      type: newReminder.type
    });

    res.status(201).json({
      success: true,
      message: '알림이 성공적으로 생성되었습니다.',
      data: { reminder: newReminder }
    });

  } catch (error) {
    logger.error('알림 생성 실패', { 
      error: error.message, 
      userId: req.user?.userId
    });
    
    res.status(500).json({
      success: false,
      message: error.message || '알림 생성에 실패했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * 알림 수정
 * PUT /api/reminder/:reminderId
 */
router.put('/:reminderId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { reminderId } = req.params;
    const updateData = req.body;
    
    logger.info(`알림 수정 요청`, { userId, reminderId });

    const updatedReminder = await reminderService.updateReminder(userId, reminderId, updateData);
    
    logger.info(`알림 수정 완료`, { userId, reminderId, title: updatedReminder.title });

    res.status(200).json({
      success: true,
      message: '알림이 성공적으로 수정되었습니다.',
      data: { reminder: updatedReminder }
    });

  } catch (error) {
    logger.error('알림 수정 실패', { 
      error: error.message, 
      userId: req.user?.userId,
      reminderId: req.params.reminderId
    });
    
    const statusCode = error.message.includes('찾을 수 없습니다') ? 404 : 500;
    
    res.status(statusCode).json({
      success: false,
      message: error.message || '알림 수정에 실패했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @swagger
 * /api/reminder/{reminderId}:
 *   delete:
 *     summary: 알림 삭제
 *     tags: [Reminder]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reminderId
 *         required: true
 *         description: 알림 ID
 *         schema:
 *           type: string
 *           example: 507f1f77bcf86cd799439011
 *     responses:
 *       200:
 *         description: 알림 삭제 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: 알림이 성공적으로 삭제되었습니다
 *                 data:
 *                   type: object
 *                   properties:
 *                     deletedCount:
 *                       type: integer
 *                       example: 1
 *       404:
 *         description: 알림을 찾을 수 없습니다
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: 인증 토큰이 필요합니다
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete('/:reminderId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { reminderId } = req.params;
    
    logger.info(`알림 삭제 요청`, { userId, reminderId });

    const result = await reminderService.deleteReminder(userId, reminderId);
    
    logger.info(`알림 삭제 완료`, { userId, reminderId });

    res.status(200).json({
      success: true,
      message: '알림이 성공적으로 삭제되었습니다.',
      data: result
    });

  } catch (error) {
    logger.error('알림 삭제 실패', { 
      error: error.message, 
      userId: req.user?.userId,
      reminderId: req.params.reminderId
    });
    
    const statusCode = error.message.includes('찾을 수 없습니다') ? 404 : 500;
    
    res.status(statusCode).json({
      success: false,
      message: error.message || '알림 삭제에 실패했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @swagger
 * /api/reminder/{reminderId}/complete:
 *   post:
 *     summary: 알림 완료 처리
 *     tags: [Reminder]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reminderId
 *         required: true
 *         description: 알림 ID
 *         schema:
 *           type: string
 *           example: 507f1f77bcf86cd799439011
 *     responses:
 *       200:
 *         description: 알림 완료 처리 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: 알림이 완료 처리되었습니다
 *                 data:
 *                   type: object
 *                   properties:
 *                     reminder:
 *                       $ref: '#/components/schemas/Reminder'
 *                     coinAwarded:
 *                       type: boolean
 *                       example: true
 *                     coinsEarned:
 *                       type: integer
 *                       example: 1
 *                     allCompleted:
 *                       type: boolean
 *                       description: 해당 날짜의 모든 알림이 완료되었는지 여부
 *                       example: true
 *       404:
 *         description: 알림을 찾을 수 없습니다
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: 인증 토큰이 필요합니다
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/:reminderId/complete', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { reminderId } = req.params;
    
    logger.info(`알림 완료 처리 요청`, { userId, reminderId });

    const result = await reminderService.completeReminder(userId, reminderId);
    
    // 코인 지급이 있는 경우 푸시 알림 발송
    if (result.coinReward && result.coinReward.rewarded) {
      try {
        const User = require('../models/User');
        const user = await User.findById(userId);
        
        if (user && notificationService.isNotificationEnabled(user)) {
          const coinNotification = notificationService.createCoinRewardNotification(result.coinReward);
          await notificationService.sendPushNotification(user, coinNotification);
        }
      } catch (notificationError) {
        logger.warn('코인 지급 알림 발송 실패', { 
          userId, 
          reminderId, 
          error: notificationError.message 
        });
      }
    }

    logger.info(`알림 완료 처리 완료`, { 
      userId, 
      reminderId, 
      alreadyCompleted: result.alreadyCompleted,
      coinRewarded: !!result.coinReward?.rewarded
    });

    res.status(200).json({
      success: true,
      message: result.alreadyCompleted 
        ? '이미 완료된 알림입니다.' 
        : '알림이 완료 처리되었습니다.',
      data: {
        reminder: result.reminder,
        alreadyCompleted: result.alreadyCompleted,
        coinReward: result.coinReward
      }
    });

  } catch (error) {
    logger.error('알림 완료 처리 실패', { 
      error: error.message, 
      userId: req.user?.userId,
      reminderId: req.params.reminderId
    });
    
    const statusCode = error.message.includes('찾을 수 없습니다') ? 404 : 500;
    
    res.status(statusCode).json({
      success: false,
      message: error.message || '알림 완료 처리에 실패했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @swagger
 * /api/reminder/test-notification:
 *   post:
 *     summary: 테스트 푸시 알림 발송 (개발용)
 *     tags: [Reminder]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 default: 테스트 알림
 *                 example: 테스트 푸시 알림
 *               body:
 *                 type: string
 *                 default: 이것은 테스트 푸시 알림입니다.
 *                 example: 개발 테스트용 알림 메시지입니다.
 *     responses:
 *       200:
 *         description: 테스트 알림 발송 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: 테스트 알림이 발송되었습니다
 *                 data:
 *                   type: object
 *                   properties:
 *                     notification:
 *                       type: object
 *                       properties:
 *                         title:
 *                           type: string
 *                         body:
 *                           type: string
 *                         sentAt:
 *                           type: string
 *                           format: date-time
 *       404:
 *         description: 프로덕션 환경에서는 사용할 수 없습니다
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: 인증 토큰이 필요합니다
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/test-notification', authenticateToken, async (req, res) => {
  try {
    if (process.env.NODE_ENV !== 'development') {
      return res.status(403).json({
        success: false,
        message: '이 기능은 개발 환경에서만 사용할 수 있습니다.'
      });
    }

    const userId = req.user.userId;
    const { title = '테스트 알림', body = '이것은 테스트 푸시 알림입니다.' } = req.body;
    
    const User = require('../models/User');
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '사용자를 찾을 수 없습니다.'
      });
    }

    const testNotification = {
      title,
      body,
      data: {
        type: 'test',
        timestamp: new Date().toISOString()
      }
    };

    const result = await notificationService.sendPushNotification(user, testNotification);
    
    res.status(200).json({
      success: true,
      message: '테스트 알림이 발송되었습니다.',
      data: result
    });

  } catch (error) {
    logger.error('테스트 알림 발송 실패', { 
      error: error.message,
      userId: req.user?.userId
    });
    
    res.status(500).json({
      success: false,
      message: '테스트 알림 발송에 실패했습니다.',
      error: error.message
    });
  }
});

module.exports = router;
