/**
 * Task 관리 및 성장앨범 API 라우터
 * 캘린더 형태의 할일 관리와 사진 연동 성장앨범 기능
 */

/**
 * @swagger
 * tags:
 *   name: Task
 *   description: Task 관리 및 성장앨범 기능
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { upload, processImage, handleUploadError } = require('../middleware/upload');
const taskService = require('../services/taskService');
const logger = require('../utils/logger');

// =========================
// Task CRUD 라우터
// =========================

/**
 * @swagger
 * /api/task:
 *   get:
 *     summary: Task 목록 조회 (날짜별 필터링 지원)
 *     tags: [Task]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         required: false
 *         description: 특정 날짜의 Task만 조회 (YYYY-MM-DD 형식)
 *         schema:
 *           type: string
 *           format: date
 *           example: "2025-01-15"
 *     responses:
 *       200:
 *         description: Task 목록 조회 성공
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
 *                   example: Task 목록 조회 성공
 *                 data:
 *                   type: object
 *                   properties:
 *                     tasks:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Task'
 *                     totalCount:
 *                       type: integer
 *                       example: 5
 *                     date:
 *                       type: string
 *                       format: date
 *                       example: "2025-01-15"
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
    const { date } = req.query;
    
    logger.info(`Task 목록 조회 요청`, { 
      userId, 
      date,
      userAgent: req.get('User-Agent')
    });

    let tasks;
    if (date) {
      // 특정 날짜의 Task만 조회
      tasks = await taskService.getTasksByDate(userId, date);
      logger.info(`특정 날짜 Task 조회 완료`, { userId, date, taskCount: tasks.length });
    } else {
      // 전체 Task 조회
      tasks = await taskService.getAllTasks(userId);
      logger.info(`전체 Task 조회 완료`, { userId, taskCount: tasks.length });
    }

    res.status(200).json({
      success: true,
      message: date ? `${date} 날짜의 Task 조회 성공` : 'Task 목록 조회 성공',
      data: {
        tasks,
        totalCount: tasks.length,
        date: date || null
      }
    });

  } catch (error) {
    logger.error('Task 목록 조회 실패', { 
      error: error.message, 
      stack: error.stack,
      userId: req.user?.userId,
      query: req.query
    });
    
    res.status(500).json({
      success: false,
      message: 'Task 목록을 불러오는데 실패했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @swagger
 * /api/task/calendar/{year}/{month}:
 *   get:
 *     summary: 캘린더용 월별 Task 데이터 조회
 *     tags: [Task]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: year
 *         required: true
 *         description: 조회할 연도 (4자리)
 *         schema:
 *           type: integer
 *           example: 2025
 *       - in: path
 *         name: month
 *         required: true
 *         description: 조회할 월 (1-12)
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 12
 *           example: 1
 *     responses:
 *       200:
 *         description: 월별 캘린더 데이터 조회 성공
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
 *                   example: 2025년 1월 캘린더 데이터 조회 성공
 *                 data:
 *                   type: object
 *                   properties:
 *                     year:
 *                       type: integer
 *                       example: 2025
 *                     month:
 *                       type: integer
 *                       example: 1
 *                     tasks:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Task'
 *                     tasksByDate:
 *                       type: object
 *                       description: 날짜별로 그룹화된 Task 데이터
 *       400:
 *         description: 잘못된 연도/월 파라미터
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
 */
