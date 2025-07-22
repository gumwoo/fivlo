/**
 * 망각방지 알림 API 라우터 v2.0
 * PDF 기획서 기반 새로운 API 명세 구현
 */

const express = require('express');
const router = express.Router();
const { authenticateToken, premiumMiddleware } = require('../middleware/auth');
const reminderService = require('../services/reminderService');
const coinService = require('../services/coinService');
const logger = require('../utils/logger');

/**
 * @swagger
 * tags:
 *   name: Reminders
 *   description: 망각방지 알림 시스템 (Premium 기능 포함)
 */

// =========================
// 8.1 알림 목록 조회
// =========================

/**
 * @swagger
 * /api/reminders:
 *   get:
 *     summary: 알림 목록 조회
 *     tags: [Reminders]
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
 *                 reminders:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: "reminder_001"
 *                       title:
 *                         type: string
 *                         example: "약 챙기기"
 *                       time:
 *                         type: string
 *                         example: "07:30"
 *                       days:
 *                         type: array
 *                         items:
 *                           type: string
 *                         example: ["월", "화", "수", "목", "금"]
 *                       location:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                             example: "집"
 *                           latitude:
 *                             type: number
 *                             example: 37.5665
 *                           longitude:
 *                             type: number
 *                             example: 126.9780
 *                           radius:
 *                             type: number
 *                             example: 100
 *                       isPremiumFeature:
 *                         type: boolean
 *                         example: true
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const isPremium = req.user.subscriptionStatus === 'premium';
    
    logger.info(`망각방지 알림 목록 조회 요청`, { userId, isPremium });

    const reminders = await reminderService.getUserReminders(userId);
    
    // 무료 사용자의 경우 위치 정보 제거
    const processedReminders = reminders.map(reminder => ({
      id: reminder._id,
      title: reminder.title,
      time: reminder.time,
      days: reminder.days,
      location: isPremium ? reminder.location : null,
      isPremiumFeature: !!reminder.location,
      isActive: reminder.isActive,
      createdAt: reminder.createdAt
    }));

    logger.info(`망각방지 알림 목록 조회 완료`, { 
      userId, 
      reminderCount: processedReminders.length 
    });

    res.json({
      reminders: processedReminders
    });

  } catch (error) {
    logger.error('망각방지 알림 목록 조회 실패', { 
      error: error.message, 
      userId: req.user?.userId 
    });
    
    res.status(500).json({
      error: '알림 목록을 불러오는데 실패했습니다.'
    });
  }
});

// =========================
// 8.2 알림 생성
// =========================

/**
 * @swagger
 * /api/reminders:
 *   post:
 *     summary: 알림 생성
 *     tags: [Reminders]
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
 *                 example: "지갑 챙기기"
 *               time:
 *                 type: string
 *                 example: "08:00"
 *               days:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["월", "화", "수", "목", "금"]
 *               location:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                     example: "집"
 *                   latitude:
 *                     type: number
 *                     example: 37.5665
 *                   longitude:
 *                     type: number
 *                     example: 126.9780
 *     responses:
 *       201:
 *         description: 알림 생성 성공
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const isPremium = req.user.subscriptionStatus === 'premium';
    const { title, time, days, location } = req.body;
    
    logger.info(`망각방지 알림 생성 요청`, { 
      userId, 
      title, 
      time, 
      hasLocation: !!location,
      isPremium 
    });

    // 필수 필드 검증
    if (!title || !time || !days || !Array.isArray(days)) {
      return res.status(400).json({
        error: '제목, 시간, 요일은 필수 항목입니다.'
      });
    }

    // 위치 설정은 Premium 전용
    if (location && !isPremium) {
      return res.status(402).json({
        error: '위치 기반 알림은 Premium 기능입니다.',
        feature: 'location_reminder'
      });
    }

    const reminderData = {
      title,
      time,
      days,
      location: isPremium ? location : null,
      isActive: true
    };

    const newReminder = await reminderService.createReminder(userId, reminderData);
    
    logger.info(`망각방지 알림 생성 완료`, { 
      userId, 
      reminderId: newReminder._id,
      title: newReminder.title 
    });

    res.status(201).json({
      id: newReminder._id,
      title: newReminder.title,
      time: newReminder.time,
      days: newReminder.days,
      location: isPremium ? newReminder.location : null,
      isActive: newReminder.isActive,
      createdAt: newReminder.createdAt
    });

  } catch (error) {
    logger.error('망각방지 알림 생성 실패', { 
      error: error.message, 
      userId: req.user?.userId 
    });
    
    res.status(500).json({
      error: '알림 생성에 실패했습니다.'
    });
  }
});

// =========================
// 8.3 알림 수정
// =========================

/**
 * @swagger
 * /api/reminders/{reminderId}:
 *   patch:
 *     summary: 알림 수정
 *     tags: [Reminders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reminderId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               time:
 *                 type: string
 *               days:
 *                 type: array
 *                 items:
 *                   type: string
 *               location:
 *                 type: object
 *     responses:
 *       200:
 *         description: 알림 수정 성공
 */
