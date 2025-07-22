/**
 * Task 서비스 (PDF 기획서 기반 개선)
 * 캘린더 형태, 카테고리별 색상, 성장앨범 연동, 코인 지급 시스템
 */

const Task = require('../models/Task');
const Category = require('../models/Category');
const GrowthAlbum = require('../models/GrowthAlbum');
const logger = require('../utils/logger');
const mongoose = require('mongoose');

class TaskService {
  /**
   * 날짜별 Task 목록 조회 (카테고리 정보 포함)
   * GET /api/tasks?date=YYYY-MM-DD
   */
  async getTasksByDate(userId, date) {
    try {
      logger.info(`날짜별 Task 조회`, { userId, date });

      const tasks = await Task.getTasksByDate(userId, date);
      
      logger.info(`날짜별 Task 조회 완료`, { 
        userId, 
        date, 
        taskCount: tasks.length 
      });

      return tasks;
    } catch (error) {
      logger.error('날짜별 Task 조회 실패', { 
        error: error.message, 
        userId, 
        date 
      });
      throw error;
    }
  }

  /**
   * 캘린더용 월별 데이터 조회
   * GET /api/tasks/calendar/{year}/{month}
   */
  async getCalendarData(userId, year, month) {
    try {
      logger.info(`캘린더 데이터 조회`, { userId, year, month });

      // 월별 Task 조회
      const tasks = await Task.getMonthlyTasks(userId, year, month);
      
      // 카테고리 색상 정보 조회
      const categories = await Category.find({ userId }).select('name color');
      const categoryColors = {};
      categories.forEach(cat => {
        categoryColors[cat._id.toString()] = {
          name: cat.name,
          color: cat.color
        };
      });

      // 날짜별로 그룹화
      const tasksByDate = {};
      const dailySummary = {};

      tasks.forEach(task => {
        const dateKey = task.formattedDate; // YYYY-MM-DD
        
        if (!tasksByDate[dateKey]) {
          tasksByDate[dateKey] = [];
          dailySummary[dateKey] = { total: 0, completed: 0 };
        }
        
        tasksByDate[dateKey].push(task);
        dailySummary[dateKey].total++;
        
        if (task.isCompleted) {
          dailySummary[dateKey].completed++;
        }
      });

      logger.info(`캘린더 데이터 조회 완료`, { 
        userId, 
        year, 
        month, 
        daysWithTasks: Object.keys(tasksByDate).length,
        totalTasks: tasks.length
      });

      return {
        tasksByDate,
        dailySummary,
        categoryColors
      };
    } catch (error) {
      logger.error('캘린더 데이터 조회 실패', { 
        error: error.message, 
        userId, 
        year, 
        month 
      });
      throw error;
    }
  }

  /**
   * Task 생성
   * POST /api/tasks
   */
  async createTask(userId, taskData) {
    try {
      logger.info(`Task 생성 요청`, { userId, title: taskData.title });

      const {
        title,
        date,
        categoryId,
        repeat = false,
        growthAlbum = false,
        notes = ''
      } = taskData;

      // 카테고리 확인 (없으면 기본 카테고리 사용)
      let category;
      if (categoryId) {
        category = await Category.findOne({ _id: categoryId, userId });
        if (!category) {
          throw new Error('유효하지 않은 카테고리입니다.');
        }
      } else {
        // 기본 카테고리 조회 또는 생성
        category = await Category.findOne({ userId, name: '일상' });
        if (!category) {
          category = new Category({
            userId,
            name: '일상',
            color: '#9E9E9E' // 기본 회색
          });
          await category.save();
        }
      }

      // Task 생성
      const task = new Task({
        userId,
        categoryId: category._id,
        title: title.trim(),
        date: new Date(date),
        isRepeating: repeat,
        repeatType: repeat ? 'daily' : null,
        hasGrowthAlbum: growthAlbum,
        growthAlbumRequired: growthAlbum,
        notes: notes.trim(),
        color: category.color
      });

      await task.save();

      // 반복 설정이 있으면 반복 Task 생성
      if (repeat) {
        const endDate = new Date(date);
        endDate.setMonth(endDate.getMonth() + 1); // 1개월간 반복
        await Task.createRepeatingTasks(task, endDate);
      }

      // populate하여 카테고리 정보 포함
      await task.populate('categoryId', 'name color');

      logger.info(`Task 생성 완료`, { 
        userId, 
        taskId: task._id,
        title: task.title,
        category: category.name,
        repeat,
        growthAlbum
      });

      return task;
    } catch (error) {
      logger.error('Task 생성 실패', { 
        error: error.message, 
        userId, 
        taskData 
      });
      throw error;
    }
  }