router.get('/calendar/:year/:month', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { year, month } = req.params;
    
    logger.info(`캘린더 데이터 조회 요청`, { 
      userId, 
      year: parseInt(year), 
      month: parseInt(month)
    });

    const calendarData = await taskService.getCalendarData(userId, parseInt(year), parseInt(month));
    
    logger.info(`캘린더 데이터 조회 완료`, { 
      userId, 
      year, 
      month, 
      daysWithTasks: Object.keys(calendarData).length 
    });

    res.status(200).json({
      success: true,
      message: `${year}년 ${month}월 캘린더 데이터 조회 성공`,
      data: {
        calendarData,
        year: parseInt(year),
        month: parseInt(month)
      }
    });

  } catch (error) {
    logger.error('캘린더 데이터 조회 실패', { 
      error: error.message, 
      stack: error.stack,
      userId: req.user?.userId,
      params: req.params
    });
    
    res.status(500).json({
      success: false,
      message: '캘린더 데이터를 불러오는데 실패했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @swagger
 * /api/task:
 *   post:
 *     summary: 새 Task 생성
 *     tags: [Task]
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
 *               - date
 *               - categoryId
 *             properties:
 *               title:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *                 example: 영어 공부하기
 *               description:
 *                 type: string
 *                 maxLength: 500
 *                 example: 토익 리스닝 연습
 *               date:
 *                 type: string
 *                 format: date
 *                 example: "2025-01-15"
 *               categoryId:
 *                 type: string
 *                 example: 507f1f77bcf86cd799439011
 *               priority:
 *                 type: string
 *                 enum: [낮음, 보통, 높음]
 *                 default: 보통
 *                 example: 보통
 *               estimatedTime:
 *                 type: integer
 *                 minimum: 5
 *                 maximum: 480
 *                 example: 25
 *               isRecurring:
 *                 type: boolean
 *                 default: false
 *                 example: false
 *               recurringPattern:
 *                 type: object
 *                 properties:
 *                   type:
 *                     type: string
 *                     enum: [daily, weekly, monthly]
 *                   interval:
 *                     type: integer
 *                     minimum: 1
 *               enableGrowthAlbum:
 *                 type: boolean
 *                 default: false
 *                 example: true
 *     responses:
 *       201:
 *         description: Task 생성 성공
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
 *                   example: Task가 성공적으로 생성되었습니다
 *                 data:
 *                   type: object
 *                   properties:
 *                     task:
 *                       $ref: '#/components/schemas/Task'
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
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const taskData = req.body;
    
    logger.info(`Task 생성 요청`, { 
      userId, 
      taskTitle: taskData.title,
      category: taskData.category,
      date: taskData.date
    });

    // 입력값 검증
    if (!taskData.title || !taskData.date) {
      logger.warn('Task 생성 실패 - 필수 정보 누락', { userId, taskData });
      return res.status(400).json({
        success: false,
        message: 'Task 제목과 날짜는 필수 항목입니다.'
      });
    }

    const newTask = await taskService.createTask(userId, taskData);
    
    logger.info(`Task 생성 완료`, { 
      userId, 
      taskId: newTask._id,
      title: newTask.title,
      category: newTask.category
    });

    res.status(201).json({
      success: true,
      message: 'Task가 성공적으로 생성되었습니다.',
      data: { task: newTask }
    });

  } catch (error) {
    logger.error('Task 생성 실패', { 
      error: error.message, 
      stack: error.stack,
      userId: req.user?.userId,
      requestBody: req.body
    });
    
    res.status(500).json({
      success: false,
      message: 'Task 생성에 실패했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @swagger
 * /api/task/{taskId}:
 *   get:
 *     summary: Task 상세 정보 조회
 *     tags: [Task]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         description: Task ID
 *         schema:
 *           type: string
 *           example: 507f1f77bcf86cd799439011
 *     responses:
 *       200:
 *         description: Task 상세 조회 성공
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
 *                   example: Task 상세 조회 성공
 *                 data:
 *                   type: object
 *                   properties:
 *                     task:
 *                       $ref: '#/components/schemas/Task'
 *       404:
 *         description: Task를 찾을 수 없습니다
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
 */
router.get('/:taskId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { taskId } = req.params;
    
    logger.info(`Task 상세 조회 요청`, { userId, taskId });

    const task = await taskService.getTaskById(userId, taskId);
    
    if (!task) {
      logger.warn('Task 조회 실패 - 존재하지 않음', { userId, taskId });
      return res.status(404).json({
        success: false,
        message: '요청한 Task를 찾을 수 없습니다.'
      });
    }

    logger.info(`Task 상세 조회 완료`, { userId, taskId, title: task.title });

    res.status(200).json({
      success: true,
      message: 'Task 상세 정보 조회 성공',
      data: { task }
    });

  } catch (error) {
    logger.error('Task 상세 조회 실패', { 
      error: error.message, 
      stack: error.stack,
      userId: req.user?.userId,
      taskId: req.params.taskId
    });
    
    res.status(500).json({
      success: false,
      message: 'Task 정보를 불러오는데 실패했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @swagger
 * /api/task/{taskId}:
 *   put:
 *     summary: Task 수정
 *     tags: [Task]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         description: Task ID
 *         schema:
 *           type: string
 *           example: 507f1f77bcf86cd799439011
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 example: 수정된 영어 공부하기
 *               description:
 *                 type: string
 *                 example: 토익 스피킹 연습
 *               categoryId:
 *                 type: string
 *                 example: 507f1f77bcf86cd799439012
 *               priority:
 *                 type: string
 *                 enum: [낮음, 보통, 높음]
 *                 example: 높음
 *               estimatedTime:
 *                 type: integer
 *                 example: 30
 *               isCompleted:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Task 수정 성공
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
 *                   example: Task가 성공적으로 수정되었습니다
 *                 data:
 *                   type: object
 *                   properties:
 *                     task:
 *                       $ref: '#/components/schemas/Task'
 *       404:
 *         description: Task를 찾을 수 없습니다
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
 */
router.put('/:taskId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { taskId } = req.params;
    const updateData = req.body;
    
    logger.info(`Task 수정 요청`, { 
      userId, 
      taskId, 
      updateFields: Object.keys(updateData)
    });

    const updatedTask = await taskService.updateTask(userId, taskId, updateData);
    
    if (!updatedTask) {
      logger.warn('Task 수정 실패 - 존재하지 않음', { userId, taskId });
      return res.status(404).json({
        success: false,
        message: '수정하려는 Task를 찾을 수 없습니다.'
      });
    }

    logger.info(`Task 수정 완료`, { 
      userId, 
      taskId, 
      title: updatedTask.title 
    });

    res.status(200).json({
      success: true,
      message: 'Task가 성공적으로 수정되었습니다.',
      data: { task: updatedTask }
    });

  } catch (error) {
    logger.error('Task 수정 실패', { 
      error: error.message, 
      stack: error.stack,
      userId: req.user?.userId,
      taskId: req.params.taskId,
      requestBody: req.body
    });
    
    res.status(500).json({
      success: false,
      message: 'Task 수정에 실패했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @swagger
 * /api/task/{taskId}:
 *   delete:
 *     summary: Task 삭제
 *     tags: [Task]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         description: Task ID
 *         schema:
 *           type: string
 *           example: 507f1f77bcf86cd799439011
 *       - in: query
 *         name: deleteRepeating
 *         required: false
 *         description: 반복 Task 전체 삭제 여부
 *         schema:
 *           type: boolean
 *           example: false
 *     responses:
 *       200:
 *         description: Task 삭제 성공
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
 *                   example: Task가 성공적으로 삭제되었습니다
 *                 data:
 *                   type: object
 *                   properties:
 *                     deletedCount:
 *                       type: integer
 *                       example: 1
 *       404:
 *         description: Task를 찾을 수 없습니다
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
router.delete('/:taskId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { taskId } = req.params;
    const { deleteRepeating } = req.query; // 반복 Task 전체 삭제 여부
    
    logger.info(`Task 삭제 요청`, { 
      userId, 
      taskId, 
      deleteRepeating: deleteRepeating === 'true'
    });

    const result = await taskService.deleteTask(userId, taskId, deleteRepeating === 'true');
    
    if (!result.success) {
      logger.warn('Task 삭제 실패 - 존재하지 않음', { userId, taskId });
      return res.status(404).json({
        success: false,
        message: '삭제하려는 Task를 찾을 수 없습니다.'
      });
    }

    logger.info(`Task 삭제 완료`, { 
      userId, 
      taskId, 
      deletedCount: result.deletedCount 
    });

    res.status(200).json({
      success: true,
      message: `Task가 성공적으로 삭제되었습니다. (${result.deletedCount}개)`,
      data: { 
        deletedCount: result.deletedCount,
        deletedRepeating: deleteRepeating === 'true'
      }
    });

  } catch (error) {
    logger.error('Task 삭제 실패', { 
      error: error.message, 
      stack: error.stack,
      userId: req.user?.userId,
      taskId: req.params.taskId
    });
    
    res.status(500).json({
      success: false,
      message: 'Task 삭제에 실패했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// =========================
// Task 상태 관리 라우터
// =========================

/**
 * Task 완료/미완료 토글
 * PATCH /api/task/:taskId/complete
 */
router.patch('/:taskId/complete', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { taskId } = req.params;
    const { isCompleted } = req.body;
    
    logger.info(`Task 완료 상태 변경 요청`, { 
      userId, 
      taskId, 
      isCompleted 
    });

    const updatedTask = await taskService.toggleTaskCompletion(userId, taskId, isCompleted);
    
    if (!updatedTask) {
      logger.warn('Task 완료 상태 변경 실패 - 존재하지 않음', { userId, taskId });
      return res.status(404).json({
        success: false,
        message: '요청한 Task를 찾을 수 없습니다.'
      });
    }

    // 유료 사용자이고 오늘 모든 Task가 완료되었는지 확인
    const coinReward = await taskService.checkDailyTaskCompletion(userId);
    
    logger.info(`Task 완료 상태 변경 완료`, { 
      userId, 
      taskId, 
      isCompleted: updatedTask.isCompleted,
      coinReward
    });

    res.status(200).json({
      success: true,
      message: `Task가 ${updatedTask.isCompleted ? '완료' : '미완료'}로 변경되었습니다.`,
      data: { 
        task: updatedTask,
        coinReward
      }
    });

  } catch (error) {
    logger.error('Task 완료 상태 변경 실패', { 
      error: error.message, 
      stack: error.stack,
      userId: req.user?.userId,
      taskId: req.params.taskId
    });
    
    res.status(500).json({
      success: false,
      message: 'Task 상태 변경에 실패했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// =========================
// 카테고리 관리 라우터  
// =========================

/**
 * @swagger
 * /api/task/categories/list:
 *   get:
 *     summary: 사용자의 카테고리 목록 조회
 *     tags: [Task]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 카테고리 목록 조회 성공
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
 *                   example: 카테고리 목록 조회 성공
 *                 data:
 *                   type: object
 *                   properties:
 *                     categories:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Category'
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
router.get('/categories/list', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    logger.info(`카테고리 목록 조회 요청`, { userId });

    const categories = await taskService.getUserCategories(userId);
    
    logger.info(`카테고리 목록 조회 완료`, { 
      userId, 
      categoryCount: categories.length 
    });

    res.status(200).json({
      success: true,
      message: '카테고리 목록 조회 성공',
      data: { categories }
    });

  } catch (error) {
    logger.error('카테고리 목록 조회 실패', { 
      error: error.message, 
      stack: error.stack,
      userId: req.user?.userId
    });
    
    res.status(500).json({
      success: false,
      message: '카테고리 목록을 불러오는데 실패했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @swagger
 * /api/task/categories:
 *   post:
 *     summary: 새 카테고리 생성
 *     tags: [Task]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - color
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 50
 *                 example: 운동
 *               color:
 *                 type: string
 *                 pattern: ^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$
 *                 example: "#FF5722"
 *     responses:
 *       201:
 *         description: 카테고리 생성 성공
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
 *                   example: 카테고리가 성공적으로 생성되었습니다
 *                 data:
 *                   type: object
 *                   properties:
 *                     category:
 *                       $ref: '#/components/schemas/Category'
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
router.post('/categories', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name, color } = req.body;
    
    logger.info(`카테고리 생성 요청`, { userId, name, color });

    // 입력값 검증
    if (!name || !color) {
      logger.warn('카테고리 생성 실패 - 필수 정보 누락', { userId, name, color });
      return res.status(400).json({
        success: false,
        message: '카테고리 이름과 색상은 필수 항목입니다.'
      });
    }

    const newCategory = await taskService.createCategory(userId, { name, color });
    
    logger.info(`카테고리 생성 완료`, { 
      userId, 
      categoryId: newCategory._id,
      name: newCategory.name 
    });

    res.status(201).json({
      success: true,
      message: '카테고리가 성공적으로 생성되었습니다.',
      data: { category: newCategory }
    });

  } catch (error) {
    logger.error('카테고리 생성 실패', { 
      error: error.message, 
      stack: error.stack,
      userId: req.user?.userId,
      requestBody: req.body
    });
    
    res.status(500).json({
      success: false,
      message: '카테고리 생성에 실패했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @swagger
 * /api/task/categories/{categoryId}:
 *   put:
 *     summary: 카테고리 수정
 *     tags: [Task]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: categoryId
 *         required: true
 *         description: 카테고리 ID
 *         schema:
 *           type: string
 *           example: 507f1f77bcf86cd799439011
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 50
 *                 example: 수정된 운동
 *               color:
 *                 type: string
 *                 pattern: ^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$
 *                 example: "#4CAF50"
 *     responses:
 *       200:
 *         description: 카테고리 수정 성공
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
 *                   example: 카테고리가 성공적으로 수정되었습니다
 *                 data:
 *                   type: object
 *                   properties:
 *                     category:
 *                       $ref: '#/components/schemas/Category'
 *       404:
 *         description: 카테고리를 찾을 수 없습니다
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
router.put('/categories/:categoryId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { categoryId } = req.params;
    const updateData = req.body;
    
    logger.info(`카테고리 수정 요청`, { 
      userId, 
      categoryId, 
      updateData 
    });

    const updatedCategory = await taskService.updateCategory(userId, categoryId, updateData);
    
    if (!updatedCategory) {
      logger.warn('카테고리 수정 실패 - 존재하지 않음', { userId, categoryId });
      return res.status(404).json({
        success: false,
        message: '수정하려는 카테고리를 찾을 수 없습니다.'
      });
    }

    logger.info(`카테고리 수정 완료`, { 
      userId, 
      categoryId, 
      name: updatedCategory.name 
    });

    res.status(200).json({
      success: true,
      message: '카테고리가 성공적으로 수정되었습니다.',
      data: { category: updatedCategory }
    });

  } catch (error) {
    logger.error('카테고리 수정 실패', { 
      error: error.message, 
      stack: error.stack,
      userId: req.user?.userId,
      categoryId: req.params.categoryId
    });
    
    res.status(500).json({
      success: false,
      message: '카테고리 수정에 실패했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// =========================
// 성장앨범 관리 라우터
// =========================

/**
 * @swagger
 * /api/task/{taskId}/growth-album:
 *   post:
 *     summary: 성장앨범 사진 업로드
 *     tags: [Task]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         description: Task ID
 *         schema:
 *           type: string
 *           example: 507f1f77bcf86cd799439011
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - image
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: 업로드할 이미지 파일
 *               memo:
 *                 type: string
 *                 maxLength: 500
 *                 example: 오늘 운동 완료! 30분 달리기
 *     responses:
 *       201:
 *         description: 성장앨범 사진 업로드 성공
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
 *                   example: 성장앨범 사진이 성공적으로 업로드되었습니다
 *                 data:
 *                   type: object
 *                   properties:
 *                     growthAlbum:
 *                       type: object
 *                       properties:
 *                         _id:
 *                           type: string
 *                           example: 507f1f77bcf86cd799439012
 *                         taskId:
 *                           type: string
 *                           example: 507f1f77bcf86cd799439011
 *                         imageUrl:
 *                           type: string
 *                           example: /uploads/growth-albums/image_123.jpg
 *                         memo:
 *                           type: string
 *                           example: 오늘 운동 완료!
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *       400:
 *         description: 잘못된 요청 (이미지 누락 등)
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
router.post('/:taskId/growth-album', authenticateToken, upload, processImage, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { taskId } = req.params;
    const { memo } = req.body;
    const imageInfo = req.imageInfo;
    
    logger.info(`성장앨범 사진 업로드 요청`, { 
      userId, 
      taskId, 
      hasImage: !!imageInfo,
      memo: memo ? memo.substring(0, 50) : null
    });

    if (!imageInfo) {
      logger.warn('성장앨범 업로드 실패 - 이미지 누락', { userId, taskId });
      return res.status(400).json({
        success: false,
        message: '업로드할 이미지를 선택해주세요.'
      });
    }

    const growthAlbum = await taskService.createGrowthAlbum(userId, taskId, {
      imageUrl: imageInfo.originalUrl,
      thumbnailUrl: imageInfo.thumbnailUrl,
      imagePath: imageInfo.originalPath,
      thumbnailPath: imageInfo.thumbnailPath,
      imageSize: imageInfo.fileSize,
      imageType: imageInfo.mimeType,
      memo: memo || ''
    });

    logger.info(`성장앨범 업로드 완료`, { 
      userId, 
      taskId, 
      albumId: growthAlbum._id,
      imageUrl: growthAlbum.imageUrl
    });

    res.status(201).json({
      success: true,
      message: '성장앨범 사진이 성공적으로 업로드되었습니다.',
      data: { growthAlbum }
    });

  } catch (error) {
    logger.error('성장앨범 업로드 실패', { 
      error: error.message, 
      stack: error.stack,
      userId: req.user?.userId,
      taskId: req.params.taskId
    });
    
    res.status(500).json({
      success: false,
      message: '성장앨범 업로드에 실패했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}, handleUploadError);

/**
 * @swagger
 * /api/task/growth-album/list:
 *   get:
 *     summary: 성장앨범 목록 조회 (날짜별 또는 카테고리별)
 *     tags: [Task]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         required: false
 *         description: 조회 타입 (calendar 또는 category)
 *         schema:
 *           type: string
 *           enum: [calendar, category]
 *           default: calendar
 *       - in: query
 *         name: year
 *         required: false
 *         description: 조회할 연도 (type이 calendar일 때)
 *         schema:
 *           type: integer
 *           example: 2025
 *       - in: query
 *         name: month
 *         required: false
 *         description: 조회할 월 (type이 calendar일 때)
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 12
 *           example: 1
 *       - in: query
 *         name: category
 *         required: false
 *         description: 카테고리 ID (type이 category일 때)
 *         schema:
 *           type: string
 *           example: 507f1f77bcf86cd799439011
 *     responses:
 *       200:
 *         description: 성장앨범 목록 조회 성공
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
 *                   example: 성장앨범 목록 조회 성공
 *                 data:
 *                   type: object
 *                   properties:
 *                     albums:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           taskId:
 *                             type: string
 *                           imageUrl:
 *                             type: string
 *                           memo:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           task:
 *                             $ref: '#/components/schemas/Task'
 *                     totalCount:
 *                       type: integer
 *                       example: 15
 *                     queryInfo:
 *                       type: object
 *                       properties:
 *                         type:
 *                           type: string
 *                         year:
 *                           type: integer
 *                         month:
 *                           type: integer
 *                         category:
 *                           type: string
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
router.get('/growth-album/list', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { type = 'calendar', year, month, category } = req.query;
    
    logger.info(`성장앨범 목록 조회 요청`, { 
      userId, 
      type, 
      year: year ? parseInt(year) : null, 
      month: month ? parseInt(month) : null,
      category
    });

    let albums;
    if (type === 'calendar' && year && month) {
      albums = await taskService.getGrowthAlbumsByMonth(userId, parseInt(year), parseInt(month));
    } else if (type === 'category' && category) {
      albums = await taskService.getGrowthAlbumsByCategory(userId, category);
    } else {
      albums = await taskService.getAllGrowthAlbums(userId);
    }

    logger.info(`성장앨범 목록 조회 완료`, { 
      userId, 
      type, 
      albumCount: albums.length 
    });

    res.status(200).json({
      success: true,
      message: '성장앨범 목록 조회 성공',
      data: { 
        albums,
        type,
        filters: { year, month, category }
      }
    });

  } catch (error) {
    logger.error('성장앨범 목록 조회 실패', { 
      error: error.message, 
      stack: error.stack,
      userId: req.user?.userId,
      query: req.query
    });
    
    res.status(500).json({
      success: false,
      message: '성장앨범 목록을 불러오는데 실패했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
