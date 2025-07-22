/**
 * Task 관리 및 성장앨범 API 라우터
 * 캘린더 형태의 할일 관리와 사진 연동 성장앨범 기능
 * 
 * 기능:
 * - 캘린더 형태 Task 관리 (날짜별 조회)
 * - 카테고리별 색상 구분 시스템
 * - 성장앨범 연동 (Task 완료 시 사진 업로드)
 * - 매일 반복 Task 지원
 * - 하루 전체 완료 시 코인 지급 (Premium 전용)
 */

const express = require('express');
const router = express.Router();
const { authenticateToken, premiumMiddleware } = require('../middleware/auth');
const { upload, processImage, handleUploadError } = require('../middleware/upload');
const taskService = require('../services/taskService');
const coinService = require('../services/coinService');
const logger = require('../utils/logger');

// =========================
// Task 캘린더 조회 API
// =========================

/**
 * GET /api/tasks?date=YYYY-MM-DD
 * 특정 날짜의 Task 목록 조회 (캘린더형 리스트)
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

    if (!date) {
      logger.warn('Task 조회 실패 - 날짜 파라미터 누락', { userId });
      return res.status(400).json({
        success: false,
        message: '날짜 파라미터가 필요합니다. (YYYY-MM-DD 형식)'
      });
    }

    // 날짜별 Task 목록 조회 (카테고리 정보 포함)
    const tasks = await taskService.getTasksByDate(userId, date);
    
    logger.info(`특정 날짜 Task 조회 완료`, { 
      userId, 
      date, 
      taskCount: tasks.length 
    });

    res.status(200).json({
      success: true,
      message: `${date} 날짜의 Task 조회 성공`,
      data: {
        date,
        tasks,
        totalCount: tasks.length,
        completedCount: tasks.filter(task => task.isCompleted).length
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
 * GET /api/tasks/calendar/{year}/{month}
 * 캘린더용 월별 Task 데이터 조회 (날짜별 Task 존재 여부 + 색상 정보)
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

    // 연도/월 유효성 검증
    const yearNum = parseInt(year);
    const monthNum = parseInt(month);
    
    if (!yearNum || !monthNum || monthNum < 1 || monthNum > 12) {
      logger.warn('캘린더 조회 실패 - 잘못된 파라미터', { userId, year, month });
      return res.status(400).json({
        success: false,
        message: '올바른 연도와 월을 입력해주세요.'
      });
    }

    const calendarData = await taskService.getCalendarData(userId, yearNum, monthNum);
    
    logger.info(`캘린더 데이터 조회 완료`, { 
      userId, 
      year, 
      month, 
      daysWithTasks: Object.keys(calendarData.tasksByDate).length 
    });

    res.status(200).json({
      success: true,
      message: `${year}년 ${month}월 캘린더 데이터 조회 성공`,
      data: {
        year: yearNum,
        month: monthNum,
        tasksByDate: calendarData.tasksByDate, // 날짜별 Task 목록
        dailySummary: calendarData.dailySummary, // 날짜별 완료/전체 개수
        categoryColors: calendarData.categoryColors // 카테고리별 색상 매핑
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

// =========================
// Task CRUD API
// =========================

/**
 * POST /api/tasks
 * 새 Task 생성 (카테고리, 반복, 성장앨범 옵션 포함)
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const taskData = req.body;
    
    logger.info(`Task 생성 요청`, { 
      userId, 
      taskTitle: taskData.title,
      categoryId: taskData.categoryId,
      date: taskData.date,
      repeat: taskData.repeat,
      growthAlbum: taskData.growthAlbum
    });

    // 입력값 검증
    if (!taskData.title || !taskData.date) {
      logger.warn('Task 생성 실패 - 필수 정보 누락', { userId, taskData });
      return res.status(400).json({
        success: false,
        message: 'Task 제목과 날짜는 필수 항목입니다.'
      });
    }

    const newTask = await taskService.createTask(userId, {
      title: taskData.title,
      date: taskData.date,
      categoryId: taskData.categoryId, // 카테고리 ID
      repeat: taskData.repeat || false, // 매일 반복 여부
      growthAlbum: taskData.growthAlbum || false, // 성장앨범 연동 여부
      notes: taskData.notes || ''
    });
    
    logger.info(`Task 생성 완료`, { 
      userId, 
      taskId: newTask._id,
      title: newTask.title,
      categoryId: newTask.categoryId
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
 * PATCH /api/tasks/{id}
 * Task 수정 (제목, 카테고리, 반복, 성장앨범 옵션 등)
 */