  /**
   * Task 수정
   * PATCH /api/tasks/{id}
   */
  async updateTask(userId, taskId, updateData) {
    try {
      logger.info(`Task 수정 요청`, { userId, taskId, updateData });

      const task = await Task.findOne({ _id: taskId, userId });
      if (!task) {
        return null;
      }

      // 업데이트 가능한 필드들
      const allowedFields = ['title', 'categoryId', 'notes', 'growthAlbum', 'repeat'];
      const updates = {};

      allowedFields.forEach(field => {
        if (updateData[field] !== undefined) {
          if (field === 'categoryId') {
            updates.categoryId = updateData.categoryId;
          } else if (field === 'repeat') {
            updates.isRepeating = updateData.repeat;
            updates.repeatType = updateData.repeat ? 'daily' : null;
          } else if (field === 'growthAlbum') {
            updates.hasGrowthAlbum = updateData.growthAlbum;
            updates.growthAlbumRequired = updateData.growthAlbum;
          } else {
            updates[field] = updateData[field];
          }
        }
      });

      // 카테고리가 변경되면 색상도 업데이트
      if (updates.categoryId) {
        const category = await Category.findOne({ _id: updates.categoryId, userId });
        if (category) {
          updates.color = category.color;
        }
      }

      Object.assign(task, updates);
      await task.save();
      await task.populate('categoryId', 'name color');

      logger.info(`Task 수정 완료`, { 
        userId, 
        taskId, 
        updatedFields: Object.keys(updates)
      });

      return task;
    } catch (error) {
      logger.error('Task 수정 실패', { 
        error: error.message, 
        userId, 
        taskId, 
        updateData 
      });
      throw error;
    }
  }

  /**
   * Task 삭제 (반복 Task 처리 포함)
   * DELETE /api/tasks/{id}
   */
  async deleteTask(userId, taskId, deleteAll = false) {
    try {
      logger.info(`Task 삭제 요청`, { userId, taskId, deleteAll });

      const task = await Task.findOne({ _id: taskId, userId });
      if (!task) {
        return { success: false };
      }

      let deletedCount = 0;

      if (deleteAll && task.isRepeating) {
        // 반복 Task 전체 삭제
        const deleteResult = await Task.deleteMany({ 
          $or: [
            { _id: taskId },
            { originalTaskId: taskId }
          ],
          userId 
        });
        deletedCount = deleteResult.deletedCount;
      } else {
        // 단일 Task 삭제
        await task.deleteOne();
        deletedCount = 1;
      }

      logger.info(`Task 삭제 완료`, { 
        userId, 
        taskId, 
        deletedCount 
      });

      return { success: true, deletedCount };
    } catch (error) {
      logger.error('Task 삭제 실패', { 
        error: error.message, 
        userId, 
        taskId 
      });
      throw error;
    }
  }