router.patch('/:reminderId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const isPremium = req.user.subscriptionStatus === 'premium';
    const { reminderId } = req.params;
    const updateData = req.body;
    
    logger.info(`망각방지 알림 수정 요청`, { userId, reminderId });

    // 위치 설정은 Premium 전용
    if (updateData.location && !isPremium) {
      return res.status(402).json({
        error: '위치 기반 알림은 Premium 기능입니다.',
        feature: 'location_reminder'
      });
    }

    const updatedReminder = await reminderService.updateReminder(userId, reminderId, updateData);
    
    logger.info(`망각방지 알림 수정 완료`, { userId, reminderId });

    res.json({
      id: updatedReminder._id,
      title: updatedReminder.title,
      time: updatedReminder.time,
      days: updatedReminder.days,
      location: isPremium ? updatedReminder.location : null,
      isActive: updatedReminder.isActive,
      updatedAt: updatedReminder.updatedAt
    });

  } catch (error) {
    logger.error('망각방지 알림 수정 실패', { 
      error: error.message, 
      userId: req.user?.userId,
      reminderId: req.params.reminderId 
    });
    
    res.status(500).json({
      error: '알림 수정에 실패했습니다.'
    });
  }
});

// =========================
// 8.3 알림 삭제
// =========================

/**
 * @swagger
 * /api/reminders/{reminderId}:
 *   delete:
 *     summary: 알림 삭제
 *     tags: [Reminders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reminderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 알림 삭제 성공
 */
router.delete('/:reminderId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { reminderId } = req.params;
    
    logger.info(`망각방지 알림 삭제 요청`, { userId, reminderId });

    await reminderService.deleteReminder(userId, reminderId);
    
    logger.info(`망각방지 알림 삭제 완료`, { userId, reminderId });

    res.json({
      message: '알림이 성공적으로 삭제되었습니다.'
    });

  } catch (error) {
    logger.error('망각방지 알림 삭제 실패', { 
      error: error.message, 
      userId: req.user?.userId,
      reminderId: req.params.reminderId 
    });
    
    res.status(500).json({
      error: '알림 삭제에 실패했습니다.'
    });
  }
});

// =========================
// 8.4 알림 체크 → 전부 완료 시 코인 지급
// =========================

/**
 * @swagger
 * /api/reminders/{reminderId}/check:
 *   put:
 *     summary: 알림 체크 (완료 처리)
 *     tags: [Reminders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reminderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 알림 체크 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 checked:
 *                   type: boolean
 *                   example: true
 *                 allRemindersChecked:
 *                   type: boolean
 *                   example: true
 *                 coinEarned:
 *                   type: number
 *                   example: 1
 */
router.put('/:reminderId/check', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const isPremium = req.user.subscriptionStatus === 'premium';
    const { reminderId } = req.params;
    
    logger.info(`망각방지 알림 체크 요청`, { userId, reminderId, isPremium });

    // 알림 체크 처리
    await reminderService.checkReminder(userId, reminderId);
    
    // 오늘 모든 알림이 체크되었는지 확인
    const allRemindersChecked = await reminderService.areAllRemindersCheckedToday(userId);
    
    let coinEarned = 0;
    
    // Premium 사용자이고 모든 알림이 체크되었으면 코인 지급
    if (isPremium && allRemindersChecked) {
      const today = new Date().toISOString().split('T')[0];
      const alreadyEarned = await coinService.hasEarnedCoinToday(userId, 'reminder_all_checked');
      
      if (!alreadyEarned) {
        coinEarned = 1;
        await coinService.earnCoin(userId, 'reminder_all_checked', coinEarned);
        logger.info(`망각방지 알림 전체 완료 코인 지급`, { userId, coinEarned });
      }
    }
    
    logger.info(`망각방지 알림 체크 완료`, { 
      userId, 
      reminderId, 
      allRemindersChecked,
      coinEarned 
    });

    res.json({
      checked: true,
      allRemindersChecked,
      coinEarned
    });

  } catch (error) {
    logger.error('망각방지 알림 체크 실패', { 
      error: error.message, 
      userId: req.user?.userId,
      reminderId: req.params.reminderId 
    });
    
    res.status(500).json({
      error: '알림 체크에 실패했습니다.'
    });
  }
});

// =========================
// 8.5 알림 통계
// =========================

/**
 * @swagger
 * /api/reminders/stats:
 *   get:
 *     summary: 알림 통계
 *     tags: [Reminders]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 알림 통계 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalReminders:
 *                   type: number
 *                   example: 5
 *                 completedToday:
 *                   type: number
 *                   example: 3
 *                 completionRate:
 *                   type: number
 *                   example: 60
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    logger.info(`망각방지 알림 통계 조회 요청`, { userId });

    const stats = await reminderService.getReminderStats(userId);
    
    logger.info(`망각방지 알림 통계 조회 완료`, { userId, stats });

    res.json(stats);

  } catch (error) {
    logger.error('망각방지 알림 통계 조회 실패', { 
      error: error.message, 
      userId: req.user?.userId 
    });
    
    res.status(500).json({
      error: '알림 통계 조회에 실패했습니다.'
    });
  }
});

module.exports = router;