router.patch('/:taskId', authenticateToken, async (req, res) => {
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
 * DELETE /api/tasks/{id}
 * Task 삭제 (반복 Task 처리 포함)
 */
router.delete('/:taskId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { taskId } = req.params;
    const { deleteAll } = req.query; // 반복 Task 전체 삭제 여부
    
    logger.info(`Task 삭제 요청`, { 
      userId, 
      taskId, 
      deleteAll: deleteAll === 'true'
    });

    const result = await taskService.deleteTask(userId, taskId, deleteAll === 'true');
    
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
        deletedAll: deleteAll === 'true'
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
// Task 완료 처리 API
// =========================

/**
 * PUT /api/tasks/{id}/complete
 * Task 완료 처리 + 하루 전체 완료 시 코인 지급 (Premium)
 */
router.put('/:taskId/complete', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { taskId } = req.params;
    
    logger.info(`Task 완료 처리 요청`, { userId, taskId });

    const result = await taskService.completeTask(userId, taskId);
    
    if (!result.success) {
      logger.warn('Task 완료 처리 실패 - 존재하지 않음', { userId, taskId });
      return res.status(404).json({
        success: false,
        message: '완료 처리하려는 Task를 찾을 수 없습니다.'
      });
    }

    // Premium 사용자 && 하루 전체 Task 완료 시 코인 지급
    let coinReward = null;
    if (req.user.subscriptionType === 'premium' && result.allTasksCompleted) {
      try {
        coinReward = await coinService.awardCoins(userId, 'daily_tasks', '하루 전체 Task 완료');
        logger.info(`하루 전체 Task 완료 코인 지급`, { 
          userId, 
          coins: coinReward.amount,
          date: result.date
        });
      } catch (coinError) {
        logger.error('코인 지급 실패', { 
          error: coinError.message, 
          userId, 
          reason: 'daily_tasks'
        });
      }
    }

    logger.info(`Task 완료 처리 완료`, { 
      userId, 
      taskId, 
      allCompleted: result.allTasksCompleted,
      coinReward: coinReward?.amount || 0
    });

    res.status(200).json({
      success: true,
      message: 'Task가 완료되었습니다.',
      data: { 
        task: result.task,
        allTasksCompleted: result.allTasksCompleted,
        coinReward: coinReward,
        needsGrowthAlbumPhoto: result.task.growthAlbum // 성장앨범 사진 업로드 필요 여부
      }
    });

  } catch (error) {
    logger.error('Task 완료 처리 실패', { 
      error: error.message, 
      stack: error.stack,
      userId: req.user?.userId,
      taskId: req.params.taskId
    });
    
    res.status(500).json({
      success: false,
      message: 'Task 완료 처리에 실패했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// =========================
// 카테고리 관리 API
// =========================

/**
 * GET /api/categories
 * 사용자의 카테고리 목록 조회 (색상 정보 포함)
 */
router.get('/categories', authenticateToken, async (req, res) => {
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
 * POST /api/categories
 * 새 카테고리 생성 (이름 + 색상)
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
 * POST /api/albums
 * Task 완료 후 사진 업로드 (성장앨범 연동)
 */
router.post('/albums', authenticateToken, upload, processImage, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { taskId, memo } = req.body;
    const imageInfo = req.imageInfo;
    
    logger.info(`성장앨범 사진 업로드 요청`, { 
      userId, 
      taskId, 
      hasImage: !!imageInfo,
      memo: memo ? memo.substring(0, 50) : null
    });

    if (!taskId || !imageInfo) {
      logger.warn('성장앨범 업로드 실패 - 필수 정보 누락', { userId, taskId, hasImage: !!imageInfo });
      return res.status(400).json({
        success: false,
        message: 'Task ID와 업로드할 이미지가 필요합니다.'
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
      body: req.body
    });
    
    res.status(500).json({
      success: false,
      message: '성장앨범 업로드에 실패했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}, handleUploadError);

/**
 * GET /api/albums?view=calendar|category
 * 성장앨범 목록 조회 (캘린더형 또는 카테고리별)
 */
router.get('/albums', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { view = 'calendar', year, month, categoryId } = req.query;
    
    logger.info(`성장앨범 목록 조회 요청`, { 
      userId, 
      view, 
      year: year ? parseInt(year) : null, 
      month: month ? parseInt(month) : null,
      categoryId
    });

    let albums;
    if (view === 'calendar' && year && month) {
      // 캘린더형 보기: 특정 월의 앨범 조회
      albums = await taskService.getGrowthAlbumsByMonth(userId, parseInt(year), parseInt(month));
    } else if (view === 'category' && categoryId) {
      // 카테고리별 보기: 특정 카테고리의 앨범 조회  
      albums = await taskService.getGrowthAlbumsByCategory(userId, categoryId);
    } else if (view === 'category') {
      // 카테고리별 전체 보기: 카테고리별로 그룹화된 앨범 조회
      albums = await taskService.getGrowthAlbumsByAllCategories(userId);
    } else {
      // 전체 앨범 조회 (최신 순)
      albums = await taskService.getAllGrowthAlbums(userId);
    }

    logger.info(`성장앨범 목록 조회 완료`, { 
      userId, 
      view, 
      albumCount: Array.isArray(albums) ? albums.length : Object.keys(albums).length
    });

    res.status(200).json({
      success: true,
      message: '성장앨범 목록 조회 성공',
      data: { 
        view,
        albums,
        filters: { year, month, categoryId }
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