  /**
   * Task 완료 처리 + 하루 전체 완료 확인
   * PUT /api/tasks/{id}/complete
   */
  async completeTask(userId, taskId) {
    try {
      logger.info(`Task 완료 처리 요청`, { userId, taskId });

      const task = await Task.findOne({ _id: taskId, userId });
      if (!task) {
        return { success: false };
      }

      // Task 완료 처리
      task.isCompleted = true;
      task.completedAt = new Date();
      await task.save();
      await task.populate('categoryId', 'name color');

      // 같은 날짜의 모든 Task가 완료되었는지 확인
      const dateStr = task.formattedDate;
      const allTasksToday = await Task.find({
        userId,
        date: {
          $gte: new Date(dateStr + 'T00:00:00.000Z'),
          $lte: new Date(dateStr + 'T23:59:59.999Z')
        }
      });

      const allCompleted = allTasksToday.every(t => t.isCompleted);

      logger.info(`Task 완료 처리 완료`, { 
        userId, 
        taskId,
        date: dateStr,
        allTasksCompleted: allCompleted,
        totalTasks: allTasksToday.length
      });

      return { 
        success: true, 
        task, 
        allTasksCompleted: allCompleted,
        date: dateStr
      };
    } catch (error) {
      logger.error('Task 완료 처리 실패', { 
        error: error.message, 
        userId, 
        taskId 
      });
      throw error;
    }
  }

  /**
   * 사용자 카테고리 목록 조회
   * GET /api/categories
   */
  async getUserCategories(userId) {
    try {
      logger.info(`카테고리 목록 조회`, { userId });

      const categories = await Category.find({ userId })
        .sort({ createdAt: 1 })
        .select('name color taskCount completedTaskCount createdAt');

      // 기본 카테고리가 없으면 생성
      if (categories.length === 0) {
        const defaultCategory = new Category({
          userId,
          name: '일상',
          color: '#9E9E9E'
        });
        await defaultCategory.save();
        categories.push(defaultCategory);
      }

      logger.info(`카테고리 목록 조회 완료`, { 
        userId, 
        categoryCount: categories.length 
      });

      return categories;
    } catch (error) {
      logger.error('카테고리 목록 조회 실패', { 
        error: error.message, 
        userId 
      });
      throw error;
    }
  }

  /**
   * 카테고리 생성
   * POST /api/categories
   */
  async createCategory(userId, categoryData) {
    try {
      logger.info(`카테고리 생성 요청`, { userId, name: categoryData.name });

      const { name, color } = categoryData;

      // 중복 확인
      const existingCategory = await Category.findOne({ userId, name });
      if (existingCategory) {
        throw new Error('이미 같은 이름의 카테고리가 존재합니다.');
      }

      const category = new Category({
        userId,
        name: name.trim(),
        color
      });

      await category.save();

      logger.info(`카테고리 생성 완료`, { 
        userId, 
        categoryId: category._id,
        name: category.name,
        color: category.color
      });

      return category;
    } catch (error) {
      logger.error('카테고리 생성 실패', { 
        error: error.message, 
        userId, 
        categoryData 
      });
      throw error;
    }
  }

  /**
   * 카테고리 수정
   * PATCH /api/categories/{id}
   */
  async updateCategory(userId, categoryId, updateData) {
    try {
      logger.info(`카테고리 수정 요청`, { userId, categoryId, updateData });

      const category = await Category.findOne({ _id: categoryId, userId });
      if (!category) {
        return null;
      }

      // 업데이트 가능한 필드들
      if (updateData.name !== undefined) {
        category.name = updateData.name.trim();
      }
      if (updateData.color !== undefined) {
        category.color = updateData.color;
        
        // 해당 카테고리를 사용하는 모든 Task의 색상도 업데이트
        await Task.updateMany(
          { categoryId: categoryId, userId },
          { color: updateData.color }
        );
      }

      await category.save();

      logger.info(`카테고리 수정 완료`, { 
        userId, 
        categoryId,
        name: category.name,
        color: category.color
      });

      return category;
    } catch (error) {
      logger.error('카테고리 수정 실패', { 
        error: error.message, 
        userId, 
        categoryId, 
        updateData 
      });
      throw error;
    }
  }

