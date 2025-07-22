/**
 * 카테고리 관리 API 라우터
 * Task 색상 구분 및 분류를 위한 카테고리 CRUD
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const Category = require('../models/Category');
const logger = require('../utils/logger');

/**
 * GET /api/categories
 * 사용자 카테고리 목록 조회
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    
    logger.info('카테고리 목록 조회 요청', { userId });

    const categories = await Category.getUserCategories(userId);
    
    logger.info('카테고리 목록 조회 성공', { 
      userId, 
      categoryCount: categories.length 
    });

    res.json({
      success: true,
      message: '카테고리 목록 조회 성공',
      data: {
        categories: categories.map(category => ({
          id: category._id,
          name: category.name,
          color: category.color,
          isDefault: category.isDefault,
          taskCount: category.taskCount,
          completionRate: category.completionRate,
          order: category.order
        }))
      }
    });

  } catch (error) {
    logger.error('카테고리 목록 조회 실패', { 
      error: error.message, 
      userId: req.user?.id 
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
 * 새 카테고리 생성
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    const { name, color } = req.body;
    
    logger.info('카테고리 생성 요청', { userId, name, color });

    // 입력값 검증
    if (!name || !color) {
      logger.warn('카테고리 생성 실패 - 필수 정보 누락', { userId, name, color });
      return res.status(400).json({
        success: false,
        message: '카테고리 이름과 색상은 필수 항목입니다.'
      });
    }

    // 이름 중복 확인
    const existingCategory = await Category.findOne({ userId, name: name.trim() });
    if (existingCategory) {
      logger.warn('카테고리 생성 실패 - 이름 중복', { userId, name });
      return res.status(400).json({
        success: false,
        message: '이미 존재하는 카테고리 이름입니다.'
      });
    }

    // 카테고리 생성
    const category = new Category({
      userId,
      name: name.trim(),
      color: color.trim(),
      order: await Category.countDocuments({ userId }) // 마지막 순서로 추가
    });

    await category.save();
    
    logger.info('카테고리 생성 성공', { 
      userId, 
      categoryId: category._id,
      name: category.name 
    });

    res.status(201).json({
      success: true,
      message: '카테고리가 성공적으로 생성되었습니다.',
      data: {
        category: {
          id: category._id,
          name: category.name,
          color: category.color,
          isDefault: category.isDefault,
          order: category.order
        }
      }
    });

  } catch (error) {
    logger.error('카테고리 생성 실패', { 
      error: error.message, 
      userId: req.user?.id,
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
 * PATCH /api/categories/{id}
 * 카테고리 수정
 */
router.patch('/:categoryId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    const { categoryId } = req.params;
    const { name, color, order } = req.body;
    
    logger.info('카테고리 수정 요청', { userId, categoryId, name, color, order });

    const category = await Category.findOne({ _id: categoryId, userId });
    if (!category) {
      logger.warn('카테고리 수정 실패 - 존재하지 않음', { userId, categoryId });
      return res.status(404).json({
        success: false,
        message: '수정하려는 카테고리를 찾을 수 없습니다.'
      });
    }

    // 기본 카테고리 이름 변경 방지
    if (category.isDefault && name && name !== category.name) {
      logger.warn('카테고리 수정 실패 - 기본 카테고리 이름 변경 시도', { userId, categoryId });
      return res.status(400).json({
        success: false,
        message: '기본 카테고리의 이름은 변경할 수 없습니다.'
      });
    }

    // 이름 중복 확인 (자신 제외)
    if (name && name !== category.name) {
      const existingCategory = await Category.findOne({ 
        userId, 
        name: name.trim(), 
        _id: { $ne: categoryId } 
      });
      if (existingCategory) {
        logger.warn('카테고리 수정 실패 - 이름 중복', { userId, name });
        return res.status(400).json({
          success: false,
          message: '이미 존재하는 카테고리 이름입니다.'
        });
      }
    }

    // 수정 사항 적용
    if (name) category.name = name.trim();
    if (color) category.color = color.trim();
    if (typeof order === 'number') {
      await category.updateOrder(order);
    } else {
      await category.save();
    }
    
    logger.info('카테고리 수정 성공', { 
      userId, 
      categoryId,
      name: category.name 
    });

    res.json({
      success: true,
      message: '카테고리가 성공적으로 수정되었습니다.',
      data: {
        category: {
          id: category._id,
          name: category.name,
          color: category.color,
          isDefault: category.isDefault,
          order: category.order
        }
      }
    });

  } catch (error) {
    logger.error('카테고리 수정 실패', { 
      error: error.message, 
      userId: req.user?.id,
      categoryId: req.params.categoryId,
      requestBody: req.body
    });
    
    res.status(500).json({
      success: false,
      message: '카테고리 수정에 실패했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * DELETE /api/categories/{id}
 * 카테고리 삭제 (기본 카테고리 제외)
 */
router.delete('/:categoryId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    const { categoryId } = req.params;
    
    logger.info('카테고리 삭제 요청', { userId, categoryId });

    const category = await Category.findOne({ _id: categoryId, userId });
    if (!category) {
      logger.warn('카테고리 삭제 실패 - 존재하지 않음', { userId, categoryId });
      return res.status(404).json({
        success: false,
        message: '삭제하려는 카테고리를 찾을 수 없습니다.'
      });
    }

    // 기본 카테고리 삭제 방지
    if (category.isDefault) {
      logger.warn('카테고리 삭제 실패 - 기본 카테고리 삭제 시도', { userId, categoryId });
      return res.status(400).json({
        success: false,
        message: '기본 카테고리는 삭제할 수 없습니다.'
      });
    }

    await category.deleteOne();
    
    logger.info('카테고리 삭제 성공', { 
      userId, 
      categoryId,
      name: category.name 
    });

    res.json({
      success: true,
      message: '카테고리가 성공적으로 삭제되었습니다.',
      data: {
        deletedCategory: {
          id: category._id,
          name: category.name
        }
      }
    });

  } catch (error) {
    logger.error('카테고리 삭제 실패', { 
      error: error.message, 
      userId: req.user?.id,
      categoryId: req.params.categoryId
    });
    
    res.status(500).json({
      success: false,
      message: '카테고리 삭제에 실패했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