  /**
   * 성장앨범 생성 (Task 완료 후 사진 업로드)
   * POST /api/albums
   */
  async createGrowthAlbum(userId, taskId, albumData) {
    try {
      logger.info(`성장앨범 생성 요청`, { userId, taskId });

      // Task 확인
      const task = await Task.findOne({ _id: taskId, userId });
      if (!task) {
        throw new Error('Task를 찾을 수 없습니다.');
      }

      if (!task.hasGrowthAlbum) {
        throw new Error('이 Task는 성장앨범이 연동되지 않았습니다.');
      }

      const {
        imageUrl,
        thumbnailUrl,
        imagePath,
        thumbnailPath,
        imageSize,
        imageType,
        memo = ''
      } = albumData;

      const growthAlbum = new GrowthAlbum({
        userId,
        taskId,
        categoryId: task.categoryId,
        title: task.title,
        imageUrl,
        thumbnailUrl,
        imagePath,
        thumbnailPath,
        imageSize,
        imageType,
        memo: memo.trim(),
        date: task.date
      });

      await growthAlbum.save();
      await growthAlbum.populate('categoryId', 'name color');

      logger.info(`성장앨범 생성 완료`, { 
        userId, 
        taskId,
        albumId: growthAlbum._id,
        imageUrl: growthAlbum.imageUrl
      });

      return growthAlbum;
    } catch (error) {
      logger.error('성장앨범 생성 실패', { 
        error: error.message, 
        userId, 
        taskId, 
        albumData 
      });
      throw error;
    }
  }

  /**
   * 성장앨범 목록 조회 - 월별
   */
  async getGrowthAlbumsByMonth(userId, year, month) {
    try {
      const startOfMonth = new Date(year, month - 1, 1);
      const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

      const albums = await GrowthAlbum.find({
        userId,
        date: { $gte: startOfMonth, $lte: endOfMonth }
      })
      .populate('categoryId', 'name color')
      .sort({ date: -1, createdAt: -1 })
      .select('title imageUrl thumbnailUrl memo date categoryId createdAt');

      return albums;
    } catch (error) {
      logger.error('월별 성장앨범 조회 실패', { error: error.message, userId, year, month });
      throw error;
    }
  }

  /**
   * 성장앨범 목록 조회 - 카테고리별
   */
  async getGrowthAlbumsByCategory(userId, categoryId) {
    try {
      const albums = await GrowthAlbum.find({ userId, categoryId })
        .populate('categoryId', 'name color')
        .sort({ createdAt: -1 })
        .select('title imageUrl thumbnailUrl memo date categoryId createdAt');

      return albums;
    } catch (error) {
      logger.error('카테고리별 성장앨범 조회 실패', { error: error.message, userId, categoryId });
      throw error;
    }
  }

  /**
   * 성장앨범 목록 조회 - 카테고리별 전체 (그룹화)
   */
  async getGrowthAlbumsByAllCategories(userId) {
    try {
      const albums = await GrowthAlbum.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        {
          $lookup: {
            from: 'categories',
            localField: 'categoryId',
            foreignField: '_id',
            as: 'category'
          }
        },
        { $unwind: '$category' },
        {
          $group: {
            _id: '$categoryId',
            categoryName: { $first: '$category.name' },
            categoryColor: { $first: '$category.color' },
            albums: {
              $push: {
                _id: '$_id',
                title: '$title',
                imageUrl: '$imageUrl',
                thumbnailUrl: '$thumbnailUrl',
                memo: '$memo',
                date: '$date',
                createdAt: '$createdAt'
              }
            },
            albumCount: { $sum: 1 },
            latestDate: { $max: '$createdAt' }
          }
        },
        { $sort: { latestDate: -1 } }
      ]);

      // 각 카테고리별로 최신순 정렬
      albums.forEach(category => {
        category.albums.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      });

      return albums;
    } catch (error) {
      logger.error('카테고리별 전체 성장앨범 조회 실패', { error: error.message, userId });
      throw error;
    }
  }

  /**
   * 전체 성장앨범 조회
   */
  async getAllGrowthAlbums(userId, limit = 50) {
    try {
      const albums = await GrowthAlbum.find({ userId })
        .populate('categoryId', 'name color')
        .sort({ createdAt: -1 })
        .limit(limit)
        .select('title imageUrl thumbnailUrl memo date categoryId createdAt');

      return albums;
    } catch (error) {
      logger.error('전체 성장앨범 조회 실패', { error: error.message, userId });
      throw error;
    }
  }
}

module.exports = new TaskService();
